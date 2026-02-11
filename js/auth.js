/* /js/auth.js
   Global auth + premium + ads loader
   - loads AdSense ONLY for logged-out or non-premium users
   - enforces single-device session using profiles.current_session_id
*/

(function () {
  // === CONFIG ===
  const SUPABASE_URL = "https://yffplpmnolyyvvklcxev.supabase.co";
  const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE"; // use the same anon key you already have
  const ADSENSE_CLIENT = "ca-pub-2265275210848597";

  // Pages can override this by setting: window.__ADS_ENABLED__ = false;
  const ADS_ENABLED = (window.__ADS_ENABLED__ !== false);

  // Elements with this attribute will be premium-gated (hidden for non-premium):
  // <div data-premium-only> ... </div>
  const PREMIUM_ONLY_SELECTOR = "[data-premium-only]";

  // Where to show a premium message if gated (optional)
  // <div id="premium-message"></div>
  const PREMIUM_MESSAGE_ID = "premium-message";

  // === Guard: require supabase-js v2 ===
  if (!window.supabase || !window.supabase.createClient) {
    console.warn("[auth.js] Supabase library not found. Did you include the CDN script?");
    return;
  }

  const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function loadAdsenseScript() {
    // Avoid double-loading
    if (document.querySelector('script[data-adsense="true"]')) return;

    const s = document.createElement("script");
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2265275210848597}`;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.setAttribute("data-adsense", "true");
    document.head.appendChild(s);
  }

  function setPremiumUI(isPremium) {
    // Mark on body for CSS hooks if you want
    document.documentElement.dataset.premium = isPremium ? "true" : "false";

    // Hide premium-only elements for non-premium
    const premiumEls = document.querySelectorAll(PREMIUM_ONLY_SELECTOR);
    premiumEls.forEach(el => {
      el.style.display = isPremium ? "" : "none";
    });

    // Optional message area
    const msg = document.getElementById(PREMIUM_MESSAGE_ID);
    if (msg) {
      msg.textContent = isPremium ? "" : "Become a premium member to access this feature.";
      msg.style.display = isPremium ? "none" : "block";
    }
  }

  async function enforceSingleDevice(profile) {
    const localSession = localStorage.getItem("session_id");

    // If the server has a session_id and it doesn't match local => kick this device
    if (profile?.current_session_id && profile.current_session_id !== localSession) {
      alert("Logged in from another device.");
      await supabaseClient.auth.signOut();
      localStorage.removeItem("session_id");

      // Redirect to home (or a login page) if you want
      // location.href = "/index.html";
      location.reload();
      return false;
    }
    return true;
  }

  // Make these available for other scripts/pages if needed
  window.__supabaseClient = supabaseClient;
  window.__userIsPremium = false;

  // Optional: reusable premium gate modal trigger (if present)
  window.showPremiumGate = function () {
    const modal = document.getElementById("premiumGateModal");
    if (modal) modal.style.display = "block";
    else alert("Become a premium member to access this feature.");
  };

  window.tryEnterFacultyMode = async function () {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      window.showPremiumGate();
      return false;
    }

    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("is_premium, current_session_id")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      alert("Unable to verify premium status. Please try again.");
      return false;
    }

    const ok = await enforceSingleDevice(profile);
    if (!ok) return false;

    if (!profile.is_premium) {
      window.showPremiumGate();
      return false;
    }

    window.__userIsPremium = true;
    return true;
  };

  async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    // Logged out → ads allowed, premium UI off
    if (!user) {
      window.__userIsPremium = false;
      setPremiumUI(false);
      if (ADS_ENABLED) loadAdsenseScript();
      return;
    }

    // Logged in → check profile
    const { data: profile, error } = await supabaseClient
      .from("profiles")
      .select("is_premium, current_session_id")
      .eq("id", user.id)
      .single();

    // If profile missing or blocked by RLS, fail safe: treat as non-premium
    if (error || !profile) {
      window.__userIsPremium = false;
      setPremiumUI(false);
      if (ADS_ENABLED) loadAdsenseScript();
      return;
    }

    // Enforce one device
    const ok = await enforceSingleDevice(profile);
    if (!ok) return;

    // Premium?
    const isPremium = !!profile.is_premium;
    window.__userIsPremium = isPremium;
    setPremiumUI(isPremium);

    // Ads only if not premium
    if (!isPremium && ADS_ENABLED) loadAdsenseScript();
  }

  // Run after DOM is ready (so it can hide premium-only blocks)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();