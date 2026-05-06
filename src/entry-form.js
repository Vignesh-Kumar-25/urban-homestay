import { db } from './firebase.js';
import { ref, push, set } from 'firebase/database';

const paymentForm = document.getElementById('payment-form');
const expenditureForm = document.getElementById('expenditure-form');
const paymentSection = document.getElementById('payment-section');
const expenditureSection = document.getElementById('expenditure-section');
const togglePayment = document.getElementById('toggle-payment');
const toggleExpenditure = document.getElementById('toggle-expenditure');
const toast = document.getElementById('toast');

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('payment-date').value = today;
  document.getElementById('expense-date').value = today;
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
    const rooms = parseInt(document.getElementById('rooms').value, 10);
    const date = document.getElementById('payment-date').value;
    const amount = parseFloat(document.getElementById('amount-paid').value);

    if (!guestName || !rooms || !date || !amount) {
      showToast('Please fill in all fields', 'error');
      return;
    }

    const newRef = push(ref(db, 'payments'));
    await set(newRef, {
      guestName: guestName,
      rooms: rooms,
      date: date,
      amount: amount,
      timestamp: Date.now()
    });

    showToast('Payment recorded successfully!');
    paymentForm.reset();
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
