(() => {
  "use strict";

  const core = globalThis.Czz1080pCore;
  if (!core) return;

  const inputs = [...document.querySelectorAll("[data-setting]")];
  const saveState = document.getElementById("save-state");
  const version = document.getElementById("version");
  let timer = 0;

  try {
    version.textContent = chrome.runtime.getManifest().version;
  } catch (_) {
    version.textContent = "1.0.0";
  }

  function render(settings) {
    for (const input of inputs) {
      input.checked = Boolean(settings[input.dataset.setting]);
    }
  }

  function flash(text) {
    if (!saveState) return;
    saveState.textContent = text;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      saveState.textContent = "";
    }, 1600);
  }

  function currentValues() {
    const values = { ...core.DEFAULTS };
    for (const input of inputs) {
      values[input.dataset.setting] = input.checked;
    }
    return values;
  }

  function save(values, message) {
    chrome.storage.sync.set(core.normalizeSettings(values), () => {
      if (chrome.runtime.lastError) {
        flash("저장 실패");
        return;
      }
      flash(message || "저장됨");
    });
  }

  chrome.storage.sync.get(core.DEFAULTS, (values) => {
    if (chrome.runtime.lastError) {
      render(core.DEFAULTS);
      return;
    }
    render(core.normalizeSettings(values));
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    const next = { ...core.DEFAULTS };
    for (const key of Object.keys(core.DEFAULTS)) {
      next[key] = changes[key] ? changes[key].newValue : undefined;
    }
    chrome.storage.sync.get(core.DEFAULTS, (values) => {
      if (!chrome.runtime.lastError) render(core.normalizeSettings(values));
    });
  });

  for (const input of inputs) {
    input.addEventListener("change", () => {
      save(currentValues(), "저장됨");
    });
  }

  document.getElementById("save").addEventListener("click", () => {
    save(currentValues(), "저장됨");
  });

  document.getElementById("reset").addEventListener("click", () => {
    render(core.DEFAULTS);
    save(core.DEFAULTS, "기본값 복원됨");
  });
})();
