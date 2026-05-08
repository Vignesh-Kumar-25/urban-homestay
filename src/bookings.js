import { db } from './firebase.js';
import { ref, push, set, get, update, remove, onValue } from 'firebase/database';

const OLD_BUILDING_ROOMS = [1, 2, 3, 4, 5, 6, 7];
const NEW_BUILDING_ROOMS = [8, 9, 10, 11];

const toast = document.getElementById('toast');

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
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

// --- Tab Management ---
function initTabs() {
  const tabs = document.querySelectorAll('.dashboard-tabs button');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');

      if (tab.dataset.tab === 'room-dashboard') {
        loadRoomDashboard();
      }
    });
  });
}

// --- Booking Form: Room Selection ---
const roomCheckboxes = document.querySelectorAll('input[name="booking-rooms"]');
const selectOldBuilding = document.getElementById('booking-select-old-building');
const selectNewBuilding = document.getElementById('booking-select-new-building');
const roomsCountEl = document.getElementById('booking-rooms-count');

function getSelectedRooms() {
  const selected = [];
  roomCheckboxes.forEach(cb => {
    if (cb.checked) selected.push(parseInt(cb.value, 10));
  });
  return selected;
}

function updateRoomsCount() {
  const count = getSelectedRooms().length;
  roomsCountEl.textContent = count === 1 ? '1 room selected' : `${count} rooms selected`;
}

function updateBuildingToggle(buildingCheckbox, roomValues) {
  const relevant = Array.from(roomCheckboxes).filter(cb => roomValues.includes(parseInt(cb.value, 10)));
  const allChecked = relevant.every(cb => cb.checked);
  const someChecked = relevant.some(cb => cb.checked);
  buildingCheckbox.checked = allChecked;
  buildingCheckbox.indeterminate = someChecked && !allChecked;
}

selectOldBuilding.addEventListener('change', () => {
  roomCheckboxes.forEach(cb => {
    if (OLD_BUILDING_ROOMS.includes(parseInt(cb.value, 10))) cb.checked = selectOldBuilding.checked;
  });
  updateRoomsCount();
});

selectNewBuilding.addEventListener('change', () => {
  roomCheckboxes.forEach(cb => {
    if (NEW_BUILDING_ROOMS.includes(parseInt(cb.value, 10))) cb.checked = selectNewBuilding.checked;
  });
  updateRoomsCount();
});

roomCheckboxes.forEach(cb => {
  cb.addEventListener('change', () => {
    updateBuildingToggle(selectOldBuilding, OLD_BUILDING_ROOMS);
    updateBuildingToggle(selectNewBuilding, NEW_BUILDING_ROOMS);
    updateRoomsCount();
  });
});

function clearRoomSelection() {
  roomCheckboxes.forEach(cb => { cb.checked = false; });
  selectOldBuilding.checked = false;
  selectOldBuilding.indeterminate = false;
  selectNewBuilding.checked = false;
  selectNewBuilding.indeterminate = false;
  updateRoomsCount();
}

// --- Form Submission ---
const bookingForm = document.getElementById('booking-form');

let cachedBookings = [];
let selectedDate = null;

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('booking-checkin').value = today;
  document.getElementById('dashboard-month').value = today.substring(0, 7);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('booking-checkout').value = tomorrow.toISOString().split('T')[0];
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = bookingForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const guestName = document.getElementById('booking-guest-name').value.trim();
    const adults = parseInt(document.getElementById('booking-adults').value, 10);
    const kids = parseInt(document.getElementById('booking-kids').value, 10);
    const selectedRooms = getSelectedRooms();
    const checkIn = document.getElementById('booking-checkin').value;
    const checkOut = document.getElementById('booking-checkout').value;

    if (!guestName || selectedRooms.length === 0 || !checkIn || !checkOut) {
      showToast('Please fill in all fields and select at least one room', 'error');
      return;
    }

    if (checkOut <= checkIn) {
      showToast('Check-out date must be after check-in date', 'error');
      return;
    }

    const buildings = [];
    if (selectedRooms.some(r => OLD_BUILDING_ROOMS.includes(r))) buildings.push('Old Building');
    if (selectedRooms.some(r => NEW_BUILDING_ROOMS.includes(r))) buildings.push('New Building');

    const newRef = push(ref(db, 'bookings'));
    await set(newRef, {
      guestName,
      adults,
      kids,
      roomNumbers: selectedRooms,
      buildings,
      checkIn,
      checkOut,
      timestamp: Date.now()
    });

    showToast('Booking recorded successfully!');
    bookingForm.reset();
    clearRoomSelection();
    setDefaultDates();
    document.getElementById('booking-adults').value = '1';
    document.getElementById('booking-kids').value = '0';
  } catch (error) {
    console.error('Error adding booking:', error);
    showToast('Failed to save booking. Check console for details.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Record Booking';
  }
});

// --- Room Dashboard ---
async function loadRoomDashboard() {
  const yearMonth = document.getElementById('dashboard-month').value;
  if (!yearMonth) return;

  const loading = document.getElementById('room-dashboard-loading');
  const content = document.getElementById('room-dashboard-content');
  loading.classList.remove('hidden');
  content.classList.add('hidden');

  try {
    const snapshot = await get(ref(db, 'bookings'));
    cachedBookings = snapshotToArray(snapshot);

    renderDateGrid(yearMonth);
    selectedDate = null;
    document.getElementById('room-detail-section').classList.add('hidden');
  } catch (error) {
    console.error('Error loading room dashboard:', error);
    showToast('Error loading room data', 'error');
  } finally {
    loading.classList.add('hidden');
    content.classList.remove('hidden');
  }
}

function getBookingsForDate(dateStr) {
  return cachedBookings.filter(b => b.checkIn <= dateStr && b.checkOut > dateStr);
}

function countOccupiedRooms(dateStr) {
  const active = getBookingsForDate(dateStr);
  const occupiedRooms = new Set();
  active.forEach(b => {
    if (b.roomNumbers) b.roomNumbers.forEach(r => occupiedRooms.add(r));
  });
  return occupiedRooms.size;
}

function renderDateGrid(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = getDaysInMonth(year, month);
  const container = document.getElementById('date-grid');
  container.innerHTML = '';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  dayNames.forEach(name => {
    const header = document.createElement('div');
    header.className = 'date-grid-header';
    header.textContent = name;
    container.appendChild(header);
  });

  const firstDay = new Date(year, month - 1, 1).getDay();
  for (let i = 0; i < firstDay; i++) {
    const spacer = document.createElement('div');
    spacer.className = 'date-cell-spacer';
    container.appendChild(spacer);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yearMonth}-${d.toString().padStart(2, '0')}`;
    const occupied = countOccupiedRooms(dateStr);

    const cell = document.createElement('div');
    cell.className = 'date-cell';
    cell.dataset.date = dateStr;

    const dayLabel = document.createElement('div');
    dayLabel.className = 'date-cell-day';
    dayLabel.textContent = d;

    const occupancy = document.createElement('div');
    occupancy.className = 'date-cell-occupancy';
    if (occupied === 0) {
      occupancy.classList.add('all-free');
      occupancy.textContent = 'All free';
    } else if (occupied >= 11) {
      occupancy.classList.add('all-booked');
      occupancy.textContent = 'Full';
    } else {
      occupancy.classList.add('some-booked');
      occupancy.textContent = `${occupied}/11 booked`;
    }

    cell.append(dayLabel, occupancy);
    cell.addEventListener('click', () => selectDate(dateStr));
    container.appendChild(cell);
  }
}

function selectDate(dateStr) {
  selectedDate = dateStr;

  document.querySelectorAll('.date-cell').forEach(c => c.classList.remove('selected'));
  const cell = document.querySelector(`.date-cell[data-date="${dateStr}"]`);
  if (cell) cell.classList.add('selected');

  const activeBookings = getBookingsForDate(dateStr);
  const display = new Date(dateStr + 'T00:00:00');
  const formatted = display.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('room-detail-title').textContent = formatted;

  renderGuestList(activeBookings);
  renderRoomGrid('old-building-grid', OLD_BUILDING_ROOMS, activeBookings);
  renderRoomGrid('new-building-grid', NEW_BUILDING_ROOMS, activeBookings);
  document.getElementById('room-detail-section').classList.remove('hidden');
}

function renderGuestList(activeBookings) {
  const section = document.getElementById('guest-list-section');
  const tbody = document.getElementById('guest-list-body');

  if (activeBookings.length === 0) {
    section.classList.add('hidden');
    return;
  }

  const seen = new Set();
  const uniqueBookings = activeBookings.filter(b => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });

  tbody.innerHTML = '';
  uniqueBookings.forEach(b => {
    const tr = document.createElement('tr');
    const tdName = document.createElement('td');
    tdName.textContent = b.guestName;
    const tdAdults = document.createElement('td');
    tdAdults.textContent = b.adults || 0;
    const tdKids = document.createElement('td');
    tdKids.textContent = b.kids || 0;
    const tdRooms = document.createElement('td');
    tdRooms.textContent = b.roomNumbers ? b.roomNumbers.join(', ') : '-';
    const tdCheckout = document.createElement('td');
    tdCheckout.textContent = b.checkOut;

    const tdActions = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'actions-cell';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-icon btn-icon-edit';
    editBtn.title = 'Edit';
    editBtn.innerHTML = '&#9998;';
    editBtn.addEventListener('click', () => openEditBookingModal(b));
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-icon btn-icon-delete';
    deleteBtn.title = 'Delete';
    deleteBtn.innerHTML = '&#128465;';
    deleteBtn.addEventListener('click', () => {
      pendingDeleteBookingId = b.id;
      document.getElementById('delete-booking-modal').classList.remove('hidden');
    });
    wrap.append(editBtn, deleteBtn);
    tdActions.appendChild(wrap);

    tr.append(tdName, tdAdults, tdKids, tdRooms, tdCheckout, tdActions);
    tbody.appendChild(tr);
  });

  section.classList.remove('hidden');
}

function renderRoomGrid(containerId, roomNumbers, activeBookings) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  roomNumbers.forEach(roomNum => {
    const booking = activeBookings.find(b =>
      b.roomNumbers && b.roomNumbers.includes(roomNum)
    );

    const card = document.createElement('div');
    card.className = 'room-card' + (booking ? ' room-occupied' : ' room-available');

    const roomLabel = document.createElement('div');
    roomLabel.className = 'room-card-number';
    roomLabel.textContent = `Room ${roomNum}`;

    const statusBadge = document.createElement('div');
    statusBadge.className = 'room-card-status';

    if (booking) {
      statusBadge.innerHTML = `<span class="badge badge-expense">Occupied</span>`;

      const guestInfo = document.createElement('div');
      guestInfo.className = 'room-card-guest';
      guestInfo.textContent = booking.guestName;

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-secondary room-card-edit';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openEditBookingModal(booking));

      card.append(roomLabel, statusBadge, guestInfo, editBtn);
    } else {
      statusBadge.innerHTML = `<span class="badge badge-payment">Available</span>`;
      card.append(roomLabel, statusBadge);
    }

    container.appendChild(card);
  });
}

// --- Edit Booking Modal ---
function openEditBookingModal(booking) {
  document.getElementById('edit-booking-id').value = booking.id;
  document.getElementById('edit-booking-guest').value = booking.guestName || '';
  document.getElementById('edit-booking-adults').value = booking.adults || 1;
  document.getElementById('edit-booking-kids').value = booking.kids || 0;
  document.getElementById('edit-booking-checkin').value = booking.checkIn || '';
  document.getElementById('edit-booking-checkout').value = booking.checkOut || '';

  const editRoomCheckboxes = document.querySelectorAll('input[name="edit-booking-rooms"]');
  editRoomCheckboxes.forEach(cb => {
    cb.checked = booking.roomNumbers && booking.roomNumbers.includes(parseInt(cb.value, 10));
  });
  updateEditBookingBuildingToggles();

  document.getElementById('edit-booking-modal').classList.remove('hidden');
}

function closeEditBookingModal() {
  document.getElementById('edit-booking-modal').classList.add('hidden');
}

function updateEditBookingBuildingToggles() {
  const cbs = document.querySelectorAll('input[name="edit-booking-rooms"]');
  const oldCb = document.getElementById('edit-booking-select-old');
  const newCb = document.getElementById('edit-booking-select-new');

  const oldRooms = Array.from(cbs).filter(cb => OLD_BUILDING_ROOMS.includes(parseInt(cb.value, 10)));
  const newRooms = Array.from(cbs).filter(cb => NEW_BUILDING_ROOMS.includes(parseInt(cb.value, 10)));

  oldCb.checked = oldRooms.every(cb => cb.checked);
  oldCb.indeterminate = oldRooms.some(cb => cb.checked) && !oldCb.checked;
  newCb.checked = newRooms.every(cb => cb.checked);
  newCb.indeterminate = newRooms.some(cb => cb.checked) && !newCb.checked;
}

document.getElementById('edit-booking-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bookingId = document.getElementById('edit-booking-id').value;

  try {
    const selectedRooms = [];
    document.querySelectorAll('input[name="edit-booking-rooms"]').forEach(cb => {
      if (cb.checked) selectedRooms.push(parseInt(cb.value, 10));
    });

    const checkIn = document.getElementById('edit-booking-checkin').value;
    const checkOut = document.getElementById('edit-booking-checkout').value;

    if (checkOut <= checkIn) {
      showToast('Check-out date must be after check-in date', 'error');
      return;
    }

    if (selectedRooms.length === 0) {
      showToast('Please select at least one room', 'error');
      return;
    }

    const buildings = [];
    if (selectedRooms.some(r => OLD_BUILDING_ROOMS.includes(r))) buildings.push('Old Building');
    if (selectedRooms.some(r => NEW_BUILDING_ROOMS.includes(r))) buildings.push('New Building');

    await update(ref(db, `bookings/${bookingId}`), {
      guestName: document.getElementById('edit-booking-guest').value.trim(),
      adults: parseInt(document.getElementById('edit-booking-adults').value, 10),
      kids: parseInt(document.getElementById('edit-booking-kids').value, 10),
      roomNumbers: selectedRooms,
      buildings,
      checkIn,
      checkOut
    });

    closeEditBookingModal();
    showToast('Booking updated successfully!');
    await refreshDashboard();
  } catch (error) {
    console.error('Error updating booking:', error);
    showToast('Failed to update booking.', 'error');
  }
});

// --- Delete Booking ---
let pendingDeleteBookingId = null;

document.getElementById('delete-booking-btn').addEventListener('click', () => {
  pendingDeleteBookingId = document.getElementById('edit-booking-id').value;
  document.getElementById('delete-booking-modal').classList.remove('hidden');
});

document.getElementById('delete-booking-confirm').addEventListener('click', async () => {
  if (!pendingDeleteBookingId) return;
  try {
    await remove(ref(db, `bookings/${pendingDeleteBookingId}`));
    document.getElementById('delete-booking-modal').classList.add('hidden');
    closeEditBookingModal();
    showToast('Booking deleted.');
    await refreshDashboard();
  } catch (error) {
    console.error('Error deleting booking:', error);
    showToast('Failed to delete booking.', 'error');
  }
  pendingDeleteBookingId = null;
});

document.getElementById('delete-booking-cancel').addEventListener('click', () => {
  document.getElementById('delete-booking-modal').classList.add('hidden');
  pendingDeleteBookingId = null;
});

// --- Modal close handlers ---
document.getElementById('edit-booking-close').addEventListener('click', closeEditBookingModal);
document.getElementById('edit-booking-cancel').addEventListener('click', closeEditBookingModal);
document.getElementById('edit-booking-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeEditBookingModal();
});
document.getElementById('delete-booking-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    document.getElementById('delete-booking-modal').classList.add('hidden');
    pendingDeleteBookingId = null;
  }
});

// --- Edit modal room toggles ---
const editBookingRoomCbs = document.querySelectorAll('input[name="edit-booking-rooms"]');
editBookingRoomCbs.forEach(cb => cb.addEventListener('change', updateEditBookingBuildingToggles));

document.getElementById('edit-booking-select-old').addEventListener('change', (e) => {
  editBookingRoomCbs.forEach(cb => {
    if (OLD_BUILDING_ROOMS.includes(parseInt(cb.value, 10))) cb.checked = e.target.checked;
  });
  updateEditBookingBuildingToggles();
});

document.getElementById('edit-booking-select-new').addEventListener('change', (e) => {
  editBookingRoomCbs.forEach(cb => {
    if (NEW_BUILDING_ROOMS.includes(parseInt(cb.value, 10))) cb.checked = e.target.checked;
  });
  updateEditBookingBuildingToggles();
});

// --- Refresh dashboard preserving selected date ---
async function refreshDashboard() {
  const yearMonth = document.getElementById('dashboard-month').value;
  if (!yearMonth) return;

  const snapshot = await get(ref(db, 'bookings'));
  cachedBookings = snapshotToArray(snapshot);
  renderDateGrid(yearMonth);

  if (selectedDate) {
    selectDate(selectedDate);
  }
}

// --- Realtime listener ---
let firstBookingEvent = true;
onValue(ref(db, 'bookings'), () => {
  if (firstBookingEvent) { firstBookingEvent = false; return; }
  const activeTab = document.querySelector('.dashboard-tabs button.active');
  if (activeTab && activeTab.dataset.tab === 'room-dashboard') {
    refreshDashboard();
  }
});

// --- Init ---
document.getElementById('load-room-dashboard').addEventListener('click', loadRoomDashboard);
setDefaultDates();
initTabs();
