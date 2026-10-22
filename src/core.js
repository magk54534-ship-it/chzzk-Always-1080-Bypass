/*
 * Shared, dependency-free helpers for the ISOLATED and MAIN worlds.
 * This file is loaded as a classic content script, so it exposes a small
 * namespace on globalThis instead of using ES modules.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Czz1080pCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = Object.freeze({
    autoQuality: true,
    braveBlock: true,
    cdnFallback: true,
    suppressGridPopup: true,
    debug: false,
  });

  const SETTINGS_KEY = "czz1080p.settings.v1";
  const LIVE_PATH_RE = /^\/live\/[A-Za-z0-9_-]+\/?$/;

  function normalizeSettings(raw) {
    const next = { ...DEFAULTS };
    if (!raw || typeof raw !== "object") return next;
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof raw[key] === "boolean") next[key] = raw[key];
    }
    return next;
  }

  function isLivePath(pathname) {
    return LIVE_PATH_RE.test(String(pathname || ""));
  }

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactText(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }

  const DANGER_RE =
    /(로그인|결제|구매|비밀번호|인증|보안|카드|포인트|후원|광고|쿠폰|환불|계정|신고)/i;

  function hasDangerousText(value) {
    return DANGER_RE.test(normalizeText(value));
  }

  /*
   * Only match the narrow "high quality needs the Naver connector" guide.
   * Login, payment, security, report, and advertising surfaces are excluded.
   */
  function isGridPrompt(value) {
    const text = normalizeText(value);
    if (!text || text.length > 1600) return false;
    if (hasDangerousText(text)) return false;

    const mentionsConnector =
      /(네이버\s*라이브\s*스트리밍|라이브\s*스트리밍\s*커넥터|N?\s*Live\s*Connector|그리드|GRID)/i.test(
        text,
      );
    const mentionsInstall = /(설치|확장\s*프로그램|커넥터)/.test(text);
    const mentionsQuality = /(고화질|1080\s*p|화질)/i.test(text);
    const browserGuide =
      /브라우저\s*확장\s*프로그램/.test(text) &&
      /고화질\s*시청/.test(text) &&
      /설치/.test(text);

    return (mentionsConnector && mentionsInstall && mentionsQuality) || browserGuide;
  }

  function isDeclineLabel(value) {
    const text = compactText(value);
    if (!text) return false;
    if (/설치\s*없이/i.test(text)) return true;
    return /^(일반\s*화질(?:로)?\s*시청|나중에\s*시청|다음에|닫기)$/.test(text);
  }

  function parseQualityLabel(value) {
    const text = normalizeText(value);
    const lower = text.toLowerCase();

    const gridFree =
      /(fuck\s*grid|grid\s*(?:없이|없음)|그리드\s*(?:없이|없음)|cdn\s*(?:우회|폴백|fallback))/i.test(
        text,
      );

    const numeric = lower.match(/(?:^|[^\d])(\d{3,4})\s*p(?:\b|$)/);
    const quality = numeric ? Number(numeric[1]) : null;
    const original = /원본|(?:^|\b)(?:original|fhd)(?:\b|$)/i.test(text);
    const is1080 = quality === 1080 || original;
    const is720 = !is1080 && (quality === 720 || (quality === null && /\bhd\b/i.test(text)));
    const is480 = !is1080 && !is720 && (quality === 480 || (quality === null && /\bsd\b/i.test(text)));
    const is360 = quality === 360;
    const isAuto = /자동|auto/i.test(text);

    return {
      text,
      quality,
      gridFree,
      is1080,
      isReal1080: is1080 && !gridFree,
      is720,
      is480,
      is360,
      isAuto,
    };
  }

  function is1080Resolution(width, height) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) return false;
    return Math.max(w, h) >= 1900 && Math.min(w, h) >= 1000;
  }

  /*
   * Preference order:
   *   custom "1080p with FUCK GRID" item (internally 480p + CDN rewrite)
   *   -> a real 1080p/original item
   *   -> 480p CDN fallback
   *   -> 720p/360p as a last safe step.
   * Failed candidates are skipped until the next route or source change.
   */
  function chooseQuality(items, options) {
    const opts = Object.assign(
      {
        cdnEnabled: true,
        currentIs1080: false,
        gridFailed: false,
        real1080Failed: false,
      },
      options || {},
    );

    if (opts.currentIs1080) return { kind: "none", item: null };

    const usable = (Array.isArray(items) ? items : []).filter(
      (item) => item && !item.disabled,
    );
    const find = (predicate) => usable.find(predicate) || null;

    const grid = find((item) => item.gridFree);
    const real1080 = find((item) => item.isReal1080);
    const p480 = find((item) => item.is480);
    const p720 = find((item) => item.is720);
    const p360 = find((item) => item.is360);

    if (opts.cdnEnabled && !opts.gridFailed && grid) {
      return { kind: "grid", item: grid };
    }
    if (!opts.real1080Failed && real1080) {
      return { kind: "1080", item: real1080 };
    }
    if (opts.cdnEnabled && p480) {
      return { kind: "cdn480", item: p480 };
    }
    if (p720) return { kind: "720", item: p720 };
    if (p360) return { kind: "360", item: p360 };
    if (real1080) return { kind: "1080", item: real1080 };
    if (p480) return { kind: "480", item: p480 };

    return { kind: "none", item: null };
  }

  return {
    DEFAULTS,
    SETTINGS_KEY,
    normalizeSettings,
    isLivePath,
    normalizeText,
    compactText,
    hasDangerousText,
    isGridPrompt,
    isDeclineLabel,
    parseQualityLabel,
    is1080Resolution,
    chooseQuality,
  };
});
