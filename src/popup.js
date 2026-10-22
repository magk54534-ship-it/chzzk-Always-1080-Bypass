(() => {
  "use strict";

  const core = globalThis.Czz1080pCore;
  if (!core) return;

  const inputs = [...document.querySelectorAll("[data-setting]")];
  const pageState = document.getElementById("page-state");
  const saveState = document.getElementById("save-state");

  let saveTimer = 0;

  function flashSaved() {
    if (!saveState) return;
    saveState.textContent = "저장됨";
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveState.textContent = "";
    }, 1200);
  }

  function render(settings) {
    for (const input of inputs) {
      input.checked = Boolean(settings[input.dataset.setting]);
    }
  }

  chrome.storage.sync.get(core.DEFAULTS, (values) => {
    if (chrome.runtime.lastError) {
      render(core.DEFAULTS);
      return;
    }
    render(core.normalizeSettings(values));
  });

  for (const input of inputs) {
    input.addEventListener("change", () => {
      const key = input.dataset.setting;
      chrome.storage.sync.set({ [key]: input.checked }, () => {
        if (!chrome.runtime.lastError) flashSaved();
      });
    });
  }

  document.getElementById("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !pageState) return;
      const tab = tabs && tabs[0];
      const url = String((tab && tab.url) || "");

      if (/^https:\/\/chzzk\.naver\.com\/live\/[^/?#]+/i.test(url)) {
        pageState.innerHTML =
          "<strong>치지직 라이브 탭</strong> — 설정을 바꾸면 열린 탭에 바로 반영됩니다.";
      } else if (/^https:\/\/chzzk\.naver\.com\//i.test(url)) {
        pageState.textContent =
          "치지직 페이지입니다. 자동 화질은 /live/ 방송 페이지에서만 동작합니다.";
      } else {
        pageState.textContent =
          "치지직 라이브 탭에서 사용하세요. 다른 사이트에는 개입하지 않습니다.";
      }
    });
  } catch (_) {
    // Ignore missing tabs API.
  }
})();
