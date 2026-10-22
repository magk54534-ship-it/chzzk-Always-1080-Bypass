/*
 * MAIN world, document_start.
 *
 * Brave exposes navigator.brave. Some player flows use it to decide whether
 * to show the GRID/connector guide. On chzzk.naver.com only, remove that
 * property (or shadow it with an own property when it is not configurable).
 * User-Agent, UA-CH, cookies, and all other browser surfaces are untouched.
 */
(function () {
  "use strict";

  if (globalThis.__czz1080pPageLoaded) return;
  globalThis.__czz1080pPageLoaded = true;

  const SETTINGS_KEY = "czz1080p.settings.v1";
  const DEFAULTS = Object.freeze({
    autoQuality: true,
    braveBlock: true,
    cdnFallback: true,
    suppressGridPopup: true,
    debug: false,
  });
  const PROP = "brave";

  function normalizeSettings(raw) {
    const next = { ...DEFAULTS };
    if (!raw || typeof raw !== "object") return next;
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof raw[key] === "boolean") next[key] = raw[key];
    }
    return next;
  }

  function readStoredSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULTS };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  let settings = readStoredSettings();

  function findDescriptor() {
    let owner = window.navigator;
    while (owner) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, PROP);
      if (descriptor) return { owner, descriptor };
      owner = Object.getPrototypeOf(owner);
    }
    return null;
  }

  const original = findDescriptor();
  let installed = false;
  let ownProperty = false;

  function install() {
    if (installed || !original) return;

    try {
      if (original && original.descriptor.configurable) {
        const deleted = delete original.owner[PROP];
        if (deleted || !(PROP in window.navigator)) {
          installed = true;
          return;
        }
      }
    } catch (_) {
      // Fall through to an own property.
    }

    try {
      Object.defineProperty(window.navigator, PROP, {
        configurable: true,
        enumerable: false,
        get() {
          return undefined;
        },
      });
      ownProperty = true;
      installed = true;
      return;
    } catch (_) {
      // Last resort: redefine on the prototype.
    }

    try {
      Object.defineProperty(window.Navigator.prototype, PROP, {
        configurable: true,
        enumerable: false,
        get() {
          return undefined;
        },
      });
      installed = true;
    } catch (_) {
      installed = false;
    }
  }

  function uninstall() {
    if (!installed) return;

    try {
      if (ownProperty) {
        delete window.navigator[PROP];
        ownProperty = false;
      }
      if (original) {
        Object.defineProperty(original.owner, PROP, original.descriptor);
      }
    } catch (_) {
      // Keep the current page usable if the property is locked.
    }

    installed = false;
  }

  function sync() {
    if (settings.braveBlock) install();
    else uninstall();
  }

  sync();

  window.addEventListener(
    "czz1080p:content-ready",
    () => {
      window.__czz1080pContentAlive = true;
    },
    false,
  );

  window.addEventListener(
    "message",
    (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== "czz1080p" || data.type !== "settings") return;

      settings = normalizeSettings(data.settings);
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (_) {
        // Storage can be unavailable in private or partitioned contexts.
      }
      sync();
    },
    false,
  );
})();
