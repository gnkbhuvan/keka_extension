(() => {
  try {
    // 🔍 scan localStorage first
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key);
      if (!val) continue;

      // ⛔ skip any id_token keys explicitly
      if (key.toLowerCase().includes("id_token")) continue;

      // ✅ look for key that *is* or *contains* "accessToken"
      if (key.toLowerCase().includes("access")) {
        if (typeof val === "string" && val.startsWith("eyJ")) {
          console.log("[Keka Token Extractor] Found raw accessToken in", key);
          return { token: val, source: "localStorage:" + key };
        }

        try {
          const parsed = JSON.parse(val);
          if (
            parsed &&
            parsed.accessToken &&
            parsed.accessToken.startsWith("eyJ")
          ) {
            console.log("[Keka Token Extractor] Found accessToken inside", key);
            return { token: parsed.accessToken, source: "localStorage:" + key };
          }
        } catch (e) {}
      }

      // ✅ generic fallback: if JSON contains "accessToken" property anywhere
      try {
        const parsed = JSON.parse(val);
        if (
          parsed &&
          typeof parsed === "object" &&
          parsed.accessToken &&
          typeof parsed.accessToken === "string" &&
          parsed.accessToken.startsWith("eyJ")
        ) {
          console.log(
            "[Keka Token Extractor] Found accessToken in JSON value of",
            key
          );
          return { token: parsed.accessToken, source: "localStorage:" + key };
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error("[Keka Token Extractor] Error scanning localStorage:", e);
  }

  // 🔄 fallback to sessionStorage if not found
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const val = sessionStorage.getItem(key);
      if (!val) continue;
      if (key.toLowerCase().includes("id_token")) continue;

      try {
        const parsed = JSON.parse(val);
        if (
          parsed &&
          parsed.accessToken &&
          parsed.accessToken.startsWith("eyJ")
        ) {
          console.log(
            "[Keka Token Extractor] Found accessToken in sessionStorage:",
            key
          );
          return { token: parsed.accessToken, source: "sessionStorage:" + key };
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error("[Keka Token Extractor] Error scanning sessionStorage:", e);
  }

  // ❌ nothing found
  console.warn("[Keka Token Extractor] No accessToken found in storage");
  return { token: null, source: null };
})();
