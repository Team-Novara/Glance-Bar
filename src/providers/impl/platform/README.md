# Platform impls — for Stage6 cross-platform trait

- windows/ → GSMTC, Win32 window, registry
- macos/   → NowPlaying, NSWindow, DND
- linux/   → MPRIS D-Bus, layer-shell

Each subfolder will implement `PlatformMediaProvider` / `PlatformWindowPolicy` traits.
Keep `#[cfg(target_os)]` narrow per file.
