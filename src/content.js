/*
 * ISOLATED world content script for https://chzzk.naver.com/*
 *
 * Responsibilities, in order:
 *   1. Mirror extension settings to the MAIN world (Brave guard).
 *   2. On live routes only, choose the best quality through the player UI.
 *   3. Relabel the 480p item as the CDN-backed "1080p with FUCK GRID" item.
 *   4. Close only the specific Naver connector/GRID guide via its decline button.
 *   5. Keep working across SPA navigation, refresh, fullscreen, and source changes.
 *
 * Every DOM operation is best-effort and wrapped so that a selector change
 * cannot break the page or produce unhandled console errors.
 */
(function () {
  "use strict";

  const core = globalThis.Czz1080pCore;
  if (!core) return;
  if (globalThis.__czz1080pContentLoaded) return;
  globalThis.__czz1080pContentLoaded = true;

  const {
    DEFAULTS,
    SETTINGS_KEY,
    normalizeSettings,
    isLivePath,
    normalizeText,
    isGridPrompt,
    isDeclineLabel,
    parseQualityLabel,
    chooseQuality,
    is1080Resolution,
  } = core;

  const LOG_PREFIX = "[CHZZK Brave 1080p]";
  const RELEVANT_SELECTOR = [
    "video",
    '[role="dialog"]',
    '[class*="dimmed"]',
    '[class*="layer"]',
    '[class*="modal"]',
    '[class*="popup"]',
    '[class*="alert"]',
    '[class*="quality"]',
    '[class*="setting"]',
    '[class*="pzp"]',
    '[class*="player"]',
  ].join(",");

  const SETTING_BUTTON_SELECTORS = [
    'button.pzp-setting-button[command="SettingCommands.Toggle"]',
    "button.pzp-setting-button",
    'button[class*="setting-button"]',
    'button[command*="Setting"]',
    'button[aria-label*="설정"]',
    'button[title*="설정"]',
    '[role="button"][aria-label*="설정"]',
  ];

  const QUALITY_ITEM_SELECTORS = [
    "ul.pzp-setting-quality-pane__list-container > li",
    '[class*="quality-pane"] li',
    '[class*="quality-list"] li',
    '[class*="setting-quality"] li',
    '[role="menuitemradio"]',
    '[role="radio"][class*="quality"]',
    'li[class*="quality"]',
  ];

  const state = {
    settings: { ...DEFAULTS },
    cdnActive: false,
    route: location.pathname,
    routeEpoch: 0,
    applyInFlight: false,
    nextAttemptAt: 0,
    attempts: 0,
    gridFailed: false,
    real1080Failed: false,
    cdnGraceUntil: 0,
    was1080: false,
    lastVideoSrc: "",
    scanTimer: 0,
    scanDueAt: 0,
    promptClicks: 0,
    openedMenu: false,
  };

  const labelledNodes = new Map();
  const hookedVideos = new WeakSet();
  const promptCooldowns = new WeakMap();

  let pageObserver = null;
  let intervalId = 0;

  function log(...args) {
    if (!state.settings.debug) return;
    try {
      console.debug(LOG_PREFIX, ...args);
    } catch (_) {
      // Console can be unavailable in exotic frames.
    }
  }

  function warn(...args) {
    if (!state.settings.debug) return;
    try {
      console.warn(LOG_PREFIX, ...args);
    } catch (_) {
      // Ignore.
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readSettings(callback) {
    try {
      chrome.storage.sync.get(DEFAULTS, (values) => {
        if (chrome.runtime.lastError) {
          callback({ ...DEFAULTS });
          return;
        }
        callback(normalizeSettings(values));
      });
    } catch (_) {
      callback({ ...DEFAULTS });
    }
  }

  function mirrorSettingsToPage() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (_) {
      // Private mode or partitioned storage.
    }
    try {
      window.postMessage(
        {
          source: "czz1080p",
          type: "settings",
          settings: state.settings,
        },
        location.origin,
      );
    } catch (_) {
      // Ignore.
    }
  }

  function refreshCdnState(attempt = 0) {
    if (!state.settings.cdnFallback) {
      state.cdnActive = false;
      restoreLabels();
      return;
    }

    const retry = (reason) => {
      if (attempt >= 4) {
        warn("cdn state unavailable", reason);
        return;
      }
      setTimeout(() => refreshCdnState(attempt + 1), 250 * (attempt + 1));
    };

    try {
      chrome.runtime.sendMessage({ type: "czz1080p:state" }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          retry(error.message);
          return;
        }

        if (!state.settings.cdnFallback) return;

        const active = Boolean(response && response.cdnActive);
        if (!active && attempt < 4) {
          retry("ruleset not active yet");
          return;
        }

        log("cdn state", active);
        if (active === state.cdnActive) return;
        state.cdnActive = active;
        if (!active) restoreLabels();
        else scheduleScan(0);
      });
    } catch (error) {
      retry(error && error.message ? error.message : String(error));
    }
  }

  function applySettings(next) {
    state.settings = normalizeSettings(next);
    mirrorSettingsToPage();

    if (!state.settings.autoQuality || !state.settings.cdnFallback) {
      restoreLabels();
      resetFailures();
    }

    refreshCdnState();

    if (isLivePath(location.pathname)) scheduleScan(0);
  }

  function isRendered(element) {
    if (!(element instanceof Element) || !element.isConnected) return false;
    try {
      const style = getComputedStyle(element);
      if (style.display === "none") return false;
      if (style.visibility === "hidden" || style.visibility === "collapse") return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch (_) {
      return false;
    }
  }

  function isVisible(element) {
    if (!isRendered(element)) return false;
    try {
      return Number(getComputedStyle(element).opacity) !== 0;
    } catch (_) {
      return true;
    }
  }

  /*
   * Chzzk's PZP player can live in light DOM or in open shadow roots. Search a
   * small set of player roots instead of walking the entire document every tick.
   */
  function collectSearchRoots() {
    const roots = [document];
    let anchors = [];
    try {
      anchors = document.querySelectorAll(
        "pzp-pc,pzp-player,pzp-core-player,pzp-pc-player,.chzzk_player,[class*='chzzk_player']",
      );
    } catch (_) {
      anchors = [];
    }

    for (const anchor of anchors) {
      if (anchor.shadowRoot && !roots.includes(anchor.shadowRoot)) {
        roots.push(anchor.shadowRoot);
      }
    }

    for (let index = 0; index < roots.length && roots.length < 12; index += 1) {
      const root = roots[index];
      let nested = [];
      try {
        nested = root.querySelectorAll(
          "pzp-pc,pzp-player,pzp-core-player,[class*='pzp'],[class*='player']",
        );
      } catch (_) {
        continue;
      }
      for (const element of nested) {
        if (element.shadowRoot && !roots.includes(element.shadowRoot)) {
          roots.push(element.shadowRoot);
          if (roots.length >= 12) break;
        }
      }
    }

    return roots;
  }

  function queryAllAcrossRoots(selector, roots) {
    const result = [];
    const seen = new Set();
    const searchRoots = roots || collectSearchRoots();

    for (const root of searchRoots) {
      let found = [];
      try {
        found = root.querySelectorAll(selector);
      } catch (_) {
        continue;
      }
      for (const element of found) {
        if (seen.has(element)) continue;
        seen.add(element);
        result.push(element);
      }
    }

    return result;
  }

  function isAdVideo(video) {
    try {
      return Boolean(
        video.closest(
          '#preAdPlayerWrapper,#preAdContentPlayer,[data-role="imaAdContainerEl"],[data-role="gvAdContainerEl"],#midAdPlayerWrapper,[class*="adContainer"]',
        ),
      );
    } catch (_) {
      return false;
    }
  }

  function findVideos() {
    const roots = collectSearchRoots();
    return queryAllAcrossRoots("video", roots).filter(
      (video) => video instanceof HTMLVideoElement && !isAdVideo(video),
    );
  }

  function videoArea(video) {
    const rect = video.getBoundingClientRect();
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function findMainVideo() {
    const videos = findVideos();
    if (!videos.length) return null;

    const playable = videos.filter(
      (video) => video.readyState >= 1 || Boolean(video.currentSrc),
    );
    const candidates = playable.length ? playable : videos;
    candidates.sort((a, b) => videoArea(b) - videoArea(a));
    return candidates[0] || null;
  }

  function ensureVideoHooks() {
    const video = findMainVideo();
    if (!video) return null;

    if (!hookedVideos.has(video)) {
      hookedVideos.add(video);
      for (const eventName of [
        "loadedmetadata",
        "durationchange",
        "playing",
        "resize",
        "emptied",
        "canplay",
      ]) {
        video.addEventListener(eventName, () => scheduleScan(120), true);
      }
    }

    return video;
  }

  function findSettingButton() {
    const roots = collectSearchRoots();
    for (const selector of SETTING_BUTTON_SELECTORS) {
      for (const element of queryAllAcrossRoots(selector, roots)) {
        if (!isRendered(element)) continue;
        if (element.closest('[role="dialog"]')) continue;
        return element;
      }
    }
    return null;
  }

  function findQualityEntry() {
    const roots = collectSearchRoots();
    const directSelectors = [
      "div.pzp-setting-intro-quality",
      '[class*="setting-intro-quality"]',
      '[class*="intro-quality"]',
    ];

    for (const selector of directSelectors) {
      for (const element of queryAllAcrossRoots(selector, roots)) {
        if (!isRendered(element)) continue;
        if (!/화질/.test(normalizeText(element.textContent))) continue;
        return element;
      }
    }

    const candidates = queryAllAcrossRoots(
      'button,[role="button"],[class*="quality"]',
      roots,
    );
    for (const element of candidates) {
      if (!isRendered(element)) continue;
      const text = normalizeText(element.textContent);
      if (!text || text.length > 40) continue;
      if (!/화질/.test(text)) continue;
      if (/(\d{3,4}\s*p|원본)/i.test(text)) continue;
      return element;
    }

    return null;
  }

  function findQualityItemElements() {
    const roots = collectSearchRoots();
    const items = [];
    const seen = new Set();

    for (const selector of QUALITY_ITEM_SELECTORS) {
      for (const element of queryAllAcrossRoots(selector, roots)) {
        if (!(element instanceof HTMLElement) || seen.has(element)) continue;
        const text = normalizeText(element.textContent);
        if (!text || text.length > 160) continue;
        if (!/(\d{3,4}\s*p|원본|auto|자동)/i.test(text)) continue;
        if (element.querySelector('li[class*="quality"],[role="menuitemradio"]')) continue;
        seen.add(element);
        items.push(element);
      }
    }

    return items;
  }

  function replaceTextNodes(root, pattern, replacement) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(parent.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return pattern.test(node.nodeValue || "")
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const current = node.nodeValue || "";
      if (!labelledNodes.has(node)) {
        labelledNodes.set(node, { original: current, replacement });
      }
      const next = current.replace(pattern, replacement);
      if (next !== current) node.nodeValue = next;
    }

    return nodes.length;
  }

  function decorateItem(element) {
    if (!state.settings.cdnFallback || !state.cdnActive) return;
    if (element.dataset.czzCdn === "1") return;

    const parsed = parseQualityLabel(element.textContent);
    if (!parsed.is480 || parsed.gridFree) return;

    if (!replaceTextNodes(element, /480\s*p/gi, "1080p with FUCK GRID")) return;

    element.dataset.czzCdn = "1";
    element.setAttribute("data-czz-cdn", "1");
    log("relabelled the 480p item as the CDN 1080p item");
  }

  function decorateHomeEntry() {
    if (!state.settings.cdnFallback || !state.cdnActive) return;

    const entries = queryAllAcrossRoots(
      ".pzp-setting-intro-quality, [class*='setting-intro-quality']",
    );

    for (const entry of entries) {
      if (!(entry instanceof HTMLElement)) continue;
      if (!/480\s*p/i.test(entry.textContent || "")) continue;
      if (!replaceTextNodes(entry, /480\s*p/i, "1080p (CDN)")) continue;
      entry.dataset.czzCdnEntry = "1";
      log("relabelled the settings quality entry as 1080p (CDN)");
    }
  }

  function decorateCdnLabels() {
    if (!state.settings.cdnFallback || !state.cdnActive) return;

    try {
      for (const element of findQualityItemElements()) decorateItem(element);
      decorateHomeEntry();
    } catch (error) {
      warn("label decoration failed", error);
    }
  }

  function restoreLabels() {
    for (const [node, entry] of labelledNodes) {
      try {
        if (!entry || !node.isConnected) continue;
        if ((node.nodeValue || "").includes(entry.replacement)) {
          node.nodeValue = entry.original;
        }
      } catch (_) {
        // Ignore detached nodes.
      }
    }
    labelledNodes.clear();

    try {
      for (const root of collectSearchRoots()) {
        let marked = [];
        try {
          marked = root.querySelectorAll("[data-czz-cdn]");
        } catch (_) {
          continue;
        }
        for (const element of marked) {
          delete element.dataset.czzCdn;
          element.removeAttribute("data-czz-cdn");
        }

        let entries = [];
        try {
          entries = root.querySelectorAll("[data-czz-cdn-entry]");
        } catch (_) {
          entries = [];
        }
        for (const element of entries) {
          delete element.dataset.czzCdnEntry;
          element.removeAttribute("data-czz-cdn-entry");
        }
      }
    } catch (_) {
      // Ignore.
    }
  }

  function normalizeItem(element) {
    const parsed = parseQualityLabel(element.textContent);
    const classText = String(element.className || "");
    const marked =
      element.dataset.czzCdn === "1" && /fuck\s*grid/i.test(parsed.text);

    let checked =
      element.getAttribute("aria-checked") === "true" ||
      element.getAttribute("aria-selected") === "true" ||
      /(?:^|[\s_-])(?:checked|selected|active)(?:$|[\s_-])/i.test(classText);

    if (!checked) {
      try {
        checked = Boolean(
          element.querySelector(
            '[class*="--checked"],[aria-checked="true"],[class*="selected"]',
          ),
        );
      } catch (_) {
        checked = false;
      }
    }

    const disabled =
      element.getAttribute("aria-disabled") === "true" ||
      Boolean(element.disabled) ||
      /disabled/i.test(classText);

    return {
      el: element,
      ...parsed,
      checked,
      disabled,
      gridFree: marked || parsed.gridFree,
      isReal1080: parsed.isReal1080 && !marked,
    };
  }

  function collectQualityItems() {
    const elements = findQualityItemElements();
    for (const element of elements) decorateItem(element);
    return elements.map(normalizeItem);
  }

  function clickElement(element) {
    try {
      element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    } catch (_) {
      // Ignore.
    }
    try {
      element.click();
    } catch (_) {
      // Give up quietly.
    }
  }

  function wakeControls() {
    const video = findMainVideo();
    if (!video) return;
    try {
      const rect = video.getBoundingClientRect();
      const x = rect.left + Math.max(1, rect.width / 2);
      const y = rect.top + Math.max(1, rect.height / 2);
      const target = document.elementFromPoint(x, y) || video;
      for (const type of ["pointermove", "mousemove", "mouseover"]) {
        target.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            view: window,
          }),
        );
      }
      video.focus?.({ preventScroll: true });
    } catch (_) {
      // Ignore.
    }
  }

  async function ensureQualityMenu() {
    let items = findQualityItemElements().filter(isRendered);
    if (items.length) return { ok: true, opened: false };

    wakeControls();
    await sleep(90);

    const entry = findQualityEntry();
    if (entry) {
      clickElement(entry);
      await sleep(220);
      items = findQualityItemElements().filter(isRendered);
      if (items.length) return { ok: true, opened: true };
    }

    const button = findSettingButton();
    if (!button) return { ok: false, opened: false };

    clickElement(button);
    state.openedMenu = true;
    await sleep(240);

    items = findQualityItemElements().filter(isRendered);
    if (items.length) return { ok: true, opened: true };

    const qualityEntry = findQualityEntry();
    if (qualityEntry) {
      clickElement(qualityEntry);
      await sleep(200);
    }

    items = findQualityItemElements().filter(isRendered);
    return { ok: items.length > 0, opened: true };
  }

  function closeMenuIfOpen() {
    if (!state.openedMenu) return;
    state.openedMenu = false;
    if (!findQualityItemElements().some(isRendered)) return;

    const button = findSettingButton();
    if (!button) return;
    clickElement(button);
  }

  function isItemChecked(element) {
    const classText = String(element.className || "");
    return (
      element.getAttribute("aria-checked") === "true" ||
      element.getAttribute("aria-selected") === "true" ||
      /(?:^|[\s_-])(?:checked|selected|active)(?:$|[\s_-])/i.test(classText)
    );
  }

  async function selectItem(element) {
    try {
      element.focus?.({ preventScroll: true });
    } catch (_) {
      // Ignore.
    }

    for (const type of ["keydown", "keyup"]) {
      try {
        element.dispatchEvent(
          new KeyboardEvent(type, {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          }),
        );
      } catch (_) {
        // Ignore.
      }
    }

    await sleep(160);
    if (isItemChecked(element)) return;

    try {
      element.click();
    } catch (_) {
      // Ignore.
    }
  }

  function resetFailures() {
    state.gridFailed = false;
    state.real1080Failed = false;
    state.cdnGraceUntil = 0;
    state.attempts = 0;
    state.nextAttemptAt = 0;
  }

  function backoff() {
    const exponent = Math.min(state.attempts, 5);
    const delay = Math.min(12000, 800 * Math.pow(1.7, exponent));
    state.nextAttemptAt = Date.now() + delay;
    scheduleScan(delay);
  }

  async function applyOnce(video) {
    if (state.applyInFlight) return;
    state.applyInFlight = true;

    const epoch = state.routeEpoch;
    let openedMenu = false;

    try {
      const menu = await ensureQualityMenu();
      openedMenu = menu.opened;
      if (!menu.ok) {
        state.attempts += 1;
        backoff();
        return;
      }
      if (epoch !== state.routeEpoch) return;

      const items = collectQualityItems();
      if (!items.length) {
        state.attempts += 1;
        backoff();
        return;
      }

      const now = Date.now();
      const currentIs1080 = is1080Resolution(video.videoWidth, video.videoHeight);
      const choice = chooseQuality(items, {
        cdnEnabled: state.settings.cdnFallback && state.cdnActive,
        currentIs1080,
        gridFailed: state.gridFailed,
        real1080Failed: state.real1080Failed,
      });

      log(
        "quality choice",
        choice.kind,
        items.map((item) => `${item.text}${item.checked ? "*" : ""}`),
      );

      if (!choice.item || choice.kind === "none") {
        state.attempts += 1;
        backoff();
        return;
      }

      if (choice.item.checked) {
        if (choice.kind === "grid") {
          if (now < state.cdnGraceUntil) {
            scheduleScan(Math.min(4000, state.cdnGraceUntil - now + 120));
            return;
          }
          state.gridFailed = true;
          restoreLabels();
          state.nextAttemptAt = Date.now() + 250;
          scheduleScan(250);
          return;
        }

        if (choice.kind === "1080") {
          state.real1080Failed = true;
          state.nextAttemptAt = Date.now() + 250;
          scheduleScan(250);
          return;
        }

        state.nextAttemptAt = Date.now() + 10000;
        return;
      }

      await selectItem(choice.item.el);
      state.attempts += 1;

      if (choice.kind === "grid") {
        state.cdnGraceUntil = Date.now() + 7000;
        state.gridFailed = false;
        state.real1080Failed = false;
      } else if (choice.kind === "1080") {
        state.cdnGraceUntil = 0;
      } else if (choice.kind === "cdn480" || choice.kind === "480") {
        state.cdnGraceUntil = Date.now() + 5000;
      }

      await sleep(1200);
      if (epoch !== state.routeEpoch) return;

      const currentVideo = findMainVideo() || video;
      if (is1080Resolution(currentVideo.videoWidth, currentVideo.videoHeight)) {
        state.attempts = 0;
        state.gridFailed = false;
        state.real1080Failed = false;
        state.nextAttemptAt = 0;
        state.was1080 = true;
        log("verified 1080p playback");
      } else {
        scheduleScan(1300);
      }
    } catch (error) {
      warn("quality apply failed", error);
      state.attempts += 1;
      backoff();
    } finally {
      state.applyInFlight = false;
      if (openedMenu) {
        try {
          closeMenuIfOpen();
        } catch (error) {
          warn("menu close failed", error);
        }
      }
    }
  }

  function maybeApplyQuality(video) {
    if (!state.settings.autoQuality || !isLivePath(location.pathname)) return;
    if (!video || video.readyState < 1) return;

    const source = video.currentSrc || "";
    if (source && source !== state.lastVideoSrc) {
      state.lastVideoSrc = source;
      resetFailures();
    }

    const width = video.videoWidth;
    const height = video.videoHeight;

    if (is1080Resolution(width, height)) {
      if (!state.was1080) {
        state.was1080 = true;
        state.gridFailed = false;
        state.real1080Failed = false;
        state.attempts = 0;
        state.nextAttemptAt = 0;
      }
      return;
    }

    if (state.was1080) {
      state.was1080 = false;
      resetFailures();
    }

    if (state.applyInFlight) return;
    if (Date.now() < state.nextAttemptAt) return;
    if (document.visibilityState === "hidden") return;

    applyOnce(video);
  }

  function scanGridPrompts() {
    if (!state.settings.suppressGridPopup) return false;

    const roots = collectSearchRoots();
    const candidates = new Set();

    for (const selector of [
      '[role="dialog"]',
      '[class*="dimmed"]',
      '[class*="layer"]',
      '[class*="modal"]',
      '[class*="popup"]',
      '[class*="alert"]',
    ]) {
      for (const element of queryAllAcrossRoots(selector, roots)) {
        if (isVisible(element)) candidates.add(element);
      }
    }

    if (!candidates.size) return false;

    const sorted = [...candidates].sort(
      (a, b) =>
        normalizeText(a.textContent).length - normalizeText(b.textContent).length,
    );
    const now = Date.now();

    for (const container of sorted) {
      let text = "";
      try {
        text = container.textContent || "";
      } catch (_) {
        continue;
      }
      if (text.length > 2400 || !isGridPrompt(text)) continue;

      const controls = queryAllAcrossRoots(
        'button,[role="button"],a',
        [container],
      );

      for (const control of controls) {
        if (!isVisible(control)) continue;
        if (!isDeclineLabel(control.textContent)) continue;
        if (
          control.disabled ||
          control.getAttribute("aria-disabled") === "true"
        ) {
          continue;
        }

        const last = promptCooldowns.get(control) || 0;
        if (now - last < 8000) continue;
        promptCooldowns.set(control, now);

        state.promptClicks += 1;
        state.real1080Failed = true;

        try {
          control.click();
        } catch (error) {
          warn("grid prompt decline failed", error);
          continue;
        }

        log("declined the connector/GRID guide");
        scheduleScan(250);
        return true;
      }
    }

    return false;
  }

  function scan() {
    if (!isLivePath(location.pathname)) return;

    const video = ensureVideoHooks();
    if (state.settings.suppressGridPopup) scanGridPrompts();
    if (state.settings.autoQuality && video) maybeApplyQuality(video);
    decorateCdnLabels();
  }

  function scheduleScan(delay) {
    const wait = Math.max(0, Number(delay) || 0);
    const dueAt = Date.now() + wait;

    if (state.scanTimer) {
      if (state.scanDueAt <= dueAt) return;
      clearTimeout(state.scanTimer);
    }

    state.scanDueAt = dueAt;
    state.scanTimer = setTimeout(() => {
      state.scanTimer = 0;
      state.scanDueAt = 0;
      try {
        scan();
      } catch (error) {
        warn("scan failed", error);
      }
    }, wait);
  }

  function onRouteChange() {
    const pathname = location.pathname;
    if (pathname === state.route) return;

    state.route = pathname;
    state.routeEpoch += 1;
    state.was1080 = false;
    state.lastVideoSrc = "";
    state.openedMenu = false;

    restoreLabels();
    resetFailures();

    if (isLivePath(pathname)) scheduleScan(50);
  }

  function installObserver() {
    if (pageObserver || !document.documentElement) return;

    pageObserver = new MutationObserver((mutations) => {
      if (!isLivePath(location.pathname)) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (!(node instanceof Element)) continue;
          try {
            if (node.matches(RELEVANT_SELECTOR) || node.querySelector(RELEVANT_SELECTOR)) {
              scheduleScan(180);
              return;
            }
          } catch (_) {
            // Ignore invalid selector errors on unusual nodes.
          }
        }
      }
    });

    try {
      pageObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (error) {
      warn("observer failed", error);
    }
  }

  function tick() {
    onRouteChange();
    if (!isLivePath(location.pathname)) return;

    const video = ensureVideoHooks();
    if (state.settings.suppressGridPopup) scanGridPrompts();
    if (state.settings.autoQuality && video) maybeApplyQuality(video);
    decorateCdnLabels();
  }

  function boot() {
    installObserver();

    readSettings((settings) => {
      applySettings(settings);

      try {
        window.dispatchEvent(new Event("czz1080p:content-ready"));
      } catch (_) {
        // Ignore cross-world event failures.
      }

      try {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== "sync") return;
          const next = { ...state.settings };
          for (const key of Object.keys(DEFAULTS)) {
            if (changes[key]) next[key] = changes[key].newValue;
          }
          applySettings(next);
        });
      } catch (error) {
        warn("storage listener failed", error);
      }

      window.addEventListener("popstate", onRouteChange, true);
      window.addEventListener("hashchange", onRouteChange, true);
      window.addEventListener(
        "pageshow",
        () => {
          mirrorSettingsToPage();
          scheduleScan(100);
        },
        true,
      );
      document.addEventListener(
        "visibilitychange",
        () => scheduleScan(100),
        true,
      );

      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(tick, 1500);

      onRouteChange();
      scheduleScan(0);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
