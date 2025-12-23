// DOM Elements - Main UI
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');
const errorMessageEl = document.getElementById('error-message');
const openKekaBtn = document.getElementById('open-keka-btn');
const refreshBtn = document.getElementById('refresh');
const dateEl = document.getElementById('date');
const workedEl = document.getElementById('worked');
const expectedEl = document.getElementById('expected');
const entriesEl = document.getElementById('entries');

// DOM Elements - Settings
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings');
const subdomainInput = document.getElementById('subdomain-input');
const themeLightBtn = document.getElementById('theme-light');
const themeDarkBtn = document.getElementById('theme-dark');
const remindersList = document.getElementById('reminders-list');
const addReminderBtn = document.getElementById('add-reminder-btn');

// DOM Elements - Modal
const reminderModal = document.getElementById('reminder-modal');
const closeModalBtn = document.getElementById('close-modal');
const reminderMinutesInput = document.getElementById('reminder-minutes');
const reminderMessageInput = document.getElementById('reminder-message');
const cancelReminderBtn = document.getElementById('cancel-reminder');
const saveReminderBtn = document.getElementById('save-reminder');

// Current settings state
let currentSettings = {
  subdomain: 'webosmotic',
  theme: 'dark',
  reminders: []
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  applyTheme(currentSettings.theme);
  fetchAttendance();
});

// Load settings from storage
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    currentSettings = {
      subdomain: response.subdomain || 'webosmotic',
      theme: response.theme || 'dark',
      reminders: response.reminders || []
    };
    
    // Update UI
    subdomainInput.value = currentSettings.subdomain;
    updateThemeButtons(currentSettings.theme);
    renderReminders();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// Save settings to storage
async function saveSettings() {
  try {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      settings: {
        subdomain: currentSettings.subdomain,
        theme: currentSettings.theme,
        reminders: currentSettings.reminders
      }
    });
  } catch (err) {
    console.error('Failed to save settings:', err);
  }
}

// Theme handling
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  updateThemeButtons(theme);
}

function updateThemeButtons(theme) {
  themeLightBtn.classList.toggle('active', theme === 'light');
  themeDarkBtn.classList.toggle('active', theme === 'dark');
}

themeLightBtn.addEventListener('click', () => {
  currentSettings.theme = 'light';
  applyTheme('light');
  saveSettings();
});

themeDarkBtn.addEventListener('click', () => {
  currentSettings.theme = 'dark';
  applyTheme('dark');
  saveSettings();
});

// Subdomain handling
let subdomainTimeout;
subdomainInput.addEventListener('input', () => {
  clearTimeout(subdomainTimeout);
  subdomainTimeout = setTimeout(() => {
    currentSettings.subdomain = subdomainInput.value.trim() || 'webosmotic';
    saveSettings();
  }, 500);
});

// Settings panel toggle
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.remove('hidden');
});

closeSettingsBtn.addEventListener('click', () => {
  settingsPanel.classList.add('hidden');
});

// Reminder management
function renderReminders() {
  if (currentSettings.reminders.length === 0) {
    remindersList.innerHTML = '<div class="empty-reminders">No reminders set</div>';
    return;
  }
  
  remindersList.innerHTML = currentSettings.reminders.map(reminder => `
    <div class="reminder-item" data-id="${reminder.id}">
      <div class="reminder-content">
        <div class="reminder-time">${reminder.minutesBefore} mins before</div>
        <div class="reminder-message">${escapeHtml(reminder.message)}</div>
      </div>
      <button class="delete-reminder-btn" data-id="${reminder.id}" title="Delete reminder">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </div>
  `).join('');
  
  // Attach delete handlers
  remindersList.querySelectorAll('.delete-reminder-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      deleteReminder(id);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function deleteReminder(id) {
  currentSettings.reminders = currentSettings.reminders.filter(r => r.id !== id);
  renderReminders();
  saveSettings();
}

// Add reminder modal
addReminderBtn.addEventListener('click', () => {
  reminderMinutesInput.value = '30';
  reminderMessageInput.value = '';
  reminderModal.classList.remove('hidden');
  reminderMinutesInput.focus();
});

closeModalBtn.addEventListener('click', () => {
  reminderModal.classList.add('hidden');
});

cancelReminderBtn.addEventListener('click', () => {
  reminderModal.classList.add('hidden');
});

saveReminderBtn.addEventListener('click', () => {
  const minutes = parseInt(reminderMinutesInput.value, 10);
  const message = reminderMessageInput.value.trim();
  
  if (!minutes || minutes < 1) {
    reminderMinutesInput.focus();
    return;
  }
  
  if (!message) {
    reminderMessageInput.focus();
    return;
  }
  
  const newReminder = {
    id: `reminder_${Date.now()}`,
    minutesBefore: minutes,
    message: message
  };
  
  currentSettings.reminders.push(newReminder);
  renderReminders();
  saveSettings();
  reminderModal.classList.add('hidden');
});

// Close modal on backdrop click
reminderModal.addEventListener('click', (e) => {
  if (e.target === reminderModal) {
    reminderModal.classList.add('hidden');
  }
});

// Open Keka Tab button
openKekaBtn.addEventListener('click', async () => {
  try {
    openKekaBtn.disabled = true;
    openKekaBtn.textContent = 'Opening...';
    
    await chrome.runtime.sendMessage({ type: 'OPEN_KEKA_TAB' });
    
    // Wait a moment then try to refresh
    setTimeout(() => {
      openKekaBtn.textContent = 'Open Keka Tab';
      openKekaBtn.disabled = false;
      fetchAttendance();
    }, 2000);
  } catch (err) {
    openKekaBtn.textContent = 'Open Keka Tab';
    openKekaBtn.disabled = false;
    console.error('Failed to open Keka tab:', err);
  }
});

// Refresh button
refreshBtn.addEventListener('click', fetchAttendance);

// Fetch attendance
async function fetchAttendance() {
  refreshBtn.disabled = true;
  resultEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  openKekaBtn.classList.add('hidden');

  statusEl.innerHTML = '<span class="spinner"></span>Fetching data...';

  try {
    const response = await chrome.runtime.sendMessage({ 
      type: 'FETCH_ATTENDANCE',
      autoOpenTab: false // Don't auto-open, let user use the button
    });

    if (response.success) {
      displaySuccess(response);
    } else {
      displayError(response.error, response.noTab, response.subdomain);
    }
  } catch (err) {
    displayError('Failed to communicate with extension: ' + err.message);
  } finally {
    refreshBtn.disabled = false;
  }
}

function displaySuccess(data) {
  statusEl.innerHTML = 'Updated just now';

  dateEl.textContent = formatDate(data.attendanceDate);
  workedEl.textContent = data.totalWorked;

  if (data.expectedOut) {
    expectedEl.textContent = formatTime(data.expectedOut);
  } else {
    expectedEl.textContent = 'Done';
  }

  if (data.entries && data.entries.length > 0) {
    entriesEl.innerHTML = '';
    data.entries.forEach((entry) => {
      const entryItem = document.createElement('div');
      entryItem.className = 'entry-item';

      const entryTime = document.createElement('div');
      entryTime.className = 'entry-time';
      entryTime.textContent = formatTime(entry.ts);

      const entryStatus = document.createElement('div');
      entryStatus.className = `entry-status ${entry.punchStatus === 0 ? 'in' : 'out'}`;
      entryStatus.textContent = entry.punchStatus === 0 ? 'IN' : 'OUT';

      entryItem.appendChild(entryTime);
      entryItem.appendChild(entryStatus);
      entriesEl.appendChild(entryItem);
    });
  } else {
    entriesEl.innerHTML = '<div style="text-align: center; color: var(--color-text-secondary); font-size: 12px; padding: 16px 0;">No entries</div>';
  }

  resultEl.classList.remove('hidden');
}

function displayError(errorMessage, showOpenButton = false, subdomain = '') {
  statusEl.innerHTML = 'Failed to fetch';
  errorMessageEl.textContent = errorMessage;
  errorEl.classList.remove('hidden');
  
  if (showOpenButton) {
    openKekaBtn.classList.remove('hidden');
    openKekaBtn.textContent = `Open ${subdomain || 'Keka'}.keka.com`;
  }
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}
