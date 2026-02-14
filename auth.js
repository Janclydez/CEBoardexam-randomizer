/* /auth.js
   Shared auth + premium flag + AdSense gating + single-device (premium-only) lock
   ✅ Behavior intentionally mirrors the working engine inside index.html

   DB: profiles.current_session_id
   Local: localStorage.device_session_id

   Premium rules (matches index.html):
   - Non-premium: NEVER device-locked; ads ON
   - Premium:
       * If DB token empty -> bind this device
       * If DB token matches local -> allow premium
       * If mismatch:
           - allow takeover ONLY if this page load is "freshly authenticated"
             (magic-link callback / SIGNED_IN just happened / JWT iat is fresh)
           - otherwise sign out + ads ON
*/

(function () {
  "use strict";

  // ========== CONFIG (EDIT THESE ONLY) ==========
  const SUPABASE_URL = "https://yffplpmnolyyvvklcxev.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmZnBscG1ub2x5eXZ2a2xjeGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODAwNTUsImV4cCI6MjA4NjM1NjA1NX0.AdOHKrrDoRmDUfCcL3KWrJKFxcBKgQZkvmxluo0WRVk";
  const ADSENSE_CLIENT = "ca-pub-2265275210848597";

  // Optional flags (keep same semantics as your other pages)
  const DEBUG = (window.__AUTH_DEBUG__ === true);
  const ADS_ENABLED = (window.__ADS_ENABLED__ !== false);

  // Optional UI hooks
  const PREMIUM_ONLY_SELECTOR = "[data-premium-only]";
  const PREMIUM_MESSAGE_ID = "premium-message"; // optional "premium required" message container
  const STATUS_EL_ID = "logoutAllStatus";       // optional status line used in index.html

  // Keys / timings (matches index.html)
  const LOCAL_TOKEN_KEY = "device_session_id";
  const FRESH_WINDOW_MS = 10 * 60 * 1000;       // 10 min (sessionStorage "just authenticated")
  const JWT_FRESH_SECONDS = 180;                // 3 min JWT iat freshness
  const WATCH_INTERVAL_MS = 20_000;

  function log(...args) { if (DEBUG) console.log("[auth.js]", ...args); }
  function warn(...args) { console.warn("[auth.js]", ...args); }

  // ========== Supabase client reuse/create ==========
  function getExistingSupabaseClient() {
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    // Reuse a globally-defined `supabaseClient` safely if present
    try {
      // eslint-disable-next-line no-undef
      if (typeof supabaseClient !== "undefined" && supabaseClient?.auth) {
        window.supabaseClient = supabaseClient;
        return window.supabaseClient;
      }
    } catch (_) {}
    return null;
  }

  function ensureSupabaseClient() {
    const existing = getExistingSupabaseClient();
    if (existing) return existing;

    if (!window.supabase || !window.supabase.createClient) {
      warn("Supabase CDN not found. Add: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
      return null;
    }
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = client;
    return client;
  }

  const client = ensureSupabaseClient();

  // ========== Premium flag + optional UI ==========
  function setPremiumFlag(isPremium) {
    window.__userIsPremium = !!isPremium;
    document.documentElement.dataset.premium = isPremium ? "true" : "false";

    // Optional: hide/show premium-only blocks
    try {
      document.querySelectorAll(PREMIUM_ONLY_SELECTOR).forEach(el => {
        el.style.display = isPremium ? "" : "none";
      });
    } catch (_) {}

    // Optional: message element
    const msg = document.getElementById(PREMIUM_MESSAGE_ID);
    if (msg) {
      msg.textContent = isPremium ? "" : "Become a premium member to access this feature.";
      msg.style.display = isPremium ? "none" : "block";
    }

    // Optional: badge element
    const badge = document.getElementById("premium-badge");
    if (badge) badge.style.display = isPremium ? "inline-flex" : "none";
  }

  function setStatus(msg, isError = false) {
    const el = document.getElementById(STATUS_EL_ID);
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = isError ? "#b91c1c" : "#166534";
  }

  // ========== AdSense loader (auto ads) ==========
  function loadAds() {
    if (!ADS_ENABLED) { log("Ads disabled for this page"); return; }

    // Match the working index.html marker
    if (document.querySelector('script[data-adsbygoogle="1"]')) return;

    const ads = document.createElement("script");
    ads.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(ADSENSE_CLIENT);
    ads.async = true;
    ads.crossOrigin = "anonymous";
    ads.dataset.adsbygoogle = "1";
    document.head.appendChild(ads);
  }

  // ========== helpers (matches index.html) ==========
  async function ensureProfileRow(user) {
    try {
      await client.from("profiles").insert({ id: user.id, email: user.email });
    } catch (_) {
      // ignore duplicates / RLS insert restrictions
    }
  }

  async function fetchProfile(userId) {
    const { data: profile, error } = await client
      .from("profiles")
      .select("is_premium, current_session_id")
      .eq("id", userId)
      .single();

    if (error || !profile) return { profile: null, error: error || new Error("profile_missing") };
    return { profile, error: null };
  }

  function safeUUID() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    } catch (_) {}
    return "sid_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
  }

  function getOrCreateLocalDeviceToken() {
    let t = null;
    try { t = localStorage.getItem(LOCAL_TOKEN_KEY); } catch (_) {}
    if (!t) {
      t = safeUUID();
      try { localStorage.setItem(LOCAL_TOKEN_KEY, t); } catch (_) {}
    }
    return t;
  }

  function clearLocalDeviceToken() {
    try { localStorage.removeItem(LOCAL_TOKEN_KEY); } catch (_) {}
  }

  async function setDbDeviceToken(userId, token) {
    const { error } = await client
      .from("profiles")
      .update({ current_session_id: token })
      .eq("id", userId);
    return { ok: !error, error };
  }

  function isMagicLinkCallbackUrl(u) {
    // PKCE callback: ?code=...
    // Implicit callback: #access_token=...
    // Token links: ?token=... (some setups)
    return (
      u.searchParams.has("code") ||
      u.searchParams.has("token") ||
      u.searchParams.has("type") ||
      (u.hash && u.hash.includes("access_token="))
    );
  }

  function signedInEventIsFresh() {
    try {
      const ts = Number(sessionStorage.getItem("signed_in_ts") || "0");
      if (!ts) return false;
      if (Date.now() - ts > FRESH_WINDOW_MS) {
        sessionStorage.removeItem("signed_in_ts");
        return false;
      }
      return true;
    } catch (_) { return false; }
  }

  function decodeJwtPayload(token) {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr = decodeURIComponent(
        atob(b64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
      );
      return JSON.parse(jsonStr);
    } catch (_) {
      return null;
    }
  }

  async function sessionJwtIsFresh(maxAgeSeconds = JWT_FRESH_SECONDS) {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session || !session.access_token) return false;
      const payload = decodeJwtPayload(session.access_token);
      if (!payload || !payload.iat) return false;
      const now = Math.floor(Date.now() / 1000);
      return (now - payload.iat) <= maxAgeSeconds;
    } catch (_) {
      return false;
    }
  }

  async function handleAuthCallbackIfPresent() {
    const u = new URL(window.location.href);
    const isCallback = isMagicLinkCallbackUrl(u);

    // Exchange PKCE code if present
    if (u.searchParams.has("code")) {
      try {
        await client.auth.exchangeCodeForSession(window.location.href);
      } catch (e) {
        warn("exchangeCodeForSession skipped:", e?.message || e);
      }
    }

    // Mark this tab as "just authenticated" for a short window
    if (isCallback) {
      try { sessionStorage.setItem("just_authed_ts", String(Date.now())); } catch (_) {}
    }

    // Clean URL (remove auth-only params)
    if (u.searchParams.has("code") || u.searchParams.has("t") || u.searchParams.has("type") || u.searchParams.has("token")) {
      u.searchParams.delete("code");
      u.searchParams.delete("t");
      u.searchParams.delete("type");
      u.searchParams.delete("token");
      if (u.hash && u.hash.includes("access_token=")) u.hash = "";
      window.history.replaceState({}, "", u.toString());
    }

    return { isCallback };
  }

  // ========== main engine (mirrors index.html) ==========
  let __authInitRunning = false;

  async function initAuthAndPremium() {
    if (__authInitRunning) return window.__userIsPremium === true;
    __authInitRunning = true;

    // Default CLOSED until verified (prevents “stuck premium” UI)
    setPremiumFlag(false);

    try {
      await handleAuthCallbackIfPresent();

      // Decide if this load is "freshly authenticated"
      let justAuthed = false;
      try {
        const ts = Number(sessionStorage.getItem("just_authed_ts") || "0");
        justAuthed = !!(ts && (Date.now() - ts < FRESH_WINDOW_MS));
      } catch (_) {}
      justAuthed = justAuthed || signedInEventIsFresh() || (await sessionJwtIsFresh(JWT_FRESH_SECONDS));

      const { data: { user } } = await client.auth.getUser();

      // Logged out => ads ON
      if (!user) {
        loadAds();
        return false;
      }

      await ensureProfileRow(user);

      const { profile, error } = await fetchProfile(user.id);
      if (error || !profile) {
        clearLocalDeviceToken();
        try { await client.auth.signOut(); } catch (_) {}
        loadAds();
        return false;
      }

      // NON-PREMIUM: no device lock, ads ON
      if (!profile.is_premium) {
        setPremiumFlag(false);
        loadAds();
        return false;
      }

      // PREMIUM: enforce single device
      const localToken = getOrCreateLocalDeviceToken();
      const dbToken = profile.current_session_id;

      // First bind
      if (!dbToken) {
        const bound = await setDbDeviceToken(user.id, localToken);
        if (!bound.ok) {
          setStatus("Device lock failed: " + (bound.error?.message || "unknown error"), true);
          setPremiumFlag(false);
          try { await client.auth.signOut(); } catch (_) {}
          loadAds();
          return false;
        }
        setStatus("This device is now active.");
        try { sessionStorage.removeItem("just_authed_ts"); } catch (_) {}
        try { sessionStorage.removeItem("signed_in_ts"); } catch (_) {}
        setPremiumFlag(true);
        return true;
      }

      // Match -> OK
      if (dbToken === localToken) {
        setPremiumFlag(true);
        return true;
      }

      // Mismatch -> only allow takeover if freshly authenticated
      if (!justAuthed) {
        setPremiumFlag(false);
        clearLocalDeviceToken();
        try { await client.auth.signOut(); } catch (_) {}
        loadAds();
        alert("This premium account is active on another device.\n\nSend a new magic link on this device to switch.");
        loadAds();
        return false;
      }

      // Takeover: rotate license to THIS device
      const rotated = await setDbDeviceToken(user.id, localToken);
      if (!rotated.ok) {
        setStatus("Could not activate this device: " + (rotated.error?.message || "unknown error"), true);
        setPremiumFlag(false);
        try { await client.auth.signOut(); } catch (_) {}
        loadAds();
        return false;
      }

      setStatus("This device is now active. Other devices will lose premium on refresh.");
      try { sessionStorage.removeItem("just_authed_ts"); } catch (_) {}
      try { sessionStorage.removeItem("signed_in_ts"); } catch (_) {}
      setPremiumFlag(true);
      return true;

    } catch (e) {
      warn("initAuthAndPremium failed:", e);
      // Fail-open ads (same spirit as index: if unsure, don't give premium)
      setPremiumFlag(false);
      loadAds();
      return false;

    } finally {
      __authInitRunning = false;
    }
  }

  // ========== public helpers ==========
  window.__userIsPremium = false;
  window.authReady = Promise.resolve(false);

  window.showPremiumGate = window.showPremiumGate || function () {
    const modal = document.getElementById("premiumGateModal");
    if (modal) modal.style.display = "block";
    else alert("Become a premium member to access this feature.");
  };

  window.tryEnterFacultyMode = window.tryEnterFacultyMode || (async function () {
    await initAuthAndPremium();

    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      window.showPremiumGate();
      return false;
    }

    const { data: profile, error } = await client
      .from("profiles")
      .select("is_premium")
      .eq("id", user.id)
      .single();

    if (!error && profile?.is_premium === true) return true;

    window.showPremiumGate();
    return false;
  });

  // ========== bootstrap ==========
  if (!client) {
    // If Supabase can't run, default non-premium with ads ON
    setPremiumFlag(false);
    loadAds();
    window.authReady = Promise.resolve(false);
    return;
  }

  window.addEventListener("DOMContentLoaded", () => {
    window.authReady = initAuthAndPremium();
  });

  client.auth.onAuthStateChange((event) => {
    // Mirrors index.html semantics
    if (event === "SIGNED_IN") {
      try { sessionStorage.setItem("signed_in_ts", String(Date.now())); } catch (_) {}
    }
    if (event === "SIGNED_OUT") {
      try { sessionStorage.removeItem("signed_in_ts"); } catch (_) {}
      try { sessionStorage.removeItem("just_authed_ts"); } catch (_) {}
    }
    setTimeout(initAuthAndPremium, 0);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) initAuthAndPremium();
  });

  setInterval(() => {
    if (!document.hidden) initAuthAndPremium();
  }, WATCH_INTERVAL_MS);

})();
