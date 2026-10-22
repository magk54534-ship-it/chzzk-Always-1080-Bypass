import assert from "node:assert/strict";
import test from "node:test";

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function createContext(initialSettings) {
  const listeners = new Map();

  class Navigator {
    get brave() {
      return { isBrave: async () => true };
    }
  }

  const navigator = new Navigator();
  const storage = new Map();
  if (initialSettings) {
    storage.set("czz1080p.settings.v1", JSON.stringify(initialSettings));
  }

  const context = {
    console,
    JSON,
    Object,
    Reflect,
    Promise,
    setTimeout,
    clearTimeout,
    navigator,
    Navigator,
    location: { origin: "https://chzzk.naver.com" },
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };

  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);

  vm.runInContext(read("src/page-main.js"), context, {
    filename: "page-main.js",
  });

  const pageWindow = vm.runInContext("window", context);

  return { context, pageWindow, navigator, listeners };
}

test("page-main removes navigator.brave when the guard is enabled", () => {
  const { navigator } = createContext({ braveBlock: true });
  assert.equal("brave" in navigator, false);
  assert.equal(navigator.brave, undefined);
});

test("page-main leaves navigator.brave intact when the guard is disabled", () => {
  const { navigator } = createContext({ braveBlock: false });
  assert.equal("brave" in navigator, true);
  assert.equal(typeof navigator.brave.isBrave, "function");
});

test("page-main restores navigator.brave after a disable message", () => {
  const { pageWindow, navigator, listeners } = createContext({
    braveBlock: true,
  });
  assert.equal("brave" in navigator, false);

  const listener = listeners.get("message");
  assert.equal(typeof listener, "function");

  listener({
    source: pageWindow,
    data: {
      source: "czz1080p",
      type: "settings",
      settings: { braveBlock: false },
    },
  });

  assert.equal("brave" in navigator, true);
  assert.equal(typeof navigator.brave.isBrave, "function");
});

test("page-main ignores messages from other sources", () => {
  const { pageWindow, navigator, listeners } = createContext({
    braveBlock: true,
  });
  const listener = listeners.get("message");

  listener({
    source: { other: true },
    data: {
      source: "czz1080p",
      type: "settings",
      settings: { braveBlock: false },
    },
  });

  assert.equal("brave" in navigator, false);
  assert.notEqual(pageWindow, null);
});
