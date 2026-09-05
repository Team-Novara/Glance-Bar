import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const baseUrl = process.env.SHOWCASE_BASE_URL ?? "http://127.0.0.1:5173";
const showcaseUrl = `${baseUrl}/showcase`;
const desktopUrl = `${baseUrl}/desktop`;
const outputDir = "output/playwright";

const consoleErrors = [];
const pageErrors = [];

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

  child.kill();
}

async function clickButton(locator, name) {
  await locator.getByRole("button", { name, exact: true }).click();
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

async function expectButton(locator, name, timeout = 5_000) {
  await locator
    .getByRole("button", { name, exact: true })
    .waitFor({ state: "visible", timeout });
}

async function expectLink(locator, name, timeout = 5_000) {
  await locator
    .getByRole("link", { name, exact: true })
    .waitFor({ state: "visible", timeout });
}

async function expectHeading(locator, name, timeout = 5_000) {
  await locator
    .getByRole("heading", { name })
    .waitFor({ state: "visible", timeout });
}

async function expectNoText(locator, text, timeout = 5_000) {
  await locator
    .getByText(text, { exact: true })
    .waitFor({ state: "detached", timeout });
}

async function captureFailureScreenshot(page) {
  try {
    await page.screenshot({
      path: `${outputDir}/showcase-interactions-failure.png`,
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
  await mkdir(outputDir, { recursive: true });
  const startedServer = await ensureServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1700, height: 900 },
  });

  await page.addInitScript(() => {
    // Force English so the not-found page and i18n keys resolve to English
    // during QA. Without this, i18next falls back to zh-CN (fallbackLng)
    // and assertions against English strings like "Cober page not found"
    // time out because the rendered text is Chinese.
    // i18next-browser-languagedetector uses its default `i18nextLng` cache
    // key. Using a different key leaves the browser locale in control and
    // makes the English role assertions below fail on a Chinese machine.
    localStorage.setItem("i18nextLng", "en");

    window.__qaTauriInvokeDelayMs = 0;
    window.__TAURI__ = {
      core: {
        invoke: async (command) => {
          if (window.__qaTauriInvokeDelayMs > 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, window.__qaTauriInvokeDelayMs),
            );
          }

          switch (command) {
            case "get_hub_event_fixtures":
              return [
                {
                  id: "qa-tauri-fixture-ai",
                  type: "ai",
                  source: "mock",
                  createdAt: 1780743600000,
                  progress: 64,
                  payload: {
                    id: "qa-tauri-fixture-ai-task",
                    type: "ai",
                    title: "QA Tauri Fixture",
                    subtitle: "Injected runtime fixture",
                    progress: 64,
                    accent: "blue",
                  },
                  metadata: { runtime: "tauri", fixture: true },
                },
              ];
            case "emit_hub_event_fixtures":
              return 1;
            case "get_runtime_capabilities":
              return {
                runtime: "tauri",
                fixtureIpc: true,
                tray: true,
                alwaysOnTop: true,
                windowsProviders: false,
                configuredShellWindow: {
                  configured: true,
                  title: "Cober Windows Bar",
                  width: 420,
                  height: 170,
                  minWidth: 320,
                  minHeight: 120,
                  resizable: false,
                  centered: false,
                },
              };
            case "get_system_performance":
              return {
                snapshot: { cpu: 28, memory: 54, network: 12 },
                diagnostic: {
                  quality: "fallback",
                  code: "unavailable",
                  source: "tauri-fixture",
                },
              };
            case "get_overlay_policy":
              return { foregroundFullscreen: false, shouldFloat: true };
            case "get_status_center_settings":
              return {
                preferences: {
                  alwaysFloat: true,
                  avoidFullscreen: true,
                  lockPosition: false,
                },
              };
            case "set_status_window_floating":
            case "correct_status_window_position":
            case "show_status_center_context_menu":
            case "open_status_center_settings":
            case "set_status_center_preferences":
            case "show_status_center_window":
            case "start_window_drag":
            case "quit_status_center":
              return undefined;
            default:
              throw new Error(`Unexpected Tauri command: ${command}`);
          }
        },
      },
    };
  });

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    const response = await page.goto(showcaseUrl, { waitUntil: "networkidle" });

    if (!response || response.status() !== 200) {
      throw new Error(
        `/showcase returned ${response?.status() ?? "no response"}`,
      );
    }

    const panel = page
      .locator("div")
      .filter({ has: page.getByText("Diagnostics and replay", { exact: true }) })
      .filter({
        has: page.getByRole("button", { name: "Stop source", exact: true }),
      })
      .first();
    const mainPreview = page.getByTestId("showcase-main-preview");

    await expectButton(page, "Start area mock");
    await expectButton(page, "File shortcut mock");
    await expectButton(page, "Browser shortcut mock");
    await expectProgressBar(page, "Taskbar AI progress");
    await expectText(page, "Taskbar-style composition mock");
    await expectText(page, "Windows 11 Fluent System");
    await expectText(page, "Desktop placement");
    await expectText(page, "Acrylic capsule");
    await expectText(page, "State inspection board");
    await expectText(page, "Resolver notes");
    await expectProgressBar(page, "AI token progress");
    await expectProgressBar(page, "Music token progress");
    await expectProgressBar(page, "Download token progress");
    await expectProgressBar(page, "Desktop placement sample progress");

    await expectText(panel, "Stopped, events stay");
    await expectText(panel, "Source idle");

    await clickButton(panel, "Music");
    await expectText(panel, "Mock Music Provider");
    await expectText(mainPreview, "Midnight City");
    await expectProgressBar(mainPreview, "Music playback progress");
    await expectButton(mainPreview, "Previous track");
    await expectButton(mainPreview, "Pause playback");
    await expectButton(mainPreview, "Next track");

    await clickButton(panel, "AI");
    await expectText(panel, "Mock AI Provider");
    await expectText(mainPreview, "Codex is updating the provider SDK");
    await expectProgressBar(
      mainPreview,
      "Codex is updating the provider SDK progress",
    );

    await clickButton(panel, "Download");
    await expectText(panel, "Mock Download Provider");
    await expectProgressBar(mainPreview, "Windows SDK Preview.zip progress");

    await clickButton(panel, "Notify");
    await expectText(panel, "Mock Notification Provider");

    await clickButton(panel, "Stop source");
    await expectText(panel, "Stopped, events stay");
    await expectText(panel, "Source idle");

    await clickButton(panel, "Music");
    await expectText(panel, "Mock Music Provider");

    await clickButton(panel, "Return to idle");
    await expectText(panel, "Stopped, events stay");
    await expectText(panel, "Source idle");
    await expectText(page, "Current mode: Idle");
    await expectText(page, "Store-driven Preview - Idle event stream");

    await clickButton(panel, "Tauri Fixture");
    await expectText(panel, "Tauri fixture published");
    await expectText(mainPreview, "QA Tauri Fixture");
    await expectText(mainPreview, "Injected runtime fixture");
    await expectText(page, "Current mode: AI Progress");

    await page.evaluate(() => {
      window.__qaTauriInvokeDelayMs = 350;
    });
    await clickButton(panel, "Tauri Fixture");
    await clickButton(panel, "Return to idle");
    await expectText(page, "Current mode: Idle");
    await expectText(page, "Store-driven Preview - Idle event stream");
    await expectNoText(mainPreview, "QA Tauri Fixture");
    await expectNoText(panel, "Tauri fixture published");

    await page.waitForTimeout(500);

    const staleFixtureCount = await page
      .getByText("QA Tauri Fixture", { exact: true })
      .count();
    if (staleFixtureCount > 0) {
      throw new Error(
        "Stale Tauri fixture request published after Return to idle",
      );
    }

    const stalePublishedLabelCount = await page
      .getByText("Tauri fixture published", { exact: true })
      .count();
    if (stalePublishedLabelCount > 0) {
      throw new Error(
        "Stale Tauri fixture request updated the playground label after Return to idle",
      );
    }

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(
        [
          ...consoleErrors.map((error) => `console error: ${error}`),
          ...pageErrors.map((error) => `page error: ${error}`),
        ].join("\n"),
      );
    }

    const missingResponse = await page.goto(`${baseUrl}/missing`, {
      waitUntil: "networkidle",
    });

    if (!missingResponse || missingResponse.status() !== 200) {
      throw new Error(
        `/missing returned ${missingResponse?.status() ?? "no response"}`,
      );
    }

    // Locale-agnostic: the app's i18n fallback is zh-CN, so the visible
    // title text depends on the active locale. Assert on the stable
    // test ID instead of the English string.
    await page.getByTestId("showcase-not-found-title").waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("link", { name: /open \/desktop/i }).waitFor({ state: "visible", timeout: 5_000 });

    const desktopResponse = await page.goto(desktopUrl, {
      waitUntil: "networkidle",
    });

    if (!desktopResponse || desktopResponse.status() !== 200) {
      throw new Error(
        `/desktop returned ${desktopResponse?.status() ?? "no response"}`,
      );
    }

    await page
      .getByTestId("desktop-preview")
      .waitFor({ state: "visible", timeout: 5_000 });
    // The fixture was published into the showcase-local event bus. Navigating
    // to the product route creates a fresh production runtime, which must not
    // inherit developer replay data or expose its private payload.
    await expectNoText(page, "QA Tauri Fixture");
    await expectNoText(page, "Injected runtime fixture");
    await expectNoText(page, "permission-denied");
    await expectNoText(page, "invoke-failed");
    await expectNoText(page, "tauri-fixture");

    console.log(
      `Showcase interaction QA passed at ${showcaseUrl}${startedServer ? " (started Vite)" : ""}`,
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
