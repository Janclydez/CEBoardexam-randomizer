/* /js/auth.js
   Purpose:
   - Shared auth + premium UI + AdSense gating + single-device enforcement (premium only)
   - Magic-link (and any sign-in) will "claim" the account on THIS device if premium,
     by rotating profiles.current_session_id so other devices are forced to sign out.
   - Fail-open for ads: if profile can't be verified (RLS/missing row), ads may load.

   Exposes:
     window.__userIsPremium (boolean)
     window.authReady (Promise<boolean>)  -> resolves to premium status
     window.showPremiumGate()
     window.tryEnterFacultyMode()
*/

(function () {
  "use strict";

  // ========= CONFIG (EDIT THESE ONLY) =========
  const SUPABASE_URL = "https://yffplpmnolyyvvklcxev.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmZnBscG1ub2x5eXZ2a2xjeGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODAwNTUsImV4cCI6MjA4NjM1NjA1NX0.AdOHKrrDoRmDUfCcL3KWrJKFxcBKgQZkvmxluo0WRVk";
  const ADSENSE_CLIENT = "ca-pub-2265275210848597";

  // ========= OPTIONAL FLAGS =========
  const DEBUG = (window.__AUTH_DEBUG__ === true);
  const ADS_ENABLED = (window.__ADS_ENABLED__ !== false);

  // Premium UI hooks (optional)
  const PREMIUM_ONLY_SELECTOR = "[data-premium-only]";
  const PREMIUM_MESSAGE_ID = "premium-message"; // optional element id to show “premium required”

  // Session enforcement (premium only)
  const LOCAL_SESSION_KEY = "session_id";
  const ENFORCE_CHECK_INTERVAL_MS = 60_000; // periodic re-check while tab is open

  // ========= LOG HELPERS =========
  function log(...args) { if (DEBUG) console.log("[auth.js]", ...args); }
  function warn(...args) { console.warn("[auth.js]", ...args); }

  // ========= UTILS =========
  function safeRandomUUID() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    } catch (_) {}
    // Fallback
    return "sid_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
  }

  function getOrCreateLocalSessionId() {
    let sid = null;
    try { sid = localStorage.getItem(LOCAL_SESSION_KEY); } catch (_) {}
    if (!sid) {
      sid = safeRandomUUID();
      try { localStorage.setItem(LOCAL_SESSION_KEY, sid); } catch (_) {}
    }
    return sid;
  }

  function clearLocalSessionId() {
    try { localStorage.removeItem(LOCAL_SESSION_KEY); } catch (_) {}
  }

  // ========= SUPABASE CLIENT =========
  function getExistingSupabaseClient() {
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;

    // If page has `const supabaseClient = ...` declared globally, reuse it safely
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
    if (existing) {
      log("Reusing existing supabaseClient");
      return existing;
    }

    if (!window.supabase || !window.supabase.createClient) {
      warn("Supabase CDN not found. Add: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
      return null;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = client;
    window.__supabaseClient = client; // backward compat
    log("Created new supabaseClient");
    return client;
  }

  // ========= ADSENSE LOADER =========
  function loadAdsenseOnce(reason) {
    if (!ADS_ENABLED) { log("Ads disabled for this page"); return; }

    const existing =
      document.querySelector('script[data-adsense="true"]') ||
      document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');

    if (existing) { log("AdSense already present"); return; }

    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.setAttribute("data-adsense", "true");
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(ADSENSE_CLIENT);

    s.onload = () => log("AdSense loaded", reason ? "(" + reason + ")" : "");
    s.onerror = () => warn("AdSense failed to load");

    document.head.appendChild(s);
    log("Injected AdSense into <head>", reason ? "(" + reason + ")" : "");
  }

  // ========= PREMIUM UI =========
  function setPremiumUI(isPremium) {
    function apply() {
      document.documentElement.dataset.premium = isPremium ? "true" : "false";

      document.querySelectorAll(PREMIUM_ONLY_SELECTOR).forEach(el => {
        el.style.display = isPremium ? "" : "none";
      });

      const msg = document.getElementById(PREMIUM_MESSAGE_ID);
      if (msg) {
        msg.textContent = isPremium ? "" : "Become a premium member to access this feature.";
        msg.style.display = isPremium ? "none" : "block";
      }

      // Optional: if you have a badge element
      const badge = document.getElementById("premium-badge");
      if (badge) badge.style.display = isPremium ? "inline-flex" : "none";
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", apply, { once: true });
    } else {
      apply();
    }
  }

  // ========= PROFILE HELPERS =========
  async function fetchProfile(client, userId) {
    const { data, error } = await client
      .from("profiles")
      .select("is_premium, current_session_id")
      .eq("id", userId)
      .single();

    if (error) return { profile: null, error };
    return { profile: data || null, error: null };
  }

  async function updateCurrentSessionId(client, userId, newSessionId) {
    // NOTE: Requires RLS policy allowing users to update their own row.
    const { error } = await client
      .from("profiles")
      .update({ current_session_id: newSessionId })
      .eq("id", userId);

    if (error) throw error;
  }

  // ========= SINGLE-DEVICE (PREMIUM ONLY) =========
  async function enforceSingleDevicePremiumOnly(client, user, profile) {
    if (!user || !profile) return true;
    if (!profile.is_premium) return true; // enforce only for premium

    const localSid = getOrCreateLocalSessionId();
    const dbSid = profile.current_session_id;

    // If DB has a session and it does not match this device => sign out this device
    if (dbSid && dbSid !== localSid) {
      alert("Your premium account is active on another device. This device will be logged out.");
      try { await client.auth.signOut(); } catch (e) { warn("signOut failed:", e); }
      clearLocalSessionId();
      location.reload();
      return false;
    }

    return true;
  }

  async function claimPremiumSessionOnThisDevice(client, user, profile) {
    if (!user || !profile) return false;
    if (!profile.is_premium) return false;

    // Rotate/claim: set DB session to this device's session id.
    const localSid = getOrCreateLocalSessionId();

    // If already claimed, no-op
    if (profile.current_session_id === localSid) return true;

    await updateCurrentSessionId(client, user.id, localSid);
    log("Claimed premium session on this device");
    return true;
  }

  // ========= PUBLIC HELPERS =========
  window.__userIsPremium = false;

  window.showPremiumGate = function () {
    const modal = document.getElementById("premiumGateModal");
    if (modal) modal.style.display = "block";
    else alert("Become a premium member to access this feature.");
  };

  // Call this from your “Use as Faculty” button
  window.tryEnterFacultyMode = async function () {
    const client = ensureSupabaseClient();
    if (!client) { window.showPremiumGate(); return false; }

    try {
      const { data: { user }, error: userErr } = await client.auth.getUser();
      if (userErr) throw userErr;
      if (!user) { window.showPremiumGate(); return false; }

      const { profile, error: profErr } = await fetchProfile(client, user.id);
      if (profErr || !profile) {
        warn("Profile read failed (RLS/missing row).");
        window.showPremiumGate();
        return false;
      }

      const ok = await enforceSingleDevicePremiumOnly(client, user, profile);
      if (!ok) return false;

      if (!profile.is_premium) {
        window.showPremiumGate();
        return false;
      }

      window.__userIsPremium = true;
      setPremiumUI(true);
      return true;
    } catch (e) {
      warn("tryEnterFacultyMode error:", e);
      window.showPremiumGate();
      return false;
    }
  };

  // ========= MAIN INIT FLOW =========
  async function applyAuthState(client) {
    // Default: not premium
    window.__userIsPremium = false;
    setPremiumUI(false);

    const { data: { user }, error: userErr } = await client.auth.getUser();
    if (userErr) throw userErr;

    // Logged out => ads ON
    if (!user) {
      clearLocalSessionId(); // optional: clear local device token when logged out
      loadAdsenseOnce("logged-out");
      return false;
    }

    // Logged in => read profile
    const { profile, error: profErr } = await fetchProfile(client, user.id);

    // Can't verify => fail-open ads (do NOT aggressively sign out)
    if (profErr || !profile) {
      warn("Profile read failed => fail-open ads:", profErr);
      window.__userIsPremium = false;
      setPremiumUI(false);
      loadAdsenseOnce("profile-fail");
      return false;
    }

    // Premium: enforce (logout if this device is not the active one)
    const ok = await enforceSingleDevicePremiumOnly(client, user, profile);
    if (!ok) return false;

    const isPremium = !!profile.is_premium;
    window.__userIsPremium = isPremium;
    setPremiumUI(isPremium);

    if (!isPremium) {
      loadAdsenseOnce("non-premium");
      return false;
    }

    // Premium: ensure we have a local session id (do NOT rotate here; rotate only on SIGNED_IN)
    getOrCreateLocalSessionId();
    return true;
  }

  async function onSignedInClaimAndApply(client) {
    const { data: { user }, error: userErr } = await client.auth.getUser();
    if (userErr) throw userErr;
    if (!user) return false;

    const { profile, error: profErr } = await fetchProfile(client, user.id);
    if (profErr || !profile) {
      // Can't verify => don't block; fail-open ads
      warn("Profile read failed after sign-in (RLS/missing row).");
      window.__userIsPremium = false;
      setPremiumUI(false);
      loadAdsenseOnce("profile-fail-after-signin");
      return false;
    }

    // IMPORTANT: if premium, claim/rotate so other devices get kicked out
    if (profile.is_premium) {
      try {
        await claimPremiumSessionOnThisDevice(client, user, profile);
      } catch (e) {
        // If update fails (RLS), don't brick login — just treat as non-premium for gating
        warn("Failed to claim premium session (RLS?):", e);
      }
    }

    // Re-apply full state after claim (so UI matches latest DB)
    return await applyAuthState(client);
  }

  function startPremiumSessionWatchers(client) {
    // When the tab becomes visible again, re-check (kicks out if another device claimed)
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;

        const { profile } = await fetchProfile(client, user.id);
        if (!profile || !profile.is_premium) return;

        await enforceSingleDevicePremiumOnly(client, user, profile);
      } catch (e) {
        // Silent; do not spam alerts
        log("visibility recheck failed:", e);
      }
    });

    // Periodic check
    setInterval(async () => {
      try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;

        const { profile } = await fetchProfile(client, user.id);
        if (!profile || !profile.is_premium) return;

        await enforceSingleDevicePremiumOnly(client, user, profile);
      } catch (e) {
        log("interval recheck failed:", e);
      }
    }, ENFORCE_CHECK_INTERVAL_MS);
  }

  // ========= BOOTSTRAP =========
  window.authReady = (async function init() {
    const client = ensureSupabaseClient();

    // If auth can't run => fail-open ads
    if (!client) {
      window.__userIsPremium = false;
      setPremiumUI(false);
      loadAdsenseOnce("no-supabase");
      return false;
    }

    // Listen to auth events to handle magic link + password sign-ins reliably
    try {
      client.auth.onAuthStateChange(async (event) => {
        log("onAuthStateChange:", event);

        // Any time user signs in (magic link redirect triggers SIGNED_IN)
        if (event === "SIGNED_IN") {
          try { await onSignedInClaimAndApply(client); } catch (e) { warn("SIGNED_IN flow error:", e); }
          return;
        }

        // If user signs out in another tab, reflect it here
        if (event === "SIGNED_OUT") {
          try {
            window.__userIsPremium = false;
            setPremiumUI(false);
            clearLocalSessionId();
            loadAdsenseOnce("signed-out");
          } catch (_) {}
          return;
        }

        // For other events (TOKEN_REFRESHED, USER_UPDATED), just re-apply state
        if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          try { await applyAuthState(client); } catch (e) { log("Re-apply state failed:", e); }
        }
      });
    } catch (e) {
      // If onAuthStateChange fails for some reason, continue without it.
      warn("Failed to attach onAuthStateChange:", e);
    }

    // Initial run
    try {
      const isPremium = await applyAuthState(client);

      // Start watchers only if logged in (they are lightweight and self-check premium)
      startPremiumSessionWatchers(client);

      return isPremium;
    } catch (e) {
      warn("init failed => fail-open ads:", e);
      window.__userIsPremium = false;
      setPremiumUI(false);
      loadAdsenseOnce("init-error");
      return false;
    }
  })();
})();
