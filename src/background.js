importScripts("/src/core.js");

const { DEFAULTS } = self.Czz1080pCore;
const RULESET_ID = "quality_redirect";

async function ensureDefaults() {
  try {
    const existing = await chrome.storage.sync.get(null);
    const patch = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (typeof existing[key] !== "boolean") patch[key] = value;
    }
    if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
  } catch (error) {
    console.warn("[CHZZK Brave 1080p] failed to initialise settings", error);
  }
}

async function syncRules() {
  let enabled = DEFAULTS.cdnFallback;

  try {
    const values = await chrome.storage.sync.get({
      cdnFallback: DEFAULTS.cdnFallback,
    });
    enabled = Boolean(values.cdnFallback);
  } catch (_) {
    // Fall back to the default when storage is unavailable.
  }

  try {
    if (enabled) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: [RULESET_ID],
      });
    } else {
      await chrome.declarativeNetRequest.updateEnabledRulesets({
        disableRulesetIds: [RULESET_ID],
      });
    }
  } catch (error) {
    console.warn("[CHZZK Brave 1080p] failed to update CDN ruleset", error);
  }
}

async function isCdnActive() {
  try {
    const ids = await chrome.declarativeNetRequest.getEnabledRulesets();
    return ids.includes(RULESET_ID);
  } catch (_) {
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults().then(syncRules);
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults().then(syncRules);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (changes.cdnFallback) syncRules();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "czz1080p:state") {
    isCdnActive().then((cdnActive) => sendResponse({ cdnActive }));
    return true;
  }

  if (message && message.type === "czz1080p:refresh-rules") {
    syncRules().then(async () => {
      sendResponse({ cdnActive: await isCdnActive() });
    });
    return true;
  }

  return false;
});

syncRules();
