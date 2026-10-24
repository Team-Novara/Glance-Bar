import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = process.env.SHOWCASE_BASE_URL ?? "http://127.0.0.1:5173";
const showcaseUrl = `${baseUrl}/showcase`;
const outputDir = "output/playwright";

const viewports = [
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

let server;

async function isShowcaseAvailable() {
  try {
    const response = await fetch(showcaseUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForShowcase(timeoutMs = 20_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isShowcaseAvailable()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${showcaseUrl}`);
}

async function ensureServer() {
  if (await isShowcaseAvailable()) {
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

  await waitForShowcase();
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

  // SIGTERM is asynchronous: Vite keeps shutting down gracefully for a
  // moment after the signal, so if this script exited right away an
  // immediate `pgrep -af vite` would snapshot the dying grandchild and
  // report a leaked server. Poll until the whole group is gone (signal 0
  // succeeds while any member is still alive), then SIGKILL any holdouts
  // so the journey never exits before the server is fully dead.
  const deadline = Date.now() + 5_000;
  let groupAlive = true;
  while (groupAlive && Date.now() < deadline) {
    try {
      process.kill(-child.pid, 0);
    } catch (error) {
      groupAlive = error?.code !== "ESRCH";
      if (!groupAlive) {
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (groupAlive) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // The group exited between the last probe and the SIGKILL.
    }
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
  let startedServer = false;

  // Setup (mkdir, dev server, browser) lives inside the try so a startup
  // failure — for example a dev-server wait timeout — still runs the finally
  // block instead of leaking the spawned Vite process.
  try {
    await mkdir(outputDir, { recursive: true });
    startedServer = await ensureServer();
    browser = await chromium.launch();

    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });

      await page.addInitScript(() => {
        // Force English so the captures show the en resource tree.
        // i18next-browser-languagedetector uses its default `i18nextLng` cache
        // key; without this i18next falls back to zh-CN (fallbackLng) and the
        // screenshots would differ per host locale.
        // Guarded because this init script runs on every document, including
        // Chromium network-error pages, which deny storage access; a throw
        // there would poison the run as a phantom capture failure.
        try {
          localStorage.setItem("i18nextLng", "en");
        } catch {
          // Not a real app document; the locale setting is irrelevant there.
        }
      });

      // 60s: the 30s default timed out once under back-to-back runs while the
      // dev server was still accepting connections (transient stall).
      const response = await page.goto(showcaseUrl, {
        waitUntil: "networkidle",
        timeout: 60_000,
      });

      if (!response || response.status() !== 200) {
        throw new Error(
          `/showcase returned ${response?.status() ?? "no response"}`,
        );
      }

      // fullPage: false — viewport-sized captures for the QA matrix, not a
      // scrolling capture. page.screenshot overwrites the file each run.
      await page.screenshot({
        path: `${outputDir}/showcase-${viewport.width}x${viewport.height}.png`,
        fullPage: false,
      });

      await page.close();
    }

    console.log(
      `Showcase screenshots captured at ${showcaseUrl}${startedServer ? " (started Vite)" : ""}`,
    );
  } finally {
    await closeBrowser(browser);
    await stopServer();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
