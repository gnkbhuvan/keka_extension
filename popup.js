const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');
const errorEl = document.getElementById('error');
const refreshBtn = document.getElementById('refresh');
const dateEl = document.getElementById('date');
const workedEl = document.getElementById('worked');
const expectedEl = document.getElementById('expected');
const entriesEl = document.getElementById('entries');
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

const sunIcon = `<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
const moonIcon = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
  themeIcon.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
}

function toggleTheme() {
  const currentTheme = document.body.getAttribute('data-theme') || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
}

themeToggle.addEventListener('click', toggleTheme);
refreshBtn.addEventListener('click', fetchAttendance);
initTheme();

async function fetchAttendance() {
  refreshBtn.disabled = true;
  resultEl.classList.add('hidden');
  errorEl.classList.add('hidden');

  statusEl.innerHTML = '<span class="spinner"></span>Fetching data...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'FETCH_ATTENDANCE' });

    if (response.success) {
      displaySuccess(response);
    } else {
      displayError(response.error);
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

function displayError(errorMessage) {
  statusEl.innerHTML = 'Failed to fetch';
  errorEl.textContent = errorMessage;
  errorEl.classList.remove('hidden');
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

document.addEventListener('DOMContentLoaded', () => {
  // Auto-fetch attendance data on popup open
  fetchAttendance();
});

window.addEventListener('beforeunload', () => {
  if (!resultEl.classList.contains('hidden')) {
    const entries = Array.from(entriesEl.querySelectorAll('.entry-item')).map(item => {
      const time = item.querySelector('.entry-time').textContent;
      const status = item.querySelector('.entry-status').textContent;
      return {
        ts: time,
        punchStatus: status === 'IN' ? 0 : 1
      };
    });

    const data = {
      attendanceDate: dateEl.textContent,
      totalWorked: workedEl.textContent,
      expectedOut: expectedEl.textContent,
      entries: entries
    };

    localStorage.setItem('lastAttendanceFetch', JSON.stringify({
      timestamp: Date.now(),
      data: data
    }));
  }
});
