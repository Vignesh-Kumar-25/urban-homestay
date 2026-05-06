import { db } from './firebase.js';
import { ref, query, orderByChild, equalTo, startAt, endAt, get } from 'firebase/database';
import { exportMonthlyReport } from './export.js';

let currentMonthlyPayments = [];
let currentMonthlyExpenses = [];

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
function initTabs() {
  const tabs = document.querySelectorAll('.dashboard-tabs button');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
}

// --- Realtime Database Queries ---
async function getPaymentsForDate(dateStr) {
  console.log('Querying payments for date:', dateStr);
  const q = query(ref(db, 'payments'), orderByChild('date'), equalTo(dateStr));
  const snapshot = await get(q);
  console.log('Payments found:', snapshot.exists(), snapshotToArray(snapshot).length);
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
      paymentsBody.innerHTML = '<tr class="empty-row"><td colspan="4">No payments for this date</td></tr>';
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
        tr.append(tdName, tdBuilding, tdRooms, tdAmount);
        paymentsBody.appendChild(tr);
      });
    }

    const expensesBody = document.getElementById('daily-expenses-body');
    if (expenses.length === 0) {
      expensesBody.innerHTML = '<tr class="empty-row"><td colspan="2">No expenditures for this date</td></tr>';
    } else {
      expensesBody.innerHTML = '';
      expenses.forEach(e => {
        const tr = document.createElement('tr');
        const tdDesc = document.createElement('td');
        tdDesc.textContent = e.description;
        const tdAmount = document.createElement('td');
        tdAmount.textContent = formatCurrency(e.amount);
        tr.append(tdDesc, tdAmount);
        expensesBody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading daily data:', error);
    alert('Error loading data: ' + error.message);
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
      paymentsBody.innerHTML = '<tr class="empty-row"><td colspan="5">No payments this month</td></tr>';
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
        tr.append(tdDate, tdName, tdBuilding, tdRooms, tdAmount);
        paymentsBody.appendChild(tr);
      });
    }

    const expensesBody = document.getElementById('monthly-expenses-body');
    if (expenses.length === 0) {
      expensesBody.innerHTML = '<tr class="empty-row"><td colspan="3">No expenditures this month</td></tr>';
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
        tr.append(tdDate, tdDesc, tdAmount);
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
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No entries found</td></tr>';
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

        tr.append(tdType, tdDesc, tdBuilding, tdRooms, tdAmount, tdDate);
        tbody.appendChild(tr);
      });
    }
  } catch (error) {
    console.error('Error loading entries:', error);
  } finally {
    loading.classList.add('hidden');
  }
}

// --- Event Listeners ---
function init() {
  setDefaults();
  initTabs();

  document.getElementById('load-daily').addEventListener('click', loadDailyData);
  document.getElementById('generate-monthly').addEventListener('click', loadMonthlyData);
  document.getElementById('apply-filter').addEventListener('click', loadAllEntries);

  document.getElementById('export-excel').addEventListener('click', () => {
    const yearMonth = document.getElementById('monthly-month').value;
    if (currentMonthlyPayments.length === 0 && currentMonthlyExpenses.length === 0) {
      alert('Please generate the monthly report first before exporting.');
      return;
    }
    exportMonthlyReport(currentMonthlyPayments, currentMonthlyExpenses, yearMonth);
  });

  loadDailyData();
}

if (sessionStorage.getItem('ur_authenticated') === 'true') {
  init();
}

window.addEventListener('dashboard-ready', init);
