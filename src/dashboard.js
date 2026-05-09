import { db } from './firebase.js';
import { ref, query, orderByChild, equalTo, startAt, endAt, get, update, remove, onValue } from 'firebase/database';
import { exportMonthlyReport } from './export.js';

let currentMonthlyPayments = [];
let currentMonthlyExpenses = [];
let pendingDeletePath = null;

const OLD_BUILDING_ROOMS = [1, 2, 3, 4, 5, 6, 7];
const NEW_BUILDING_ROOMS = [8, 9, 10, 11];

function formatCurrency(amount) {
  return 'Rs ' + amount.toLocaleString('en-IN');
}

function formatRoomNumbers(p) {
  if (p.roomNumbers && Array.isArray(p.roomNumbers)) {
    return p.roomNumbers.join(', ');
  }
  return p.rooms || '-';
}

function formatBuildings(p) {
  if (p.buildings && Array.isArray(p.buildings)) {
    return p.buildings.join(', ');
  }
  return '-';
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function snapshotToArray(snapshot) {
  const arr = [];
  if (snapshot.exists()) {
    snapshot.forEach(child => {
      arr.push({ id: child.key, ...child.val() });
    });
  }
  return arr;
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('dashboard-toast');
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// --- Action Buttons ---
function createActionCell(entryType, entryId, entry) {
  const td = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'actions-cell';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn-icon btn-icon-edit';
  editBtn.title = 'Edit';
  editBtn.innerHTML = '&#9998;';
  editBtn.addEventListener('click', () => openEditModal(entryType, entryId, entry));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-icon btn-icon-delete';
  deleteBtn.title = 'Delete';
  deleteBtn.innerHTML = '&#128465;';
  deleteBtn.addEventListener('click', () => openDeleteModal(entryType, entryId));

  wrap.append(editBtn, deleteBtn);
  td.appendChild(wrap);
  return td;
}

// --- Edit Modal ---
function openEditModal(entryType, entryId, entry) {
  const modal = document.getElementById('edit-modal');
  const titleEl = document.getElementById('edit-modal-title');
  document.getElementById('edit-id').value = entryId;
  document.getElementById('edit-type').value = entryType;

  const paymentFields = document.getElementById('edit-payment-fields');
  const expenseFields = document.getElementById('edit-expense-fields');

  if (entryType === 'payment') {
    titleEl.textContent = 'Edit Payment';
    paymentFields.classList.remove('hidden');
    expenseFields.classList.add('hidden');
    document.getElementById('edit-guest-name').value = entry.guestName || '';
    document.getElementById('edit-date').value = entry.date || '';
    document.getElementById('edit-amount').value = entry.amount || '';

    const editRoomCheckboxes = document.querySelectorAll('input[name="edit-rooms"]');
    editRoomCheckboxes.forEach(cb => {
      cb.checked = entry.roomNumbers && entry.roomNumbers.includes(parseInt(cb.value, 10));
    });
    updateEditBuildingToggles();
  } else {
    titleEl.textContent = 'Edit Expenditure';
    paymentFields.classList.add('hidden');
    expenseFields.classList.remove('hidden');
    document.getElementById('edit-expense-date').value = entry.date || '';
    document.getElementById('edit-description').value = entry.description || '';
    document.getElementById('edit-expense-amount').value = entry.amount || '';
  }

  modal.classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

function updateEditBuildingToggles() {
  const editRoomCheckboxes = document.querySelectorAll('input[name="edit-rooms"]');
  const oldCb = document.getElementById('edit-select-old-building');
  const newCb = document.getElementById('edit-select-new-building');

  const oldRooms = Array.from(editRoomCheckboxes).filter(cb => OLD_BUILDING_ROOMS.includes(parseInt(cb.value, 10)));
  const newRooms = Array.from(editRoomCheckboxes).filter(cb => NEW_BUILDING_ROOMS.includes(parseInt(cb.value, 10)));

  oldCb.checked = oldRooms.every(cb => cb.checked);
  oldCb.indeterminate = oldRooms.some(cb => cb.checked) && !oldCb.checked;
  newCb.checked = newRooms.every(cb => cb.checked);
  newCb.indeterminate = newRooms.some(cb => cb.checked) && !newCb.checked;
}

async function saveEdit(e) {
  e.preventDefault();
  const entryId = document.getElementById('edit-id').value;
  const entryType = document.getElementById('edit-type').value;

  try {
    if (entryType === 'payment') {
      const selectedRooms = [];
      document.querySelectorAll('input[name="edit-rooms"]').forEach(cb => {
        if (cb.checked) selectedRooms.push(parseInt(cb.value, 10));
      });
      const buildings = [];
      if (selectedRooms.some(r => OLD_BUILDING_ROOMS.includes(r))) buildings.push('Old Building');
      if (selectedRooms.some(r => NEW_BUILDING_ROOMS.includes(r))) buildings.push('New Building');

      await update(ref(db, `payments/${entryId}`), {
        guestName: document.getElementById('edit-guest-name').value.trim(),
        date: document.getElementById('edit-date').value,
        amount: parseFloat(document.getElementById('edit-amount').value),
        roomNumbers: selectedRooms,
        buildings: buildings,
        rooms: selectedRooms.length
      });
    } else {
      await update(ref(db, `expenditures/${entryId}`), {
        date: document.getElementById('edit-expense-date').value,
        description: document.getElementById('edit-description').value.trim(),
        amount: parseFloat(document.getElementById('edit-expense-amount').value)
      });
    }

    closeEditModal();
    showToast('Entry updated successfully!');
    refreshCurrentView();
  } catch (error) {
    console.error('Error updating entry:', error);
    showToast('Failed to update entry.', 'error');
  }
}

// --- Delete Modal ---
function openDeleteModal(entryType, entryId) {
  const collection = entryType === 'payment' ? 'payments' : 'expenditures';
  pendingDeletePath = `${collection}/${entryId}`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('delete-modal').classList.add('hidden');
  pendingDeletePath = null;
}

async function confirmDelete() {
  if (!pendingDeletePath) return;
  try {
    await remove(ref(db, pendingDeletePath));
    closeDeleteModal();
    showToast('Entry deleted.');
    refreshCurrentView();
  } catch (error) {
    console.error('Error deleting entry:', error);
    showToast('Failed to delete entry.', 'error');
  }
}

async function refreshCurrentView() {
  const activeTab = document.querySelector('.dashboard-tabs button.active');
  if (!activeTab) return;
  const tab = activeTab.dataset.tab;
  if (tab === 'daily') await loadDailyData();
  else if (tab === 'monthly') await loadMonthlyData();
  else if (tab === 'entries') await loadAllEntries();
  else if (tab === 'guest-search') {
    const input = document.getElementById('guest-search-input').value.trim();
    if (input) await searchGuest();
  }
}

function setDefaults() {
  const today = new Date().toISOString().split('T')[0];
  const month = today.substring(0, 7);
  document.getElementById('daily-date').value = today;
  document.getElementById('monthly-month').value = month;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  document.getElementById('filter-from').value = thirtyDaysAgo.toISOString().split('T')[0];
  document.getElementById('filter-to').value = today;
}

// --- Tab Management ---
const tabLoaded = { daily: false, monthly: false, entries: false };

function initTabs() {
  const tabs = document.querySelectorAll('.dashboard-tabs button');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

      const name = tab.dataset.tab;
      if (name === 'daily' && !tabLoaded.daily) { loadDailyData(); tabLoaded.daily = true; }
      if (name === 'monthly' && !tabLoaded.monthly) { loadMonthlyData(); tabLoaded.monthly = true; }
      if (name === 'entries' && !tabLoaded.entries) { loadAllEntries(); tabLoaded.entries = true; }
    });
  });
}

// --- Realtime Database Queries ---
async function getPaymentsForDate(dateStr) {
  const q = query(ref(db, 'payments'), orderByChild('date'), equalTo(dateStr));
  const snapshot = await get(q);
  return snapshotToArray(snapshot);
}

async function getExpensesForDate(dateStr) {
  const q = query(ref(db, 'expenditures'), orderByChild('date'), equalTo(dateStr));
  const snapshot = await get(q);
  return snapshotToArray(snapshot);
}

async function getPaymentsForMonth(yearMonth) {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split('-');
  const endDate = `${yearMonth}-${getDaysInMonth(parseInt(year), parseInt(month)).toString().padStart(2, '0')}`;
  const q = query(ref(db, 'payments'), orderByChild('date'), startAt(startDate), endAt(endDate));
  const snapshot = await get(q);
  return snapshotToArray(snapshot);
}

async function getExpensesForMonth(yearMonth) {
  const startDate = `${yearMonth}-01`;
  const [year, month] = yearMonth.split('-');
  const endDate = `${yearMonth}-${getDaysInMonth(parseInt(year), parseInt(month)).toString().padStart(2, '0')}`;
  const q = query(ref(db, 'expenditures'), orderByChild('date'), startAt(startDate), endAt(endDate));
  const snapshot = await get(q);
  return snapshotToArray(snapshot);
}

async function getFilteredEntries(type, fromDate, toDate) {
  let payments = [];
  let expenses = [];

  if (type === 'all' || type === 'payments') {
    const q = query(ref(db, 'payments'), orderByChild('date'), startAt(fromDate), endAt(toDate));
    const snapshot = await get(q);
    payments = snapshotToArray(snapshot).map(p => ({ ...p, type: 'payment' }));
  }

  if (type === 'all' || type === 'expenditures') {
    const q = query(ref(db, 'expenditures'), orderByChild('date'), startAt(fromDate), endAt(toDate));
    const snapshot = await get(q);
    expenses = snapshotToArray(snapshot).map(e => ({ ...e, type: 'expense' }));
  }

  const merged = [...payments, ...expenses];
  merged.sort((a, b) => b.date.localeCompare(a.date));
  return merged;
}

// --- Daily View ---
async function loadDailyData() {
  const dateStr = document.getElementById('daily-date').value;
  if (!dateStr) return;

  const loading = document.getElementById('daily-loading');
  const dataDiv = document.getElementById('daily-data');
  loading.classList.remove('hidden');
  dataDiv.classList.add('hidden');

  try {
    const [payments, expenses] = await Promise.all([
      getPaymentsForDate(dateStr),
      getExpensesForDate(dateStr)
    ]);

    const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const net = totalEarnings - totalExpenses;

    document.getElementById('daily-earnings').textContent = formatCurrency(totalEarnings);
    document.getElementById('daily-expenditures').textContent = formatCurrency(totalExpenses);

    const netEl = document.getElementById('daily-net');
    netEl.textContent = formatCurrency(net);
    netEl.className = 'card-value ' + (net >= 0 ? 'positive' : 'negative');

    const paymentsBody = document.getElementById('daily-payments-body');
    if (payments.length === 0) {
      paymentsBody.innerHTML = '<tr class="empty-row"><td colspan="5">No payments for this date</td></tr>';
    } else {
      paymentsBody.innerHTML = '';
      payments.forEach(p => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.textContent = p.guestName;
        const tdBuilding = document.createElement('td');
        tdBuilding.textContent = formatBuildings(p);
        const tdRooms = document.createElement('td');
        tdRooms.textContent = formatRoomNumbers(p);
        const tdAmount = document.createElement('td');
        tdAmount.textContent = formatCurrency(p.amount);
        tr.append(tdName, tdBuilding, tdRooms, tdAmount, createActionCell('payment', p.id, p));
        paymentsBody.appendChild(tr);
      });
    }

    const expensesBody = document.getElementById('daily-expenses-body');
    if (expenses.length === 0) {
      expensesBody.innerHTML = '<tr class="empty-row"><td colspan="3">No expenditures for this date</td></tr>';
    } else {
      expensesBody.innerHTML = '';
      expenses.forEach(e => {
        const tr = document.createElement('tr');
        const tdDesc = document.createElement('td');
        tdDesc.textContent = e.description;
        const tdAmount = document.createElement('td');
        tdAmount.textContent = formatCurrency(e.amount);
        tr.append(tdDesc, tdAmount, createActionCell('expense', e.id, e));
        expensesBody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading daily data:', error);
    showToast('Error loading data: ' + error.message, 'error');
  } finally {
    loading.classList.add('hidden');
    dataDiv.classList.remove('hidden');
  }
}

// --- Monthly Report ---
async function loadMonthlyData() {
  const yearMonth = document.getElementById('monthly-month').value;
  if (!yearMonth) return;

  const loading = document.getElementById('monthly-loading');
  const dataDiv = document.getElementById('monthly-data');
  loading.classList.remove('hidden');
  dataDiv.classList.add('hidden');

  try {
    const [payments, expenses] = await Promise.all([
      getPaymentsForMonth(yearMonth),
      getExpensesForMonth(yearMonth)
    ]);

    currentMonthlyPayments = payments;
    currentMonthlyExpenses = expenses;

    const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const net = totalEarnings - totalExpenses;

    document.getElementById('monthly-earnings').textContent = formatCurrency(totalEarnings);
    document.getElementById('monthly-expenditures').textContent = formatCurrency(totalExpenses);

    const netEl = document.getElementById('monthly-net');
    netEl.textContent = formatCurrency(net);
    netEl.className = 'card-value ' + (net >= 0 ? 'positive' : 'negative');

    renderChart(payments, expenses, yearMonth);

    const paymentsBody = document.getElementById('monthly-payments-body');
    if (payments.length === 0) {
      paymentsBody.innerHTML = '<tr class="empty-row"><td colspan="6">No payments this month</td></tr>';
    } else {
      paymentsBody.innerHTML = '';
      payments.forEach(p => {
        const tr = document.createElement('tr');
        const tdDate = document.createElement('td');
        tdDate.textContent = p.date;
        const tdName = document.createElement('td');
        tdName.textContent = p.guestName;
        const tdBuilding = document.createElement('td');
        tdBuilding.textContent = formatBuildings(p);
        const tdRooms = document.createElement('td');
        tdRooms.textContent = formatRoomNumbers(p);
        const tdAmount = document.createElement('td');
        tdAmount.textContent = formatCurrency(p.amount);
        tr.append(tdDate, tdName, tdBuilding, tdRooms, tdAmount, createActionCell('payment', p.id, p));
        paymentsBody.appendChild(tr);
      });
    }

    const expensesBody = document.getElementById('monthly-expenses-body');
    if (expenses.length === 0) {
      expensesBody.innerHTML = '<tr class="empty-row"><td colspan="4">No expenditures this month</td></tr>';
    } else {
      expensesBody.innerHTML = '';
      expenses.forEach(e => {
        const tr = document.createElement('tr');
        const tdDate = document.createElement('td');
        tdDate.textContent = e.date;
        const tdDesc = document.createElement('td');
        tdDesc.textContent = e.description;
        const tdAmount = document.createElement('td');
        tdAmount.textContent = formatCurrency(e.amount);
        tr.append(tdDate, tdDesc, tdAmount, createActionCell('expense', e.id, e));
        expensesBody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading monthly data:', error);
  } finally {
    loading.classList.add('hidden');
    dataDiv.classList.remove('hidden');
  }
}

// --- Bar Chart ---
function renderChart(payments, expenses, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = getDaysInMonth(year, month);
  const chartRows = document.getElementById('chart-rows');

  const dailyEarnings = {};
  const dailyExpenses = {};

  payments.forEach(p => {
    const day = parseInt(p.date.split('-')[2], 10);
    dailyEarnings[day] = (dailyEarnings[day] || 0) + p.amount;
  });

  expenses.forEach(e => {
    const day = parseInt(e.date.split('-')[2], 10);
    dailyExpenses[day] = (dailyExpenses[day] || 0) + e.amount;
  });

  let maxVal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    maxVal = Math.max(maxVal, dailyEarnings[d] || 0, dailyExpenses[d] || 0);
  }

  chartRows.innerHTML = '';

  for (let d = 1; d <= daysInMonth; d++) {
    const earning = dailyEarnings[d] || 0;
    const expense = dailyExpenses[d] || 0;

    if (earning === 0 && expense === 0) continue;

    const row = document.createElement('div');
    row.className = 'chart-row';

    const dayLabel = document.createElement('span');
    dayLabel.className = 'chart-day';
    dayLabel.textContent = d;

    const barsContainer = document.createElement('div');
    barsContainer.className = 'chart-bars';

    const earningBar = document.createElement('div');
    earningBar.className = 'chart-bar earnings';
    earningBar.style.width = maxVal > 0 ? (earning / maxVal * 100) + '%' : '0%';
    earningBar.title = 'Earnings: ' + formatCurrency(earning);

    const expenseBar = document.createElement('div');
    expenseBar.className = 'chart-bar expenses';
    expenseBar.style.width = maxVal > 0 ? (expense / maxVal * 100) + '%' : '0%';
    expenseBar.title = 'Expenses: ' + formatCurrency(expense);

    barsContainer.append(earningBar, expenseBar);
    row.append(dayLabel, barsContainer);
    chartRows.appendChild(row);
  }

  if (chartRows.children.length === 0) {
    chartRows.innerHTML = '<p class="text-center" style="padding: 20px; color: var(--text-light);">No data for this month</p>';
  }
}

// --- All Entries ---
async function loadAllEntries() {
  const type = document.getElementById('filter-type').value;
  const fromDate = document.getElementById('filter-from').value;
  const toDate = document.getElementById('filter-to').value;

  if (!fromDate || !toDate) return;

  const loading = document.getElementById('entries-loading');
  loading.classList.remove('hidden');

  try {
    const entries = await getFilteredEntries(type, fromDate, toDate);
    const tbody = document.getElementById('entries-body');

    if (entries.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No entries found</td></tr>';
    } else {
      tbody.innerHTML = '';
      entries.forEach(entry => {
        const tr = document.createElement('tr');

        const tdType = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = entry.type === 'payment' ? 'badge badge-payment' : 'badge badge-expense';
        badge.textContent = entry.type === 'payment' ? 'Payment' : 'Expense';
        tdType.appendChild(badge);

        const tdDesc = document.createElement('td');
        tdDesc.textContent = entry.type === 'payment' ? entry.guestName : entry.description;

        const tdBuilding = document.createElement('td');
        tdBuilding.textContent = entry.type === 'payment' ? formatBuildings(entry) : '-';

        const tdRooms = document.createElement('td');
        tdRooms.textContent = entry.type === 'payment' ? formatRoomNumbers(entry) : '-';

        const tdAmount = document.createElement('td');
        tdAmount.textContent = formatCurrency(entry.amount);

        const tdDate = document.createElement('td');
        tdDate.textContent = entry.date;

        const entryType = entry.type === 'payment' ? 'payment' : 'expense';
        tr.append(tdType, tdDesc, tdBuilding, tdRooms, tdAmount, tdDate, createActionCell(entryType, entry.id, entry));
        tbody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading entries:', error);
  } finally {
    loading.classList.add('hidden');
  }
}

// --- Guest Search ---
async function searchGuest() {
  const searchTerm = document.getElementById('guest-search-input').value.trim().toLowerCase();
  if (!searchTerm) {
    showToast('Please enter a guest name to search.', 'error');
    return;
  }

  const loading = document.getElementById('guest-search-loading');
  const resultsDiv = document.getElementById('guest-search-results');
  loading.classList.remove('hidden');

  try {
    const [paymentsSnap, bookingsSnap] = await Promise.all([
      get(ref(db, 'payments')),
      get(ref(db, 'bookings'))
    ]);
    const allPayments = snapshotToArray(paymentsSnap);
    const allBookings = snapshotToArray(bookingsSnap);

    const matches = allPayments.filter(p =>
      p.guestName && p.guestName.toLowerCase().includes(searchTerm)
    );

    const bookingMatches = allBookings.filter(b =>
      b.guestName && b.guestName.toLowerCase().includes(searchTerm)
    );

    matches.sort((a, b) => b.date.localeCompare(a.date));

    const summaryDiv = document.getElementById('guest-summary');
    const tbody = document.getElementById('guest-search-body');

    if (matches.length === 0 && bookingMatches.length === 0) {
      summaryDiv.classList.add('hidden');
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No records found for this guest</td></tr>';
    } else {
      const totalPaid = matches.reduce((sum, p) => sum + p.amount, 0);
      document.getElementById('guest-total-visits').textContent = bookingMatches.length;
      document.getElementById('guest-total-paid').textContent = formatCurrency(totalPaid);
      summaryDiv.classList.remove('hidden');

      if (matches.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No payment records for this guest</td></tr>';
      } else {
        tbody.innerHTML = '';
        matches.forEach(p => {
          const tr = document.createElement('tr');
          const tdName = document.createElement('td');
          tdName.textContent = p.guestName;
          const tdDate = document.createElement('td');
          tdDate.textContent = p.date;
          const tdBuilding = document.createElement('td');
          tdBuilding.textContent = formatBuildings(p);
          const tdRooms = document.createElement('td');
          tdRooms.textContent = formatRoomNumbers(p);
          const tdAmount = document.createElement('td');
          tdAmount.textContent = formatCurrency(p.amount);
          tr.append(tdName, tdDate, tdBuilding, tdRooms, tdAmount, createActionCell('payment', p.id, p));
          tbody.appendChild(tr);
        });
      }
    }
  } catch (error) {
    console.error('Error searching guest:', error);
    showToast('Error searching: ' + error.message, 'error');
  } finally {
    loading.classList.add('hidden');
  }
}

// --- Real-time Listeners ---
let isRefreshing = false;
function setupRealtimeListeners() {
  let firstPayment = true;
  let firstExpense = true;
  onValue(ref(db, 'payments'), () => {
    if (firstPayment) { firstPayment = false; return; }
    if (!isRefreshing) {
      isRefreshing = true;
      refreshCurrentView().finally(() => { isRefreshing = false; });
    }
  });
  onValue(ref(db, 'expenditures'), () => {
    if (firstExpense) { firstExpense = false; return; }
    if (!isRefreshing) {
      isRefreshing = true;
      refreshCurrentView().finally(() => { isRefreshing = false; });
    }
  });
}

// --- Live Guest Search (debounced) ---
let searchTimeout = null;
function onGuestSearchInput() {
  clearTimeout(searchTimeout);
  const val = document.getElementById('guest-search-input').value.trim();
  if (val.length === 0) {
    const summaryDiv = document.getElementById('guest-summary');
    summaryDiv.classList.add('hidden');
    document.getElementById('guest-search-body').innerHTML =
      '<tr class="empty-row"><td colspan="6">Search for a guest to see their history</td></tr>';
    return;
  }
  searchTimeout = setTimeout(searchGuest, 300);
}

// --- Event Listeners ---
function init() {
  setDefaults();
  initTabs();

  document.getElementById('load-daily').addEventListener('click', loadDailyData);
  document.getElementById('generate-monthly').addEventListener('click', loadMonthlyData);
  document.getElementById('apply-filter').addEventListener('click', loadAllEntries);

  document.getElementById('guest-search-btn').addEventListener('click', searchGuest);
  document.getElementById('guest-search-input').addEventListener('input', onGuestSearchInput);
  document.getElementById('guest-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      searchGuest();
    }
  });

  // Edit modal
  document.getElementById('edit-form').addEventListener('submit', saveEdit);
  document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
  document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEditModal();
  });

  // Edit modal room toggles
  const editRoomCheckboxes = document.querySelectorAll('input[name="edit-rooms"]');
  editRoomCheckboxes.forEach(cb => cb.addEventListener('change', updateEditBuildingToggles));

  document.getElementById('edit-select-old-building').addEventListener('change', (e) => {
    editRoomCheckboxes.forEach(cb => {
      if (OLD_BUILDING_ROOMS.includes(parseInt(cb.value, 10))) cb.checked = e.target.checked;
    });
    updateEditBuildingToggles();
  });

  document.getElementById('edit-select-new-building').addEventListener('change', (e) => {
    editRoomCheckboxes.forEach(cb => {
      if (NEW_BUILDING_ROOMS.includes(parseInt(cb.value, 10))) cb.checked = e.target.checked;
    });
    updateEditBuildingToggles();
  });

  // Delete modal
  document.getElementById('delete-confirm').addEventListener('click', confirmDelete);
  document.getElementById('delete-cancel').addEventListener('click', closeDeleteModal);
  document.getElementById('delete-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });

  document.getElementById('export-excel').addEventListener('click', () => {
    const yearMonth = document.getElementById('monthly-month').value;
    if (currentMonthlyPayments.length === 0 && currentMonthlyExpenses.length === 0) {
      alert('Please generate the monthly report first before exporting.');
      return;
    }
    exportMonthlyReport(currentMonthlyPayments, currentMonthlyExpenses, yearMonth);
  });

  loadMonthlyData();
  loadAllEntries();
  loadDailyData();
  tabLoaded.monthly = true;
  tabLoaded.entries = true;
  tabLoaded.daily = true;
  setupRealtimeListeners();
}

if (sessionStorage.getItem('ur_authenticated') === 'true') {
  init();
}

window.addEventListener('dashboard-ready', init);
