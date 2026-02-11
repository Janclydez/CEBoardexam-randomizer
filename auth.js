/* /js/auth.js
   Purpose:
   - One shared auth + premium + single-device enforcement for ALL pages
   - Load AdSense ONLY for logged-out or non-premium users (fail-open for revenue)
   - Provide:
       window.__userIsPremium (boolean)
       window.authReady (Promise<boolean>)
       window.showPremiumGate()
       window.tryEnterFacultyMode()
*/

(function () {
  "use strict";

  // ========= CONFIG (EDIT THESE ONLY) =========
  // Copied from index.html:
  // supabase.createClient("URL", "ANON_KEY")  :contentReference[oaicite:5]{index=5}
  const SUPABASE_URL = "https://yffplpmnolyyvvklcxev.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmZnBscG1ub2x5eXZ2a2xjeGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3ODAwNTUsImV4cCI6MjA4NjM1NjA1NX0.AdOHKrrDoRmDUfCcL3KWrJKFxcBKgQZkvmxluo0WRVk"; // <-- paste your anon key here

  // Copied from index.html meta/google-adsense-account :contentReference[oaicite:6]{index=6}
  const ADSENSE_CLIENT = "ca-pub-2265275210848597";

  // ========= OPTIONAL FLAGS =========
  const DEBUG = (window.__AUTH_DEBUG__ === true);
  const ADS_ENABLED = (window.__ADS_ENABLED__ !== false);

  // Premium UI hooks (optional)
  const PREMIUM_ONLY_SELECTOR = "[data-premium-only]";
  const PREMIUM_MESSAGE_ID = "premium-message"; // optional element id to show “premium required”

  // ========= LOG HELPERS =========
  function log(...args) { if (DEBUG) console.log("[auth.js]", ...args); }
  function warn(...args) { console.warn("[auth.js]", ...args); }

  // ========= SUPABASE CLIENT =========
  function getExistingSupabaseClient() {
    // If other scripts set window.supabaseClient, reuse it
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;

    // If page has `const supabaseClient = ...` declared globally, reuse it safely
    // (must use typeof to avoid ReferenceError in modules/IIFE)
    try {
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

    // If already present, don’t inject again
    const existing =
      document.querySelector('script[data-adsense="true"]') ||
      document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');

    if (existing) { log("AdSense already present"); return; }

    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.setAttribute("data-adsense", "true");
   s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`;

    s.onload = () => log("AdSense loaded", reason ? `(${reason})` : "");
    s.onerror = () => warn("AdSense failed to load");

    document.head.appendChild(s);
    log("Injected AdSense into <head>", reason ? `(${reason})` : "");
  }

  // ========= PREMIUM UI =========
  function setPremiumUI(isPremium) {
    function apply() {
      document.documentElement.dataset.premium = isPremium ? "true" : "false";

      // Hide premium-only elements if not premium
      document.querySelectorAll(PREMIUM_ONLY_SELECTOR).forEach(el => {
        el.style.display = isPremium ? "" : "none";
      });

      // Optional message area
      const msg = document.getElementById(PREMIUM_MESSAGE_ID);
      if (msg) {
        msg.textContent = isPremium ? "" : "Become a premium member to access this feature.";
        msg.style.display = isPremium ? "none" : "block";
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", apply, { once: true });
    } else {
      apply();
    }
  }

  // ========= SINGLE DEVICE =========
  async function enforceSingleDevice(client, profile) {
    const localSession = localStorage.getItem("session_id");

    // Only enforce if DB actually has a session recorded
    if (profile?.current_session_id && profile.current_session_id !== localSession) {
      alert("Logged in from another device.");
      try { await client.auth.signOut(); } catch (e) { warn("signOut failed:", e); }
      localStorage.removeItem("session_id");
      location.reload();
      return false;
    }
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

      const { data: profile, error: profErr } = await client
        .from("profiles")
        .select("is_premium, current_session_id")
        .eq("id", user.id)
        .single();

      if (profErr || !profile) {
        warn("Profile read failed (RLS/missing row).");
        window.showPremiumGate();
        return false;
      }

      const ok = await enforceSingleDevice(client, profile);
      if (!ok) return false;

      if (!profile.is_premium) {
        window.showPremiumGate();
        return false;
      }

      window.__userIsPremium = true;
      return true;
    } catch (e) {
      warn("tryEnterFacultyMode error:", e);
      window.showPremiumGate();
      return false;
    }
  };

  // ========= MAIN INIT =========
  window.authReady = (async function init() {
    const client = ensureSupabaseClient();

    // If auth can't run => fail-open ads
    if (!client) {
      window.__userIsPremium = false;
      setPremiumUI(false);
      loadAdsenseOnce("no-supabase");
      return false;
    }

    try {
      const { data: { user }, error: userErr } = await client.auth.getUser();
      if (userErr) throw userErr;

      // Logged out => ads ON
      if (!user) {
        window.__userIsPremium = false;
        setPremiumUI(false);
        loadAdsenseOnce("logged-out");
        return false;
      }

      const { data: profile, error: profErr } = await client
        .from("profiles")
        .select("is_premium, current_session_id")
        .eq("id", user.id)
        .single();

      // Can't verify => fail-open ads
      if (profErr || !profile) {
        window.__userIsPremium = false;
        setPremiumUI(false);
        loadAdsenseOnce("profile-fail");
        return false;
      }

      const ok = await enforceSingleDevice(client, profile);
      if (!ok) return false;

      const isPremium = !!profile.is_premium;
      window.__userIsPremium = isPremium;
      setPremiumUI(isPremium);

      if (!isPremium) loadAdsenseOnce("non-premium");
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