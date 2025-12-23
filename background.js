// background service worker (Manifest V3)
// Listens for messages from popup, finds an open Keka tab, injects content script to get token, then calls Keka API and returns parsed summary.
// Also handles hourly refresh, reminder notifications, and auto-open tab.

// Default settings
const DEFAULT_SETTINGS = {
  subdomain: 'webosmotic',
  theme: 'dark',
  reminders: [
    {
      id: 'reminder_default',
      minutesBefore: 30,
      message: 'Almost there! Just 30 mins left to fill your timesheet'
    }
  ],
  lastFetch: null
};

// Initialize alarms on extension install/startup
chrome.runtime.onInstalled.addListener(() => {
  setupHourlyRefresh();
});

chrome.runtime.onStartup.addListener(() => {
  setupHourlyRefresh();
});

function setupHourlyRefresh() {
  // Create hourly alarm for refreshing attendance data
  chrome.alarms.create('hourlyRefresh', { periodInMinutes: 60 });
  console.log('[Keka] Hourly refresh alarm set');
}

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'hourlyRefresh') {
    console.log('[Keka] Hourly refresh triggered');
    await performBackgroundFetch();
  } else if (alarm.name.startsWith('reminder_')) {
    // Extract reminder ID and show notification
    const reminderId = alarm.name.replace('reminder_', '');
    await showReminderNotification(reminderId);
  }
});

// Show reminder notification
async function showReminderNotification(reminderId) {
  const settings = await getSettings();
  const reminder = settings.reminders.find(r => r.id === reminderId);
  
  if (reminder) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Keka Attendance Reminder',
      message: reminder.message,
      priority: 2
    });
    console.log('[Keka] Reminder notification shown:', reminder.message);
  }
}

// Get settings from storage
async function getSettings() {
  const result = await chrome.storage.sync.get(['subdomain', 'theme', 'reminders', 'lastFetch']);
  return {
    subdomain: result.subdomain || DEFAULT_SETTINGS.subdomain,
    theme: result.theme || DEFAULT_SETTINGS.theme,
    reminders: result.reminders || DEFAULT_SETTINGS.reminders,
    lastFetch: result.lastFetch || null
  };
}

// Save last fetch data
async function saveLastFetch(data) {
  await chrome.storage.sync.set({
    lastFetch: {
      expectedOut: data.expectedOut,
      totalWorkedMs: data.totalWorkedMs,
      fetchedAt: Date.now()
    }
  });
}

// Schedule reminders based on expected out time
async function scheduleReminders(expectedOutTime) {
  if (!expectedOutTime) {
    // Clear all existing reminder alarms
    const alarms = await chrome.alarms.getAll();
    for (const alarm of alarms) {
      if (alarm.name.startsWith('reminder_')) {
        await chrome.alarms.clear(alarm.name);
      }
    }
    return;
  }

  const settings = await getSettings();
  const expectedOutMs = new Date(expectedOutTime).getTime();
  const now = Date.now();

  // Clear existing reminder alarms first
  const alarms = await chrome.alarms.getAll();
  for (const alarm of alarms) {
    if (alarm.name.startsWith('reminder_')) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  // Schedule new reminder alarms
  for (const reminder of settings.reminders) {
    const reminderTime = expectedOutMs - (reminder.minutesBefore * 60 * 1000);
    
    if (reminderTime > now) {
      const delayMinutes = (reminderTime - now) / (60 * 1000);
      chrome.alarms.create(`reminder_${reminder.id}`, { delayInMinutes: delayMinutes });
      console.log(`[Keka] Scheduled reminder "${reminder.id}" in ${delayMinutes.toFixed(1)} minutes`);
    }
  }
}

// Perform background fetch (for hourly refresh)
async function performBackgroundFetch() {
  try {
    const result = await fetchAttendanceData();
    if (result.success) {
      await saveLastFetch(result);
      await scheduleReminders(result.expectedOut);
    }
  } catch (err) {
    console.error('[Keka] Background fetch error:', err);
  }
}

// Main fetch attendance function
async function fetchAttendanceData(autoOpenTab = false) {
  const settings = await getSettings();
  const subdomain = settings.subdomain;

  // Find any open tab on the configured subdomain
  const tabs = await chrome.tabs.query({
    url: [`*://${subdomain}.keka.com/*`, "*://*.keka.com/*"],
  });
  console.log(`[Keka] Found tabs:`, tabs);
  
  let kekaTab = tabs && tabs.length ? tabs[0] : null;

  // If no tab found and autoOpenTab is enabled, create one
  if (!kekaTab && autoOpenTab) {
    try {
      kekaTab = await chrome.tabs.create({
        url: `https://${subdomain}.keka.com/`,
        active: false // opens in background
      });
      console.log('[Keka] Auto-opened Keka tab:', kekaTab.id);
      
      // Wait for tab to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Reload tab info
      kekaTab = await chrome.tabs.get(kekaTab.id);
    } catch (err) {
      console.error('[Keka] Error auto-opening tab:', err);
    }
  }

  if (!kekaTab) {
    return {
      success: false,
      error: `No open Keka tab found. Please open https://${subdomain}.keka.com/ in a tab and make sure you are logged in.`,
      noTab: true,
      subdomain: subdomain
    };
  }

  // Inject script to extract token
  const results = await chrome.scripting.executeScript({
    target: { tabId: kekaTab.id },
    files: ["content_extract_token.js"],
  });
  console.log(`[Keka] Token extraction results:`, results);

  const rv = results && results[0] && results[0].result;
  const token = rv && rv.token;
  console.log(`[Keka] Token:`, token ? 'found' : 'not found');
  const source = rv && rv.source;

  if (!token) {
    return {
      success: false,
      error: "Token not found on the Keka page. Please make sure you are logged in. Source: " + (source || "unknown"),
    };
  }

  // Call Keka attendance API (execute inside Keka page context)
  const [apiResult] = await chrome.scripting.executeScript({
    target: { tabId: kekaTab.id },
    func: async (token, subdomain) => {
      try {
        const apiUrl = `https://${subdomain}.keka.com/k/attendance/api/mytime/attendance/summary`;
        const resp = await fetch(apiUrl, {
          headers: { Authorization: "Bearer " + token },
          credentials: "include",
        });

        const text = await resp.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch (e) {}

        console.log("[Keka page] status", resp?.status);
        return {
          ok: resp.ok,
          status: resp.status,
          data: json,
          raw: text,
        };
      } catch (err) {
        console.error("[Keka page] Fetch error:", err);
        return { ok: false, status: 0, error: err.message };
      }
    },
    args: [token, subdomain],
  });

  const result = apiResult?.result;
  console.log("[Keka] In-page fetch result:", result);

  if (!result?.ok || !result?.data) {
    return {
      success: false,
      error: "Keka API failed: " + (result?.status || result?.error),
    };
  }

  const data = result.data;

  if (result?.status !== 200 || !data) {
    return {
      success: false,
      error: "Keka API failed: " + result?.status,
    };
  }

  // Parse latest attendance
  if (!data || !data.data || data.data.length === 0) {
    return {
      success: false,
      error: "No attendance data returned by Keka API.",
    };
  }

  const latest = data.data[data.data.length - 1];
  const timeEntries = (latest.timeEntries || [])
    .filter(e => e.punchStatus === 0 || e.punchStatus === 1)
    .slice()
    .sort(
      (a, b) => new Date(a.actualTimestamp) - new Date(b.actualTimestamp)
    );

  // Format entries and remove duplicates
  const entriesFormatted = [];
  const seen = new Set();
  
  for (const e of timeEntries) {
    const date = new Date(e.actualTimestamp);
    const minuteKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}-${e.punchStatus}`;
    
    if (!seen.has(minuteKey)) {
      seen.add(minuteKey);
      entriesFormatted.push({
        ts: e.actualTimestamp,
        punchStatus: e.punchStatus,
      });
    }
  }

  // Compute total worked and expected out
  let inTime = null;
  let lastInTime = null;
  let totalWorkedMs = 0;
  
  for (const e of timeEntries) {
    const ts = new Date(e.actualTimestamp);
    if (e.punchStatus === 0) {
      inTime = ts;
      lastInTime = ts;
    } else if (e.punchStatus === 1 && inTime) {
      totalWorkedMs += ts - inTime;
      inTime = null;
    }
  }

  // Only add ongoing time if it's today's attendance and user is clocked IN
  if (inTime) {
    const now = new Date();
    const today = now.toDateString();
    const attendanceDay = inTime.toDateString();
    
    if (today === attendanceDay) {
      totalWorkedMs += now - inTime;
    }
  }

  const totalWorked = msToDuration(totalWorkedMs);
  const targetMs = 8 * 60 * 60 * 1000;
  let expectedOut = null;
  let remainingMs = targetMs - totalWorkedMs;
  if (remainingMs <= 0) {
    remainingMs = 0;
  }
  
  // If user is currently clocked IN and it's today, calculate expected out
  if (inTime && remainingMs > 0) {
    const now = new Date();
    const today = now.toDateString();
    const attendanceDay = inTime.toDateString();
    
    if (today === attendanceDay) {
      expectedOut = new Date(now.getTime() + remainingMs).toISOString();
    }
  }

  // Get last OUT
  const outPunches = timeEntries.filter((e) => e.punchStatus === 1);
  const lastOut = outPunches.length
    ? outPunches[outPunches.length - 1].actualTimestamp
    : null;

  return {
    success: true,
    attendanceDate: latest.attendanceDate,
    entries: entriesFormatted,
    totalWorkedMs,
    totalWorked,
    expectedOut,
    lastOut,
  };
}

// Message listener for popup communication
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "FETCH_ATTENDANCE") {
    (async () => {
      try {
        const result = await fetchAttendanceData(msg.autoOpenTab || false);
        
        if (result.success) {
          await saveLastFetch(result);
          await scheduleReminders(result.expectedOut);
        }
        
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // keep channel open for async
  }
  
  if (msg && msg.type === "OPEN_KEKA_TAB") {
    (async () => {
      try {
        const settings = await getSettings();
        const tab = await chrome.tabs.create({
          url: `https://${settings.subdomain}.keka.com/`,
          active: false
        });
        sendResponse({ success: true, tabId: tab.id });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    
    return true;
  }
  
  if (msg && msg.type === "GET_SETTINGS") {
    (async () => {
      const settings = await getSettings();
      sendResponse(settings);
    })();
    
    return true;
  }
  
  if (msg && msg.type === "SAVE_SETTINGS") {
    (async () => {
      try {
        await chrome.storage.sync.set(msg.settings);
        
        // Reschedule reminders if we have cached expectedOut
        const lastFetch = await chrome.storage.sync.get('lastFetch');
        if (lastFetch.lastFetch?.expectedOut) {
          await scheduleReminders(lastFetch.lastFetch.expectedOut);
        }
        
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    
    return true;
  }
});

// Helper function to format milliseconds to duration
function msToDuration(ms) {
  const isNegative = ms < 0;
  ms = Math.abs(ms);
  const secs = Math.floor(ms / 1000);
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  return `${isNegative ? '-' : ''}${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function pad(n) {
  return n.toString().padStart(2, "0");
}
