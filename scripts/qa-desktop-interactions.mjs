import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = process.env.DESKTOP_BASE_URL ?? "http://127.0.0.1:5173";
const desktopUrl = `${baseUrl}/desktop`;
const outputDir = "output/playwright";

const consoleErrors = [];
const pageErrors = [];

let server;

async function isDesktopAvailable() {
  try {
    const response = await fetch(desktopUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForDesktop(timeoutMs = 20_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isDesktopAvailable()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${desktopUrl}`);
}

async function ensureServer() {
  if (await isDesktopAvailable()) {
    return false;
  }

  const command = process.env.npm_execpath
    ? process.execPath
    : process.platform === "win32"
      ? "npm.cmd"
      : "npm";
  const args = [
    ...(process.env.npm_execpath ? [process.env.npm_execpath] : []),
    "run",
    "dev",
    "--",
    "--host",
    "127.0.0.1",
  ];

  server = spawn(command, args, {
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group on POSIX so stopServer can signal the whole
    // npm -> sh -> Vite chain; killing only the npm parent orphans Vite.
    detached: process.platform !== "win32",
  });

  server.stdout.on("data", (data) => process.stdout.write(data));
  server.stderr.on("data", (data) => process.stderr.write(data));

  await waitForDesktop();
  return true;
}

async function stopServer() {
  if (!server) {
    return;
  }

  const child = server;
  server = undefined;

  child.stdout?.removeAllListeners();
  child.stderr?.removeAllListeners();
  child.stdout?.destroy();
  child.stderr?.destroy();

  if (!child.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const taskkill = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        {
          stdio: "ignore",
        },
      );
      taskkill.on("close", resolve);
      taskkill.on("error", resolve);
    });
    return;
  }

  try {
    // Negative PID signals the detached process group, taking down the
    // Vite grandchild together with npm. Fall back to the direct kill if
    // the group has already exited.
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill();
  }
}

async function expectText(locator, text, timeout = 5_000) {
  await locator
    .getByText(text, { exact: true })
    .waitFor({ state: "visible", timeout });
}

async function expectProgressBar(locator, name, timeout = 5_000) {
  await locator
    .getByRole("progressbar", { name, exact: true })
    .waitFor({ state: "visible", timeout });
}

/**
 * Assert a string never appears anywhere on the page. Unlike the showcase
 * journey's `expectNoText` (which waits for an element that was present to
 * detach), this covers strings that must never render at all — the count
 * check is instantaneous and deterministic.
 */
async function expectAbsentText(page, text) {
  const count = await page.getByText(text, { exact: true }).count();
  if (count > 0) {
    throw new Error(
      `Expected "${text}" to be absent on /desktop but found ${count} match(es)`,
    );
  }
}

async function settingsDialogCount(page) {
  return page
    .getByRole("dialog", { name: "Status Center Settings" })
    .count();
}

async function captureFailureScreenshot(page) {
  try {
    await page.screenshot({
      path: `${outputDir}/desktop-interactions-failure.png`,
      fullPage: true,
    });
  } catch (error) {
    console.warn(
      `Could not capture failure screenshot: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function closeBrowser(browser) {
  try {
    await browser.close();
  } catch (error) {
    console.warn(
      `Could not close Playwright browser: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function run() {
  let browser;
  let page;
  let startedServer = false;

  // Setup (mkdir, dev server, browser) lives inside the try so a startup
  // failure — for example a dev-server wait timeout — still runs the finally
  // block instead of leaking the spawned Vite process.
  try {
    await mkdir(outputDir, { recursive: true });
    startedServer = await ensureServer();
    browser = await chromium.launch();
    page = await browser.newPage({
      viewport: { width: 1700, height: 900 },
    });

    await page.addInitScript(() => {
      // Force English so role/text assertions resolve against the en resource
      // tree. i18next-browser-languagedetector caches under its default
      // `i18nextLng` key (src/i18n/index.ts detection config) and falls back
      // to zh-CN otherwise, which would break the English assertions below.
      localStorage.setItem("i18nextLng", "en");

      // NOTE: unlike scripts/qa-showcase-interactions.mjs, this journey does
      // NOT inject a fake window.__TAURI__ bridge. The /desktop route must be
      // exercised as a genuine browser preview: every hook degrades explicitly
      // (getTauriInvoke() returns undefined and the runtime advertises
      // unavailable/fallback instead of pretending to be live).
    });

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const response = await page.goto(desktopUrl, { waitUntil: "networkidle" });

    if (!response || response.status() !== 200) {
      throw new Error(
        `/desktop returned ${response?.status() ?? "no response"}`,
      );
    }

    // ── Status bar container renders ──
    const statusWindow = page.getByTestId("desktop-preview");
    await statusWindow.waitFor({ state: "visible", timeout: 5_000 });

    // The shell section carries the product aria label (shell.ariaLabel).
    await page
      .getByRole("region", { name: "Cober Windows Status Center" })
      .waitFor({ state: "visible", timeout: 5_000 });

    // ── Product surface renders the honest browser-preview state ──
    // In a plain browser the real npm/git/docker providers report
    // not-implemented (no Tauri shell bridge exists), emit no events, and
    // never activate the developer card — no fabricated "npm scripts" state
    // may appear. Every other guest kind (media/download/focus/clipboard)
    // also degrades without Tauri, so the scheduler deterministically falls
    // back to the resident state. The system-performance provider polls
    // honestly and, without Tauri, publishes quality "unavailable" with the
    // labeled placeholder metrics (CPU 23% / Memory 68% / 2.3 MB/s /
    // 500.0 KB/s) — the resident card therefore carries the explicit source
    // label "Unavailable", never "Native".
    await expectText(statusWindow, "Unavailable");
    await expectText(statusWindow, "CPU");
    await expectText(statusWindow, "23%");
    await expectText(statusWindow, "2.3 MB/s");
    await expectProgressBar(statusWindow, "CPU usage 23%");

    // The fabricated developer card must not render anywhere on the page.
    await expectAbsentText(page, "Developer");
    await expectAbsentText(page, "npm scripts");
    await expectAbsentText(page, "Native");

    // ── Settings panel reachability in a plain browser ──
    // The panel starts closed. Its only in-app opener is the panel-internal
    // "Open Native Settings" quick action; from the status window itself the
    // product path is the right-click native context menu, which is a no-op
    // without the Tauri bridge (useSettingsUI.showNativeContextMenu returns
    // early when getTauriInvoke() is undefined). Assert the true browser
    // behavior: no crash, and the panel stays closed.
    if ((await settingsDialogCount(page)) !== 0) {
      throw new Error("Settings panel rendered before any open action");
    }

    await statusWindow.click({ button: "right" });
    await page.waitForTimeout(250);

    if ((await settingsDialogCount(page)) !== 0) {
      throw new Error(
        "Settings panel opened after right-click without the Tauri bridge",
      );
    }
    await statusWindow.waitFor({ state: "visible", timeout: 5_000 });

    // ── No mock/showcase content crosses the route boundary ──
    // useDesktopStatusRuntime registers realProviders only (mockProviders:
    // false), and the showcase playground is a separate lazy chunk. None of
    // the showcase or fixture strings may appear on the product surface.
    await expectAbsentText(page, "Taskbar-style composition mock");
    await expectAbsentText(page, "State inspection board");
    await expectAbsentText(page, "Diagnostics and replay");
    await expectAbsentText(page, "Mock Music Provider");
    await expectAbsentText(page, "QA Tauri Fixture");
    await expectAbsentText(page, "Injected runtime fixture");
    await expectAbsentText(page, "tauri-fixture");
    await expectAbsentText(page, "permission-denied");
    await expectAbsentText(page, "invoke-failed");

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        [
          ...consoleErrors.map((error) => `console error: ${error}`),
          ...pageErrors.map((error) => `page error: ${error}`),
        ].join("\n"),
      );
    }

    console.log(
      `Desktop interaction QA passed at ${desktopUrl}${startedServer ? " (started Vite)" : ""}`,
    );
  } catch (error) {
    await captureFailureScreenshot(page);
    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        [
          error instanceof Error ? error.message : String(error),
          ...consoleErrors.map((entry) => `console error: ${entry}`),
          ...pageErrors.map((entry) => `page error: ${entry}`),
        ].join("\n"),
      );
    }
    throw error;
  } finally {
    await closeBrowser(browser);
    await stopServer();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
