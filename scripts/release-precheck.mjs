// Release precheck for the versioned validation candidate freeze — see
// docs/release/CANDIDATE_FREEZE.md for the runbook this script belongs to.
//
// It records the commit and the tree state, then runs every quality gate
// (AGENTS.md "Quality gates" and the release decision template §2) as a child
// process, printing one PASS/FAIL line per gate with its duration and
// finishing with exactly one of:
//
//   RELEASE-PRECHECK PASSED <commit>
//   RELEASE-PRECHECK FAILED (n/m gates failed)
//
// The script exits nonzero on a dirty tree, any failed gate, or an interrupt.
// A dirty tree fails the run even when every gate passes — gate output from a
// tree that does not match a commit is not citable candidate evidence — but
// the gates still run so the full per-gate table is available for diagnosis.
// Gate output is streamed to the console and saved per gate under
// output/release-precheck/<run id>/ (gitignored) so the freeze record can
// cite it as evidence.

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const isWindows = process.platform === "win32";

// One entry per quality gate, in run order. `label` is the exact command so a
// precheck row can be copied verbatim into the freeze record and the release
// decision template's gate table. Gates run sequentially: the interaction and
// screenshot gates each bind 127.0.0.1:5173, and the cargo gates share a
// target dir.
const gates = [
  ...["typecheck", "lint", "format:check", "test:vitest", "qa:showcase:interactions", "qa:desktop:interactions", "qa:showcase:screenshots", "build"].map(
    (script) => ({
      id: script,
      label: `npm run ${script}`,
      npmScript: script,
    }),
  ),
  ...[
    "cargo fmt --manifest-path src-tauri/Cargo.toml -- --check",
    "cargo check --manifest-path src-tauri/Cargo.toml",
    "cargo clippy --manifest-path src-tauri/Cargo.toml -- -W clippy::all -W clippy::pedantic --allow clippy::module_name_repetitions",
    "cargo test --manifest-path src-tauri/Cargo.toml",
  ].map((commandLine) => ({
    id: commandLine.split(" ")[1],
    label: commandLine,
    commandLine,
  })),
];

// ── Child-process plumbing ──────────────────────────────────────────────────

function spawnNpm(script) {
  // Same invocation idiom as scripts/qa-desktop-interactions.mjs: reuse the
  // running npm's CLI entry point when available so the child works on both
  // POSIX and Windows without a .cmd shell wrapper.
  const command = process.env.npm_execpath
    ? process.execPath
    : isWindows
      ? "npm.cmd"
      : "npm";
  const args = [
    ...(process.env.npm_execpath ? [process.env.npm_execpath] : []),
    "run",
    script,
  ];

  return spawn(command, args, {
    // Own process group on POSIX so stopGate can signal the whole
    // npm -> sh -> gate chain. The interaction and screenshot gates nest a
    // Vite dev server under here; killing only the npm parent would orphan
    // it. This mirrors the group-kill idiom in scripts/qa-desktop-interactions.mjs.
    detached: !isWindows,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function spawnCargo(commandLine) {
  if (isWindows) {
    const [cargo, ...args] = commandLine.split(" ");
    return spawn(cargo, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  // The release environment keeps cargo outside the default PATH; source the
  // toolchain env in the child shell. `exec` replaces the shell with cargo so
  // a process-group signal reaches cargo (and its own children) directly.
  return spawn("bash", ["-lc", `source ~/.cargo/env && exec ${commandLine}`], {
    detached: true,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function exitPromise(child) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
    // A spawn failure (missing binary) emits "error" without an "exit".
    child.once("error", (error) => resolve({ code: null, signal: null, error }));
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Signal the gate's whole process group, following the idiom in
// scripts/qa-desktop-interactions.mjs: tree-kill on Windows, negative PID on
// POSIX with a fallback to the direct kill if the group already exited.
async function signalGate(child, signal) {
  if (!child.pid || child.exitCode !== null) {
    return;
  }

  if (isWindows) {
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
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

// Stop a running gate for good: TERM the group, then KILL it if the gate is
// still alive after a grace period.
async function abortGate(child) {
  await signalGate(child, "SIGTERM");
  const exited = await Promise.race([exitPromise(child), wait(5_000).then(() => null)]);
  if (!exited) {
    await signalGate(child, "SIGKILL");
    await exitPromise(child);
  }
}

// ── Git state ───────────────────────────────────────────────────────────────

function git(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`));
      }
    });
  });
}

// ── Output helpers ──────────────────────────────────────────────────────────

const transcript = [];

function log(line) {
  transcript.push(line);
  console.log(line);
}

// Log filename for a gate id: keep it valid on every platform — Windows
// forbids ":" in file names, which the "format:check" id would trip over.
function logFileName(id) {
  return `${id.replace(/[^a-zA-Z0-9._-]+/g, "-")}.log`;
}

function formatDuration(ms) {
  if (ms < 1_000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.round(seconds - minutes * 60)).padStart(2, "0")}s`;
}

function formatResultLine(result) {
  const status = result.ok ? "PASS" : "FAIL";
  const timing = `(${formatDuration(result.durationMs)})`;
  const detail = result.ok
    ? ""
    : result.error
      ? ` — ${result.error.message}`
      : result.signal
        ? ` — terminated by ${result.signal}`
        : ` — exit code ${result.code}`;
  const logNote = result.logPath ? `  log: ${result.logPath}` : "";
  return `${status}  ${result.gate.label} ${timing}${detail}${logNote}`;
}

// ── Gate execution ──────────────────────────────────────────────────────────

let interrupted = null;
let activeChild = null;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (interrupted) {
      // Second signal: the operator wants out now.
      process.exit(130);
    }
    interrupted = signal;
    console.error(
      `\nRELEASE-PRECHECK received ${signal}; stopping the running gate and its process group (Ctrl-C again exits immediately)...`,
    );
    if (activeChild) {
      void abortGate(activeChild);
    } else {
      process.exit(130);
    }
  });
}

async function runGate(gate, logDir) {
  const startedAt = Date.now();
  const child = gate.npmScript ? spawnNpm(gate.npmScript) : spawnCargo(gate.commandLine);
  activeChild = child;

  const chunks = [];
  child.stdout.on("data", (chunk) => {
    chunks.push(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    chunks.push(chunk);
    process.stderr.write(chunk);
  });

  const exited = await exitPromise(child);
  activeChild = null;
  const durationMs = Date.now() - startedAt;

  const logPath = path.join(logDir, logFileName(gate.id));
  await writeFile(logPath, Buffer.concat(chunks));

  return {
    gate,
    ok: !interrupted && exited.code === 0,
    code: exited.code,
    signal: exited.signal,
    error: exited.error,
    durationMs,
    logPath,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  // Anchor at the repository root so relative gate arguments
  // (src-tauri/Cargo.toml) and the log directory resolve the same way no
  // matter where the script is invoked from.
  const toplevel = (await git(["rev-parse", "--show-toplevel"])).trim();
  process.chdir(toplevel);

  const commit = (await git(["rev-parse", "HEAD"])).trim();
  const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const statusOutput = await git(["status", "--porcelain"]);

  log("RELEASE-PRECHECK");
  log(`  commit: ${commit}`);
  log(`  branch: ${branch}`);
  log(`  date:   ${new Date().toISOString()}`);
  log(`  node:   ${process.version} (${process.platform})`);
  log(`  gates:  ${gates.length}, run sequentially`);

  // A candidate must be frozen from a tree identical to its commit, so a
  // dirty tree (staged, unstaged, or untracked changes) fails the run no
  // matter how the gates go. The gates still run: the full per-gate table is
  // useful diagnostic output, clearly marked as not citable for a freeze.
  const dirty = statusOutput.trim() !== "";
  if (dirty) {
    console.error(
      "\nWorking tree is not clean (staged, unstaged, or untracked changes):",
    );
    for (const line of statusOutput.trimEnd().split("\n")) {
      console.error(`  ${line}`);
    }
    console.error(
      "\nThe gates still run below, but this run cannot PASS: gate output from an unpinned tree must not be cited as candidate evidence.",
    );
  }

  const now = new Date();
  const runId = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const logDir = path.join("output", "release-precheck", runId);
  await mkdir(logDir, { recursive: true });
  log(`  logs:   ${logDir}/<gate>.log`);

  const results = [];
  for (const gate of gates) {
    if (interrupted) {
      break;
    }
    const result = await runGate(gate, logDir);
    results.push(result);
    log(formatResultLine(result));
  }

  const failed = results.filter((result) => !result.ok);
  log("");
  if (!dirty && !interrupted && results.length === gates.length && failed.length === 0) {
    log(`RELEASE-PRECHECK PASSED ${commit}`);
    log(`All ${gates.length} gates passed. Record the evidence per docs/release/CANDIDATE_FREEZE.md before tagging.`);
    return;
  }

  log(`RELEASE-PRECHECK FAILED (${failed.length}/${gates.length} gates failed)`);
  if (dirty) {
    log("The working tree is not clean: the gate output above reflects an unpinned tree, not the commit recorded in the header, and must not be cited as evidence for it.");
    log("Commit or remove the changes listed above and rerun; a PASS requires a clean tree at the commit being frozen.");
  }
  if (interrupted) {
    log(`Interrupted by ${interrupted} after ${results.length}/${gates.length} gates; the remaining gates were not run.`);
    process.exitCode = 130;
  } else {
    process.exitCode = 1;
  }
  if (failed.length > 0 || interrupted) {
    log("A failed or missing gate is missing evidence, not a pass — see docs/release/CANDIDATE_FREEZE.md.");
  }
}

main().catch((error) => {
  console.error(
    `RELEASE-PRECHECK FAILED (setup error: ${error instanceof Error ? error.message : String(error)})`,
  );
  process.exitCode = 1;
});
