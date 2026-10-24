# Linux Packaging Rehearsal

> Status: packaging-pipeline evidence only — not release evidence, and not
> Windows packaging evidence. Recorded for the execution plan's Day 19-20
> packaging rehearsal. The gaps it does not close remain open in
> [KNOWN_LIMITATIONS.md](../release/KNOWN_LIMITATIONS.md) §1.1 and §1.2 and
> must not be reported as verified behavior.

Date: 2026-10-24
Commit: `91feec867b53916d66e5b3c98d96f6e224231b25` (branch
`docs/linux-packaging-rehearsal`, working tree clean at the start of the run)

## Environment

| Fact | Value | Source |
|---|---|---|
| Kernel | `6.6.87.2-microsoft-standard-WSL2` (WSL2 on Windows, not bare-metal Linux) | `uname -r` |
| webkit2gtk | 2.52.6 | `pkg-config --modversion webkit2gtk-4.1` |
| Tauri CLI | tauri-cli 2.11.2 | `npx tauri --version` |
| Target dir | shared `~/code/Glance-Bar/src-tauri/target` (`CARGO_TARGET_DIR`), release profile partly prewarmed by earlier runs | session environment |

## Command

Run from the worktree root (`~/code/glance-worktrees/w12a-packaging`):

```
npx tauri build --bundles deb
```

Full output captured at `/tmp/tauri-build-w12a.log` (not committed). Exit code
0. The captured log spans 23:15:08–23:15:38 (≈30 s, fast because the shared
target dir was partly prewarmed): the `beforeBuildCommand` frontend build
(`npm run build` → `tsc -b && vite build`, 2120 modules) finished in 2.35 s,
the Rust `release` profile compile of the app crate finished in 21.43 s, and
the bundler then produced the deb.

## Outcome

**PASS — one deb bundle produced from the real bundle config.**

- Artifact: `/home/jay/code/Glance-Bar/src-tauri/target/release/bundle/deb/Glance Bar_1.0.0_amd64.deb`
  (under the shared target dir, not inside the worktree)
- Size: 4,771,584 bytes
- SHA-256: `c4c179bd642fa6bbaa9f209ad0b75563ac181d85731eb8359560d814a5e33502`

The artifact was then inspected read-only with `dpkg-deb --info` and
`dpkg-deb --contents`:

- Control metadata: `Package: glance-bar`, `Version: 1.0.0`,
  `Architecture: amd64`, `Depends: libayatana-appindicator3-1,
  libwebkit2gtk-4.1-0, libgtk-3-0`, `Maintainer: Team Novara`,
  `Description: Glance Bar — cross-platform Unified Status Hub`. The package
  name/version derive from the Tauri config
  (`src-tauri/tauri.conf.json:3-5`); the description and maintainer derive
  from `src-tauri/Cargo.toml:5-6`.
- Contents: `usr/bin/app` (16,379,872 bytes — the release binary, which embeds
  the built frontend), three hicolor PNG icons
  (`usr/share/icons/hicolor/{32x32,128x128,256x256@2}/apps/app.png`,
  generated from the `bundle.icon` list in `src-tauri/tauri.conf.json:37-43`),
  and a generated desktop entry `usr/share/applications/Glance Bar.desktop`.
- `bundle.resources` is not configured in `tauri.conf.json`; there are no
  external resource files to bundle. The Vite-built `dist/` assets are
  embedded in the binary at compile time, so the packaged app carries its
  frontend that way.

## What this evidence covers

- The **Linux deb packaging pipeline end to end for this commit**: the bundle
  configuration is read and honored, icons are resolved and assembled into the
  package, package metadata (name, version, dependencies, description) is
  generated, and the deb is assembled from the real release binary. It also
  demonstrates that this commit's frontend production build and Rust release
  compile both succeed — the same compile path a release build uses.

## What this evidence explicitly does NOT cover

- **Any Windows installer.** No NSIS or MSI bundle was produced — that cannot
  be built from this WSL environment, and the Windows installer pipeline has
  never been run. KNOWN_LIMITATIONS §1.1 (no packaged installer produced or
  verified; clean-checkout packaging evidence, installer launch, and
  uninstall-without-leftover-process checks) remains **pending evidence**.
- **Packaged-app runtime behavior on any OS.** The deb was only inspected
  read-only (`dpkg-deb --info` / `--contents`); it was **not installed,
  launched, or exercised**, and no automated or manual test ran against the
  packaged binary. Nothing here demonstrates the packaged app's behavior —
  the concern of KNOWN_LIMITATIONS §1.2 — and Linux runtime behavior is
  outside the Windows MVP scope in any case (KNOWN_LIMITATIONS §4).
- **Code signing and release channels.** The artifact is unsigned local
  output; no signing, notarization, or distribution channel was exercised.
- **Other bundle formats.** `bundle.targets` in `tauri.conf.json` is `all`,
  but this run forced `--bundles deb`; no other format (including the Windows
  ones) was attempted.

## Verification notes

- The run happened on WSL2, not a bare-metal Linux distribution; dependency
  installation and desktop integration of the deb on a real system were not
  exercised.
- The artifact lives in the shared target dir outside this worktree and is
  not committed — the path, size, and hash above are the record. A
  clean-checkout rebuild is still required before packaging evidence can be
  treated as reproducible (KNOWN_LIMITATIONS §1.1).
- This rehearsal changed only documentation: this file and the docs index.
  No code or packaging configuration was modified.
