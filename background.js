// background service worker (Manifest V3)
// Listens for messages from popup, finds an open Keka tab, injects content script to get token, then calls Keka API and returns parsed summary.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "FETCH_ATTENDANCE") {
    (async () => {
      try {
        // Find any open tab on webosmotic.keka.com
        const tabs = await chrome.tabs.query({
          url: ["*://webosmotic.keka.com/*", "*://*.keka.com/*"],
        });
        console.log(`:::::::::: ~ tabs::::::::::::`, tabs);
        const kekaTab = tabs && tabs.length ? tabs[0] : null;

        if (!kekaTab) {
          sendResponse({
            success: false,
            error:
              "No open Keka tab found. Please open https://webosmotic.keka.com/ in a tab and make sure you are logged in.",
          });
          return;
        }

        // Inject script to extract token
        const results = await chrome.scripting.executeScript({
          target: { tabId: kekaTab.id },
          files: ["content_extract_token.js"],
        });
        console.log(`:::::::::: ~ results::::::::::::`, results);

        const rv = results && results[0] && results[0].result;
        const token = rv && rv.token;
        console.log(`:::::::::: ~ token::::::::::::`, token);
        const source = rv && rv.source;

        if (!token) {
          sendResponse({
            success: false,
            error:
              "Token not found on the Keka page. Source: " +
              (source || "unknown"),
          });
          return;
        }

        // Call Keka attendance API (execute inside Keka page context with better logging)
        const [apiResult] = await chrome.scripting.executeScript({
          target: { tabId: kekaTab.id },
          func: async (token) => {
            try {
              const apiUrl =
                "https://webosmotic.keka.com/k/attendance/api/mytime/attendance/summary";
              const resp = await fetch(apiUrl, {
                headers: { Authorization: "Bearer " + token },
                credentials: "include", // ← important
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
          args: [token],
        });

        const result = apiResult?.result;
        console.log("[Keka] In-page fetch result:", result);

        if (!result?.ok || !result?.data) {
          sendResponse({
            success: false,
            error: "Keka API failed: " + (result?.status || result?.error),
          });
          return;
        }

        const data = result.data;

        if (result?.status !== 200 || !data) {
          sendResponse({
            success: false,
            error: "Keka API failed: " + result?.status,
          });
          return;
        }

        // Parse latest attendance
        if (!data || !data.data || data.data.length === 0) {
          sendResponse({
            success: false,
            error: "No attendance data returned by Keka API.",
          });
          return;
        }

        const latest = data.data[data.data.length - 1];
        const timeEntries = (latest.timeEntries || [])
          .slice()
          .sort(
            (a, b) => new Date(a.actualTimestamp) - new Date(b.actualTimestamp)
          );

        // Format entries and remove duplicates (same timestamp + status)
        const entriesFormatted = [];
        const seen = new Set();
        
        for (const e of timeEntries) {
          const key = `${e.actualTimestamp}-${e.punchStatus}`;
          if (!seen.has(key)) {
            seen.add(key);
            entriesFormatted.push({
              ts: e.actualTimestamp,
              punchStatus: e.punchStatus,
            });
          }
        }

        // Compute total worked and expected out like the Python script
        let inTime = null;
        let lastInTime = null;
        let totalWorkedMs = 0;
        for (const e of timeEntries) {
          const ts = new Date(e.actualTimestamp);
          if (e.punchStatus === 0) {
            // IN
            inTime = ts;
            lastInTime = ts;
          } else if (e.punchStatus === 1 && inTime) {
            // OUT
            totalWorkedMs += ts - inTime;
            inTime = null;
          }
        }

        // If user is currently clocked IN (inTime is still set), add ongoing time
        if (inTime) {
          const now = new Date();
          totalWorkedMs += now - inTime;
        }

        const totalWorked = msToDuration(totalWorkedMs);
        const targetMs = 8 * 60 * 60 * 1000;
        let expectedOut = null;
        let remainingMs = targetMs - totalWorkedMs;
        if (remainingMs <= 0) {
          remainingMs = 0;
        }
        if (lastInTime && remainingMs > 0) {
          expectedOut = new Date(
            lastInTime.getTime() + remainingMs
          ).toISOString();
        }

        // Get last OUT
        const outPunches = timeEntries.filter((e) => e.punchStatus === 1);
        const lastOut = outPunches.length
          ? outPunches[outPunches.length - 1].actualTimestamp
          : null;

        sendResponse({
          success: true,
          attendanceDate: latest.attendanceDate,
          entries: entriesFormatted,
          totalWorkedMs,
          totalWorked,
          expectedOut,
          lastOut,
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // keep channel open for async
  }
});

function msToDuration(ms) {
  const secs = Math.floor(ms / 1000);
  const hh = Math.floor(secs / 3600);
  const mm = Math.floor((secs % 3600) / 60);
  const ss = secs % 60;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
function pad(n) {
  return n.toString().padStart(2, "0");
}
