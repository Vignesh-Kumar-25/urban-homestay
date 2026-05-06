const OWNER_PASSWORD_HASH = 'dd91c19230e079dba9dd9a6053aa98757db2ab1293b269050dacd16301faa1c9';

const loginOverlay = document.getElementById('login-overlay');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function showDashboard() {
  loginOverlay.classList.add('hidden');
  dashboard.classList.remove('hidden');
  window.dispatchEvent(new Event('dashboard-ready'));
}

function showLogin() {
  loginOverlay.classList.remove('hidden');
  dashboard.classList.add('hidden');
  sessionStorage.removeItem('ur_authenticated');
}

if (sessionStorage.getItem('ur_authenticated') === 'true') {
  showDashboard();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  const hash = await hashPassword(password);

  if (hash === OWNER_PASSWORD_HASH) {
    sessionStorage.setItem('ur_authenticated', 'true');
    loginError.classList.remove('show');
    showDashboard();
  } else {
    loginError.classList.add('show');
  }
});

logoutBtn.addEventListener('click', () => {
  showLogin();
});
