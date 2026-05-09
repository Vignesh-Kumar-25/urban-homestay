import { db } from './firebase.js';
import { ref, push, set, get } from 'firebase/database';

get(ref(db, '.info/connected')).then(() => {
  console.log('Firebase connected successfully');
}).catch(err => {
  console.error('Firebase connection failed:', err);
});

const expenditureForm = document.getElementById('expenditure-form');
const toast = document.getElementById('toast');

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('expense-date').value = today;
}

function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

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
