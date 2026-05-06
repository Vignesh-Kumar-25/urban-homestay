import { db } from './firebase.js';
import { ref, push, set } from 'firebase/database';

const paymentForm = document.getElementById('payment-form');
const expenditureForm = document.getElementById('expenditure-form');
const paymentSection = document.getElementById('payment-section');
const expenditureSection = document.getElementById('expenditure-section');
const togglePayment = document.getElementById('toggle-payment');
const toggleExpenditure = document.getElementById('toggle-expenditure');
const toast = document.getElementById('toast');

const roomCheckboxes = document.querySelectorAll('input[name="rooms"]');
const selectOldBuilding = document.getElementById('select-old-building');
const selectNewBuilding = document.getElementById('select-new-building');
const roomsCountEl = document.getElementById('rooms-count');

const OLD_BUILDING_ROOMS = [1, 2, 3, 4, 5, 6, 7];
const NEW_BUILDING_ROOMS = [8, 9, 10, 11];

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
    if (OLD_BUILDING_ROOMS.includes(parseInt(cb.value, 10))) {
      cb.checked = selectOldBuilding.checked;
    }
  });
  updateRoomsCount();
});

selectNewBuilding.addEventListener('change', () => {
  roomCheckboxes.forEach(cb => {
    if (NEW_BUILDING_ROOMS.includes(parseInt(cb.value, 10))) {
      cb.checked = selectNewBuilding.checked;
    }
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

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('payment-date').value = today;
  document.getElementById('expense-date').value = today;
}

function clearRoomSelection() {
  roomCheckboxes.forEach(cb => { cb.checked = false; });
  selectOldBuilding.checked = false;
  selectOldBuilding.indeterminate = false;
  selectNewBuilding.checked = false;
  selectNewBuilding.indeterminate = false;
  updateRoomsCount();
}

togglePayment.addEventListener('click', () => {
  paymentSection.classList.remove('hidden');
  expenditureSection.classList.add('hidden');
  togglePayment.classList.add('active');
  toggleExpenditure.classList.remove('active');
});

toggleExpenditure.addEventListener('click', () => {
  expenditureSection.classList.remove('hidden');
  paymentSection.classList.add('hidden');
  toggleExpenditure.classList.add('active');
  togglePayment.classList.remove('active');
});

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

paymentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = paymentForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const guestName = document.getElementById('guest-name').value.trim();
    const selectedRooms = getSelectedRooms();
    const date = document.getElementById('payment-date').value;
    const amount = parseFloat(document.getElementById('amount-paid').value);

    if (!guestName || selectedRooms.length === 0 || !date || !amount) {
      showToast('Please fill in all fields and select at least one room', 'error');
      return;
    }

    const buildings = [];
    if (selectedRooms.some(r => OLD_BUILDING_ROOMS.includes(r))) buildings.push('Old Building');
    if (selectedRooms.some(r => NEW_BUILDING_ROOMS.includes(r))) buildings.push('New Building');

    const newRef = push(ref(db, 'payments'));
    await set(newRef, {
      guestName: guestName,
      roomNumbers: selectedRooms,
      buildings: buildings,
      rooms: selectedRooms.length,
      date: date,
      amount: amount,
      timestamp: Date.now()
    });

    showToast('Payment recorded successfully!');
    paymentForm.reset();
    clearRoomSelection();
    setDefaultDates();
  } catch (error) {
    console.error('Error adding payment:', error);
    showToast('Failed to save payment. Check console for details.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Record Payment';
  }
});

expenditureForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = expenditureForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const description = document.getElementById('expense-desc').value.trim();
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const date = document.getElementById('expense-date').value;

    if (!description || !amount || !date) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    const newRef = push(ref(db, 'expenditures'));
    await set(newRef, {
      description: description,
      amount: amount,
      date: date,
      timestamp: Date.now()
    });

    showToast('Expenditure recorded successfully!');
    expenditureForm.reset();
    setDefaultDates();
  } catch (error) {
    console.error('Error adding expenditure:', error);
    showToast('Failed to save expenditure. Check console for details.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Record Expenditure';
  }
});

setDefaultDates();
