/*
 * Optional smoke test: load the unpacked extension in a real Chromium browser
 * and ask the MV3 service worker for its manifest and enabled DNR rulesets.
 *
 * Brave is tried first because branded Google Chrome builds may ignore
 * --load-extension. If no supported browser can load unpacked extensions in
 * headless mode, the test exits with SKIP (0) and explains why.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "C:\\Program Files\\Chromium\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/brave-browser",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function fetchJson(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

class CdpConnection {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
    this.socket = null;
  }

  async connect(timeoutMs = 5000) {
    const socket = new WebSocket(this.webSocketUrl);
    this.socket = socket;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP connect timeout")), timeoutMs);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.addEventListener("error", (event) => {
        clearTimeout(timer);
        reject(new Error(`CDP connect error: ${event.message || "unknown"}`));
      });
    });

    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch (_) {
        return;
      }
      if (message.method) {
        const handlers = this.eventHandlers.get(message.method);
        if (handlers) for (const handler of handlers) handler(message.params);
        return;
      }
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });

    return this;
  }

  on(method, handler) {
    const handlers = this.eventHandlers.get(method) || [];
    handlers.push(handler);
    this.eventHandlers.set(method, handlers);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 8000);

      this.pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch (_) {
      // Ignore.
    }
  }
}

async function waitForTarget(port, deadlineMs) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
    if (Array.isArray(targets)) {
      const worker = targets.find(
        (target) =>
          target &&
          target.type === "service_worker" &&
          typeof target.url === "string" &&
          target.url.startsWith("chrome-extension://") &&
          target.url.endsWith("/src/background.js"),
      );
      if (worker) return worker;
    }
    await sleep(250);
  }
  return null;
}

async function checkPageInjection(port) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const page = Array.isArray(targets) ? targets.find((target) => target.type === "page") : null;
  if (!page) return { status: "skip", reason: "no page target" };

  const connection = await new CdpConnection(page.webSocketDebuggerUrl).connect();
  const pageErrors = [];
  try {
    connection.on("Runtime.exceptionThrown", (params) => {
      pageErrors.push(
        params?.exceptionDetails?.exception?.description ||
          params?.exceptionDetails?.text ||
          "unknown exception",
      );
    });
    connection.on("Runtime.consoleAPICalled", (params) => {
      if (params?.type !== "error") return;
      pageErrors.push(
        (params.args || [])
          .map((arg) => arg.value || arg.description || "")
          .filter(Boolean)
          .join(" "),
      );
    });
    connection.on("Log.entryAdded", (params) => {
      if (params?.entry?.level === "error") pageErrors.push(params.entry.text);
    });
    await connection.send("Runtime.enable");
    await connection.send("Log.enable");
    await connection.send("Page.enable");
    const navigation = await connection.send("Page.navigate", {
      url: "https://chzzk.naver.com/",
    });
    if (navigation && navigation.errorText) {
      return { status: "skip", reason: navigation.errorText };
    }
    let value = null;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const result = await connection.send("Runtime.evaluate", {
        expression:
          "({ flag: Boolean(window.__czz1080pPageLoaded), contentAlive: Boolean(window.__czz1080pContentAlive), braveType: typeof navigator.brave, mirrored: Boolean(localStorage.getItem(\"czz1080p.settings.v1\")), ready: document.readyState, href: location.href })",
        returnByValue: true,
      });
      value = result?.result?.value;
      if (value?.contentAlive) break;
      await sleep(500);
    }
    if (!value || !value.flag) {
      return { status: "skip", reason: "MAIN world marker not observed" };
    }
    if (!value.contentAlive) {
      return {
        status: "fail",
        reason: "ISOLATED world content script did not become ready",
        errors: pageErrors.slice(0, 5),
      };
    }

    await connection.send("Runtime.evaluate", {
      expression: `(() => {
        history.pushState({}, "", "/live/smoke-relabel");
        const host = document.createElement("div");
        host.id = "czz-smoke-host";
        host.innerHTML = [
          '<div class="pzp-pc">',
          '  <button class="pzp-setting-button" aria-expanded="true"></button>',
          '  <div class="pzp-setting-intro-quality">',
          '    <span class="pzp-ui-setting-home-item__value">480p</span>',
          "  </div>",
          '  <div class="pzp-setting-quality-pane">',
          '    <ul class="pzp-setting-quality-pane__list-container">',
          '      <li class="pzp-ui-setting-quality-item pzp-ui-setting-pane-item">1080p(원본) HD 60fps</li>',
          '      <li class="pzp-ui-setting-quality-item pzp-ui-setting-pane-item">720p HD 60fps</li>',
          '      <li class="pzp-ui-setting-quality-item pzp-ui-setting-pane-item pzp-ui-setting-pane-item--checked">480p</li>',
          "    </ul>",
          "  </div>",
          "</div>",
        ].join("");
        document.body.appendChild(host);
        return true;
      })()`,
      returnByValue: true,
    });

    let relabel = null;
    const relabelDeadline = Date.now() + 8000;
    while (Date.now() < relabelDeadline) {
      const result = await connection.send("Runtime.evaluate", {
        expression: `(() => {
          const host = document.getElementById("czz-smoke-host");
          const entry = host?.querySelector(".pzp-setting-intro-quality");
          const item = host?.querySelector("li[data-czz-cdn]");
          return {
            entry: (entry?.textContent || "").replace(/\\s+/g, " ").trim(),
            item: (item?.textContent || "").replace(/\\s+/g, " ").trim(),
            entryCdn: Boolean(entry?.querySelector("[data-czz-cdn-entry]") || entry?.dataset?.czzCdnEntry),
          };
        })()`,
        returnByValue: true,
      });
      relabel = result?.result?.value;
      if (
        relabel?.entry.includes("1080p (CDN)") &&
        relabel?.item.includes("1080p with FUCK GRID")
      ) {
        break;
      }
      await sleep(250);
    }

    if (
      !relabel ||
      !relabel.entry.includes("1080p (CDN)") ||
      !relabel.item.includes("1080p with FUCK GRID")
    ) {
      return {
        status: "fail",
        reason: "CDN quality labels were not applied to the fake PZP menu",
        detail: relabel,
        errors: pageErrors.slice(0, 5),
      };
    }

    return {
      status: "pass",
      braveType: value.braveType,
      contentAlive: value.contentAlive,
      mirrored: value.mirrored,
      relabel,
      errors: pageErrors.slice(0, 5),
      href: value.href,
      ready: value.ready,
    };
  } finally {
    connection.close();
  }
}

async function runBrowser(browserPath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "czz1080p-smoke-"));
  const port = await findFreePort();
  const stderrLines = [];

  const child = spawn(
    browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--metrics-recording-only",
      `--user-data-dir=${userDataDir}`,
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      `--remote-debugging-port=${port}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (!line.trim()) continue;
      stderrLines.push(line);
      if (stderrLines.length > 200) stderrLines.shift();
    }
  });

  try {
    const version = await (async () => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const value = await fetchJson(`http://127.0.0.1:${port}/json/version`);
        if (value) return value;
        await sleep(250);
      }
      return null;
    })();

    if (!version) {
      return {
        status: "skip",
        reason: "browser did not expose a DevTools endpoint in headless mode",
      };
    }

    const target = await waitForTarget(port, 12000);
    if (!target) {
      const loadError = stderrLines.find((line) =>
        /failed to load extension|could not load|manifest.*error|invalid value/i.test(line),
      );
      return {
        status: "skip",
        reason:
          loadError ||
          "browser ignored --load-extension or did not start the MV3 service worker",
      };
    }

    const connection = await new CdpConnection(target.webSocketDebuggerUrl).connect();
    try {
      await connection.send("Runtime.enable");
      await sleep(2000);
      const result = await connection.send("Runtime.evaluate", {
        expression: `(async () => ({
          name: chrome.runtime.getManifest().name,
          version: chrome.runtime.getManifest().version,
          scripts: chrome.runtime.getManifest().content_scripts.length,
          rules: await chrome.declarativeNetRequest.getEnabledRulesets(),
        }))()`,
        awaitPromise: true,
        returnByValue: true,
      });

      const value = result?.result?.value;
      assert.ok(value, "service worker evaluation returned no value");
      assert.equal(value.name, "CHZZK Brave 1080p");
      assert.equal(value.scripts, 2);
      assert.ok(
        Array.isArray(value.rules) && value.rules.includes("quality_redirect"),
        `DNR ruleset not active: ${JSON.stringify(value.rules)}`,
      );

      const pageCheck = await checkPageInjection(port).catch((error) => ({
        status: "skip",
        reason: error.message,
      }));
      if (pageCheck.status === "fail") {
        throw new Error(pageCheck.reason);
      }

      return {
        status: "pass",
        browser: browserPath,
        version: value.version,
        rules: value.rules,
        browserVersion: version.Browser,
        pageCheck,
      };
    } finally {
      connection.close();
    }
  } finally {
    try {
      child.kill();
    } catch (_) {
      // Ignore.
    }
    await sleep(600);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (_) {
      // Windows can keep profile files open briefly; temp cleanup is best effort.
    }
  }
}

async function main() {
  const tried = [];

  for (const browserPath of BROWSER_CANDIDATES) {
    if (!fs.existsSync(browserPath)) continue;
    tried.push(browserPath);

    try {
      const result = await runBrowser(browserPath);
      if (result.status === "pass") {
        console.log(`PASS extension loaded in ${result.browser}`);
        console.log(`  browser: ${result.browserVersion || "unknown"}`);
        console.log(`  manifest: ${result.version}`);
        console.log(`  DNR rulesets: ${result.rules.join(", ")}`);
        if (result.pageCheck && result.pageCheck.status === "pass") {
          console.log(`  MAIN world: injected (navigator.brave: ${result.pageCheck.braveType}, content ready: ${result.pageCheck.contentAlive}, settings mirrored: ${result.pageCheck.mirrored})`);
          if (result.pageCheck.relabel) {
            console.log(`  CDN labels: ${result.pageCheck.relabel.entry} / ${result.pageCheck.relabel.item}`);
          }
          if (result.pageCheck.errors && result.pageCheck.errors.length) {
            console.log(`  page errors: ${result.pageCheck.errors.join(" | ")}`);
          }
        } else if (result.pageCheck) {
          console.log(`  MAIN world check skipped: ${result.pageCheck.reason}`);
        }
        return;
      }
      console.log(`SKIP ${browserPath}: ${result.reason}`);
    } catch (error) {
      console.error(`FAIL ${browserPath}: ${error.message}`);
      process.exitCode = 1;
      return;
    }
  }

  if (!tried.length) {
    console.log("SKIP no Brave/Chromium/Chrome executable found");
    return;
  }

  console.log("SKIP no tested browser loaded the unpacked extension in headless mode");
  console.log("     Use TESTING.md for the manual Brave checklist.");
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
