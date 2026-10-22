import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const manifest = JSON.parse(read("manifest.json"));

test("manifest is MV3 and has minimal host access", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "CHZZK Brave 1080p");
  assert.deepEqual(manifest.permissions, ["storage", "declarativeNetRequest"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://chzzk.naver.com/*",
    "https://*.navercdn.com/*",
    "https://*.pstatic.net/*",
    "https://*.akamaized.net/*",
  ]);
  assert.equal(manifest.permissions.includes("tabs"), false);
  assert.equal(manifest.permissions.includes("webRequest"), false);
  assert.equal(manifest.permissions.includes("cookies"), false);
});

test("content scripts are limited to chzzk and use MAIN + ISOLATED worlds", () => {
  assert.equal(manifest.content_scripts.length, 2);
  for (const entry of manifest.content_scripts) {
    assert.deepEqual(entry.matches, ["https://chzzk.naver.com/*"]);
    assert.equal(entry.run_at, "document_start");
  }
  assert.equal(manifest.content_scripts[0].world, "MAIN");
  assert.equal(manifest.content_scripts[1].world, undefined);
  assert.deepEqual(manifest.content_scripts[0].js, ["src/page-main.js"]);
  assert.deepEqual(manifest.content_scripts[1].js, [
    "src/core.js",
    "src/content.js",
  ]);

  const mainScripts = new Set(manifest.content_scripts[0].js);
  for (const script of manifest.content_scripts[1].js) {
    assert.equal(
      mainScripts.has(script),
      false,
      `content script ${script} is listed in both worlds; Chromium may inject it only once`,
    );
  }
});

test("referenced files exist", () => {
  const files = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_page,
    ...Object.values(manifest.icons),
    ...manifest.content_scripts.flatMap((entry) => entry.js),
    ...manifest.declarative_net_request.rule_resources.map((rule) => rule.path),
    "README.md",
    "LICENSE",
    "TESTING.md",
    "THIRD_PARTY_NOTICES.md",
    "src/ui.css",
    "src/popup.js",
    "src/options.js",
  ];

  for (const file of files) {
    assert.equal(exists(file), true, `missing ${file}`);
  }
});

test("stylesheet and extension pages load only local scripts", () => {
  for (const page of ["src/popup.html", "src/options.html"]) {
    const html = read(page);
    assert.equal(/<script[^>]+src=["']https?:/i.test(html), false, page);
    assert.equal(/<link[^>]+href=["']https?:/i.test(html), false, page);
    assert.equal(/on(?:click|change|load)=/i.test(html), false, page);
  }
});

test("no remote code, eval, or obfuscation in shipped scripts", () => {
  const scripts = [
    "src/background.js",
    "src/core.js",
    "src/content.js",
    "src/page-main.js",
    "src/options.js",
    "src/popup.js",
  ];

  for (const script of scripts) {
    const source = read(script);
    assert.equal(/\beval\s*\(/.test(source), false, `${script} uses eval`);
    assert.equal(
      /new\s+Function\s*\(/.test(source),
      false,
      `${script} uses new Function`,
    );
    assert.equal(
      /importScripts\(["']https?:/i.test(source),
      false,
      `${script} imports remote code`,
    );
    assert.equal(
      /<script[^>]+src=["']https?:/i.test(source),
      false,
      `${script} loads remote script`,
    );
  }
});

test("DNR ruleset redirects only 480p HLS on known CDN hosts", () => {
  const [rule] = JSON.parse(read("rules/quality.json"));
  assert.equal(rule.action.type, "redirect");
  assert.equal(rule.action.redirect.regexSubstitution, "\\11080p\\2");
  assert.match(rule.condition.regexFilter, /480p/);
  assert.match(rule.condition.regexFilter, /m3u8/);
  assert.deepEqual(rule.condition.requestDomains, [
    "navercdn.com",
    "pstatic.net",
    "akamaized.net",
  ]);
  assert.equal(rule.condition.resourceTypes.includes("media"), true);
});

test("repository declares MIT and third-party notices", () => {
  const license = read("LICENSE");
  assert.match(license, /MIT License/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS"/);

  const notices = read("THIRD_PARTY_NOTICES.md");
  assert.match(notices, /FUCK-CHZZK-GRID/);
  assert.match(notices, /MIT/);
});

test("README includes Brave installation and legal warnings", () => {
  const readme = read("README.md");
  assert.match(readme, /brave:\/\/extensions/);
  assert.match(readme, /비공식/);
  assert.match(readme, /약관/);
  assert.match(readme, /한계/);
  assert.match(readme, /MIT/);
});
