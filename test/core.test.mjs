import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const core = require("../src/core.js");

test("normalizeSettings keeps booleans and defaults", () => {
  assert.deepEqual(core.normalizeSettings(null), { ...core.DEFAULTS });
  assert.deepEqual(core.normalizeSettings({ autoQuality: false, debug: true }), {
    ...core.DEFAULTS,
    autoQuality: false,
    debug: true,
  });
  assert.deepEqual(core.normalizeSettings({ autoQuality: "no", cdnFallback: 1 }), {
    ...core.DEFAULTS,
  });
});

test("isLivePath only accepts live routes", () => {
  assert.equal(core.isLivePath("/live/0076a519f147ee9fd0959bf02f9571ca"), true);
  assert.equal(core.isLivePath("/live/21707148/"), true);
  assert.equal(core.isLivePath("/live/abc-def_123"), true);
  assert.equal(core.isLivePath("/live/"), false);
  assert.equal(core.isLivePath("/live"), false);
  assert.equal(core.isLivePath("/video/123"), false);
  assert.equal(core.isLivePath("/"), false);
});

test("isGridPrompt matches the measured connector guides", () => {
  assert.equal(
    core.isGridPrompt(
      "고화질 시청을 위해서는 네이버 라이브 스트리밍 커넥터가 필요합니다. 설치하고 고화질 시청 설치 없이 일반 화질 시청",
    ),
    true,
  );
  assert.equal(
    core.isGridPrompt(
      "크롬, 엣지 브라우저에서 고화질 시청을 위해 브라우저 확장 프로그램을 먼저 설치합니다. 확장 프로그램 설치 설치 없이 일반 화질 시청",
    ),
    true,
  );
  assert.equal(
    core.isGridPrompt("네이버 라이브 스트리밍 커넥터 설치 안내"),
    false,
  );
});

test("isGridPrompt never matches payment, login, security, or ads", () => {
  assert.equal(
    core.isGridPrompt(
      "네이버 라이브 스트리밍 커넥터 설치 고화질 시청 로그인 결제",
    ),
    false,
  );
  assert.equal(
    core.isGridPrompt("광고 차단 확장 프로그램 설치 고화질 시청"),
    false,
  );
  assert.equal(
    core.isGridPrompt("본인 인증 보안 프로그램 설치 후 고화질 시청"),
    false,
  );
  assert.equal(core.isGridPrompt("일반 공지사항입니다."), false);
});

test("isDeclineLabel only accepts the safe decline labels", () => {
  assert.equal(core.isDeclineLabel("설치 없이 일반 화질 시청"), true);
  assert.equal(core.isDeclineLabel("설치없이일반화질시청"), true);
  assert.equal(core.isDeclineLabel("설치 없이 시청"), true);
  assert.equal(core.isDeclineLabel("일반 화질로 시청"), true);
  assert.equal(core.isDeclineLabel("닫기"), true);
  assert.equal(core.isDeclineLabel("설치하고 고화질 시청"), false);
  assert.equal(core.isDeclineLabel("확장 프로그램 설치"), false);
  assert.equal(core.isDeclineLabel("결제 취소"), false);
});

test("parseQualityLabel handles Korean and English labels", () => {
  assert.deepEqual(
    core.parseQualityLabel("1080p"),
    {
      text: "1080p",
      quality: 1080,
      gridFree: false,
      is1080: true,
      isReal1080: true,
      is720: false,
      is480: false,
      is360: false,
      isAuto: false,
    },
  );

  const original = core.parseQualityLabel("원본 화질");
  assert.equal(original.is1080, true);
  assert.equal(original.isReal1080, true);

  const grid = core.parseQualityLabel("1080p with FUCK GRID");
  assert.equal(grid.quality, 1080);
  assert.equal(grid.gridFree, true);
  assert.equal(grid.isReal1080, false);

  const sd = core.parseQualityLabel("480p");
  assert.equal(sd.quality, 480);
  assert.equal(sd.is480, true);

  const hd = core.parseQualityLabel("720p HD");
  assert.equal(hd.quality, 720);
  assert.equal(hd.is720, true);

  assert.equal(core.parseQualityLabel("자동").isAuto, true);
});

test("is1080Resolution accepts landscape and portrait 1080p", () => {
  assert.equal(core.is1080Resolution(1920, 1080), true);
  assert.equal(core.is1080Resolution(1080, 1920), true);
  assert.equal(core.is1080Resolution(2560, 1080), true);
  assert.equal(core.is1080Resolution(1280, 720), false);
  assert.equal(core.is1080Resolution(854, 480), false);
  assert.equal(core.is1080Resolution(0, 0), false);
});

test("chooseQuality prefers the CDN item, then real 1080p, then 480p", () => {
  const items = [
    { text: "1080p", isReal1080: true, is480: false, is720: false, is360: false, gridFree: false, disabled: false, checked: false },
    { text: "480p", isReal1080: false, is480: true, is720: false, is360: false, gridFree: false, disabled: false, checked: false },
    { text: "1080p with FUCK GRID", isReal1080: false, is480: false, is720: false, is360: false, gridFree: true, disabled: false, checked: false },
  ];

  assert.equal(core.chooseQuality(items, { cdnEnabled: true }).kind, "grid");
  assert.equal(
    core.chooseQuality(items, { cdnEnabled: true, gridFailed: true }).kind,
    "1080",
  );
  assert.equal(
    core.chooseQuality(items, {
      cdnEnabled: true,
      gridFailed: true,
      real1080Failed: true,
    }).kind,
    "cdn480",
  );
  assert.equal(
    core.chooseQuality(items, { cdnEnabled: false }).kind,
    "1080",
  );
  assert.equal(
    core.chooseQuality(items, { currentIs1080: true }).kind,
    "none",
  );
  assert.equal(core.chooseQuality([], {}).kind, "none");
});

test("chooseQuality ignores disabled items", () => {
  const items = [
    { text: "1080p", isReal1080: true, disabled: true },
    { text: "720p", is720: true, disabled: false },
  ];
  const result = core.chooseQuality(items, { cdnEnabled: false });
  assert.equal(result.kind, "720");
});
