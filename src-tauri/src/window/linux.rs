// ---------------------------------------------------------------------------
// Linux platform window policy — X11 EWMH implementation behind the STAGE6
// validation gate.
// ---------------------------------------------------------------------------
// Owns the Linux window-behavior work: z-order control (`_NET_WM_STATE_ABOVE`
// / `_NET_WM_STATE_BELOW`), tool-window styling (`_NET_WM_WINDOW_TYPE_UTILITY`)
// and fullscreen detection (`_NET_WM_STATE_FULLSCREEN` on `_NET_ACTIVE_WINDOW`),
// all spoken as raw EWMH client messages / properties over an x11rb connection.
//
// Capability gate (STAGE6 design rule: a capability must keep its stub behavior
// until it has been validated on real target hardware): the implementation
// below is complete, but `LINUX_WINDOW_VALIDATED` is `false`, so every trait
// method returns exactly the pre-implementation stub results (`Ok(())`,
// `false`) without touching X11. Flip the const to `true` only after recording
// validation evidence on a real Linux desktop; that flip is the single switch
// that enables the policy end to end (`commands/window.rs` already routes the
// Linux platform through this module).
//
// Wayland limitation: EWMH exists only on X11. A native Wayland session
// exposes no XID on the `WebviewWindow` raw handle, so the setters
// conservatively do nothing (and the fullscreen query reports `false`); an
// XWayland session (WSLg, most compositors' X11 compat) is the supported
// path. Native Wayland layer-shell is out of scope for Stage6.
//
// Shadow suppression is deliberately a documented no-op: the Windows policy
// fights DWM artifacts, while Linux shadows come from the compositor
// (picom/kwin rules, per-window shadow options) and are not controllable
// through a portable X11 mechanism. Nothing is faked here.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::WebviewWindow;

use crate::window::PlatformWindowPolicy;

/// STAGE6 validation gate for the Linux window policy. `false` = keep the
/// exact stub behavior of earlier builds (`Ok(())`, `false`) without touching
/// X11; `true` = run the EWMH implementation in [`ewmh`]. Flip only together
/// with recorded real-desktop validation evidence (and the gate test below).
const LINUX_WINDOW_VALIDATED: bool = false;

pub struct LinuxPolicy;

#[cfg(target_os = "linux")]
impl PlatformWindowPolicy for LinuxPolicy {
    fn disable_shadow(_window: &WebviewWindow, _shutdown: Arc<AtomicBool>) {
        // Deliberate no-op, gated or not: shadow suppression on Linux is a
        // compositor concern (picom rules, kwin window rules) with no
        // portable X11/EWMH equivalent. Faking success here would hide the
        // gap; the app's own window config already asks for a borderless,
        // shadow-free surface via the windowing toolkit.
    }

    fn apply_tool_style(window: &WebviewWindow) -> Result<(), String> {
        if !LINUX_WINDOW_VALIDATED {
            return Ok(());
        }
        ewmh::apply_tool_style_for_xid(ewmh::window_xid(window));
        Ok(())
    }

    fn set_z_order(window: &WebviewWindow, floating: bool) -> Result<(), String> {
        if !LINUX_WINDOW_VALIDATED {
            return Ok(());
        }
        ewmh::set_z_order_for_xid(ewmh::window_xid(window), floating);
        Ok(())
    }

    fn foreground_is_fullscreen() -> bool {
        if !LINUX_WINDOW_VALIDATED {
            return false;
        }
        ewmh::foreground_is_fullscreen()
    }
}

/// No-op impl so the struct compiles on non-linux targets.
#[cfg(not(target_os = "linux"))]
impl PlatformWindowPolicy for LinuxPolicy {
    fn disable_shadow(_window: &WebviewWindow, _shutdown: Arc<AtomicBool>) {}

    fn apply_tool_style(_window: &WebviewWindow) -> Result<(), String> {
        Ok(())
    }

    fn set_z_order(_window: &WebviewWindow, _floating: bool) -> Result<(), String> {
        Ok(())
    }

    fn foreground_is_fullscreen() -> bool {
        false
    }
}

/// EWMH internals. Everything that touches x11rb lives here and compiles only
/// on Linux (x11rb is a Linux-target dependency); the trait impl above stays
/// compilable on every platform.
///
/// x11rb 0.13 ships no EWMH helper API (the `ewmh` module / `EwmhConnection`
/// trait landed after 0.13), so the client messages and properties are built
/// from the core protocol exactly as libxcb-based clients do. Every operation
/// is one short-lived connection plus a handful of round trips on a local
/// socket, bounded overall by [`X11_EXCHANGE_TIMEOUT`].
#[cfg(target_os = "linux")]
mod ewmh {
    use std::sync::mpsc;
    use std::time::Duration;

    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tauri::WebviewWindow;
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{
        Atom, AtomEnum, ClientMessageData, ClientMessageEvent, ConnectionExt, EventMask, PropMode,
        Window,
    };
    use x11rb::rust_connection::RustConnection;

    /// The `_NET_WM_STATE` client-message type (root-window property of the
    /// same name carries the current state list).
    pub(super) const NAME_NET_WM_STATE: &str = "_NET_WM_STATE";
    /// Keep-above state property.
    pub(super) const NAME_NET_WM_STATE_ABOVE: &str = "_NET_WM_STATE_ABOVE";
    /// Keep-below state property.
    pub(super) const NAME_NET_WM_STATE_BELOW: &str = "_NET_WM_STATE_BELOW";
    /// Fullscreen state property (the one the fullscreen query looks for).
    pub(super) const NAME_NET_WM_STATE_FULLSCREEN: &str = "_NET_WM_STATE_FULLSCREEN";
    /// Window-type property replaced by the tool-window style.
    pub(super) const NAME_NET_WM_WINDOW_TYPE: &str = "_NET_WM_WINDOW_TYPE";
    /// The tool-window type atom (taskbar/pager/alt-tab avoidance).
    pub(super) const NAME_NET_WM_WINDOW_TYPE_UTILITY: &str = "_NET_WM_WINDOW_TYPE_UTILITY";
    /// Root-window property holding the active window id.
    pub(super) const NAME_NET_ACTIVE_WINDOW: &str = "_NET_ACTIVE_WINDOW";

    /// `_NET_WM_STATE` client-message action codes (EWMH 1.5, `_NET_WM_STATE`).
    pub(super) const NET_WM_STATE_REMOVE: u32 = 0;
    pub(super) const NET_WM_STATE_ADD: u32 = 1;
    /// Source indication (EWMH 1.5): this policy only ever changes its own
    /// window, so the honest value is `1` (application), not pager.
    pub(super) const NET_WM_SOURCE_APPLICATION: u32 = 1;

    /// Bound for one complete X11 exchange (connect, requests, replies).
    ///
    /// x11rb 0.13's blocking API offers no per-call timeout — its poll waits
    /// indefinitely — so the whole exchange runs on a worker thread and the
    /// calling thread waits at most this long. A hung or absent X server
    /// therefore degrades to the conservative result instead of freezing the
    /// main thread (where the sync Tauri commands that invoke this policy
    /// run). One second is far above a healthy local round trip and short
    /// enough to keep the worst-case hiccup imperceptible.
    pub(super) const X11_EXCHANGE_TIMEOUT: Duration = Duration::from_millis(1_000);

    /// Cap (in 32-bit words) for a single property read. Real `_NET_WM_STATE`
    /// lists hold a handful of atoms; 512 is far beyond any real window and
    /// keeps the reply size bounded.
    const MAX_PROPERTY_WORDS: u32 = 512;

    // -----------------------------------------------------------------------
    // Pure helpers (no X11; unit-tested below)
    // -----------------------------------------------------------------------

    /// The `_NET_WM_STATE_*` properties the z-order policy manipulates.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub(super) enum ZOrderState {
        /// Keep the window above normal siblings (`_NET_WM_STATE_ABOVE`).
        Above,
        /// Keep the window below normal siblings (`_NET_WM_STATE_BELOW`).
        Below,
    }

    impl ZOrderState {
        /// EWMH property-atom name for this state.
        #[must_use]
        pub(super) fn atom_name(self) -> &'static str {
            match self {
                Self::Above => NAME_NET_WM_STATE_ABOVE,
                Self::Below => NAME_NET_WM_STATE_BELOW,
            }
        }
    }

    /// One EWMH `_NET_WM_STATE` property transition: an action code plus the
    /// state property it applies to.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub(super) struct StateTransition {
        /// `NET_WM_STATE_ADD` or `NET_WM_STATE_REMOVE`.
        pub(super) action: u32,
        /// The state this transition targets.
        pub(super) state: ZOrderState,
    }

    /// The z-order transitions mirroring the Windows policy's
    /// `HWND_TOPMOST` / `HWND_BOTTOM` semantics: floating adds `_NET_WM_STATE_ABOVE`
    /// and clears `_NET_WM_STATE_BELOW`; parked adds `_NET_WM_STATE_BELOW`
    /// and clears `_NET_WM_STATE_ABOVE`. Two transitions are needed because
    /// one `_NET_WM_STATE` client message applies a single action to its
    /// properties.
    #[must_use]
    pub(super) fn z_order_transitions(floating: bool) -> [StateTransition; 2] {
        if floating {
            [
                StateTransition {
                    action: NET_WM_STATE_ADD,
                    state: ZOrderState::Above,
                },
                StateTransition {
                    action: NET_WM_STATE_REMOVE,
                    state: ZOrderState::Below,
                },
            ]
        } else {
            [
                StateTransition {
                    action: NET_WM_STATE_ADD,
                    state: ZOrderState::Below,
                },
                StateTransition {
                    action: NET_WM_STATE_REMOVE,
                    state: ZOrderState::Above,
                },
            ]
        }
    }

    /// Build the `_NET_WM_STATE` client message for one transition. Per EWMH
    /// 1.5 the message targets the root window with `data.l[0]` = action,
    /// `data.l[1]` = the property atom, `data.l[2]` = 0 (no second property)
    /// and `data.l[3]` = source indication (application).
    #[must_use]
    pub(super) fn state_toggle_message(
        window: Window,
        state_message_type: Atom,
        transition: StateTransition,
        property_atom: Atom,
    ) -> ClientMessageEvent {
        ClientMessageEvent::new(
            32,
            window,
            state_message_type,
            ClientMessageData::from([
                transition.action,
                property_atom,
                0,
                NET_WM_SOURCE_APPLICATION,
                0,
            ]),
        )
    }

    /// Parse a format-32 property payload into its 32-bit words (atoms or
    /// window ids). Format-32 property data crosses the wire in the client's
    /// byte order — the same native-endian encoding x11rb itself uses. Any
    /// other format, or a truncated trailing word, yields no words: callers
    /// treat "cannot read the list" as "unknown", never inventing values.
    #[must_use]
    pub(super) fn parse_u32_property(value: &[u8], format: u8) -> Vec<u32> {
        if format != 32 {
            return Vec::new();
        }
        value
            .chunks_exact(4)
            .filter_map(|word| word.try_into().ok().map(u32::from_ne_bytes))
            .collect()
    }

    /// Conservative fullscreen predicate over a queried `_NET_WM_STATE` atom
    /// list: true only when the list explicitly carries the
    /// `_NET_WM_STATE_FULLSCREEN` atom; an empty (unset property), missing, or
    /// partial list stays false — never guessed.
    #[must_use]
    pub(super) fn state_list_is_fullscreen(states: &[Atom], fullscreen_atom: Atom) -> bool {
        states.contains(&fullscreen_atom)
    }

    /// The `_NET_ACTIVE_WINDOW` value worth probing: `0` (`XCB_NONE`, or no
    /// EWMH window manager at all) and the root window itself are not real
    /// client windows — mirroring the Windows policy's desktop/shell-window
    /// exclusion, conservatively.
    #[must_use]
    pub(super) fn active_window_candidate(active: Window, root: Window) -> Option<Window> {
        if active == 0 || active == root {
            return None;
        }
        Some(active)
    }

    /// Extract the X11 window id from a raw window handle. Only X11 backends
    /// carry an XID — `Xlib` (what GTK's gdk-x11, and therefore tauri on
    /// X11/XWayland, reports) or `Xcb` (pure-xcb toolkits). A native Wayland
    /// handle has no XID: EWMH is not reachable there, which the callers
    /// treat as "do nothing" rather than an error. XID 0 (`XCB_NONE`) and
    /// out-of-32-bit-range values are rejected.
    #[must_use]
    pub(super) fn xid_from_raw_window_handle(handle: RawWindowHandle) -> Option<Window> {
        match handle {
            RawWindowHandle::Xlib(handle) => {
                u32::try_from(handle.window).ok().filter(|xid| *xid != 0)
            }
            // `NonZeroU32` rules out XCB_NONE by construction.
            RawWindowHandle::Xcb(handle) => Some(handle.window.get()),
            _ => None,
        }
    }

    // -----------------------------------------------------------------------
    // Bounded X11 exchange
    // -----------------------------------------------------------------------

    /// Run one complete X11 exchange (connect, requests, replies) on a worker
    /// thread, waiting at most [`X11_EXCHANGE_TIMEOUT`]. `None` covers every
    /// failure: no `$DISPLAY`, connection refused, a hung or broken server, X
    /// errors, and timeouts. A timed-out worker is abandoned (detached; its
    /// connection is dropped whenever it eventually finishes), so the calling
    /// thread never blocks past the timeout.
    fn with_x11_exchange<T>(
        exchange: impl FnOnce(&RustConnection, Window) -> Option<T> + Send + 'static,
    ) -> Option<T>
    where
        T: Send + 'static,
    {
        let (sender, receiver) = mpsc::channel();
        let worker = std::thread::Builder::new()
            .name("glance-x11-policy".to_string())
            .spawn(move || {
                // The worker owns the whole exchange; `None` is sent for
                // every failure so the receiving side can only ever observe
                // success or timeout.
                let outcome = exchange_on_fresh_connection(exchange);
                // The receiving side may already have timed out and gone.
                let _ = sender.send(outcome);
            });
        // Failing to spawn the worker at all is just another None.
        worker.ok()?;
        receiver.recv_timeout(X11_EXCHANGE_TIMEOUT).ok().flatten()
    }

    /// Open one x11rb blocking connection (`$DISPLAY`, with the same auth and
    /// abstract-socket handling the toolkit itself uses) and run the exchange
    /// against the default screen's root window.
    fn exchange_on_fresh_connection<T>(
        exchange: impl FnOnce(&RustConnection, Window) -> Option<T>,
    ) -> Option<T> {
        let (connection, screen) = x11rb::connect(None).ok()?;
        let root = connection
            .setup()
            .roots
            .get(screen)
            .map(|screen_info| screen_info.root)?;
        exchange(&connection, root)
    }

    // -----------------------------------------------------------------------
    // Small request helpers (conservative: None on every failure)
    // -----------------------------------------------------------------------

    /// Intern an atom, but only if it already exists. `None` means the atom
    /// is unknown — for `_NET_*` names that is a non-EWMH window manager, so
    /// callers skip the operation instead of talking to a WM that cannot
    /// understand it.
    fn intern_existing_atom(connection: &RustConnection, name: &str) -> Option<Atom> {
        let reply = connection
            .intern_atom(true, name.as_bytes())
            .ok()?
            .reply()
            .ok()?;
        Some(reply.atom).filter(|atom| *atom != 0)
    }

    /// Read one format-32 `XA_WINDOW` property (single word) — the
    /// `_NET_ACTIVE_WINDOW` shape.
    fn read_window_word(
        connection: &RustConnection,
        window: Window,
        property: Atom,
    ) -> Option<Window> {
        let reply = connection
            .get_property(false, window, property, AtomEnum::WINDOW, 0, 1)
            .ok()?
            .reply()
            .ok()?;
        parse_u32_property(&reply.value, reply.format)
            .first()
            .copied()
    }

    /// Read one format-32 `XA_ATOM` list property — the `_NET_WM_STATE` and
    /// `_NET_WM_WINDOW_TYPE` shape. A missing property parses to an empty
    /// list (not an error).
    fn read_atom_list(
        connection: &RustConnection,
        window: Window,
        property: Atom,
    ) -> Option<Vec<Atom>> {
        let reply = connection
            .get_property(
                false,
                window,
                property,
                AtomEnum::ATOM,
                0,
                MAX_PROPERTY_WORDS,
            )
            .ok()?
            .reply()
            .ok()?;
        Some(parse_u32_property(&reply.value, reply.format))
    }

    // -----------------------------------------------------------------------
    // Policy operations
    // -----------------------------------------------------------------------

    /// Resolve the status window's XID on the calling (main) thread. tauri
    /// implements rwh 0.6 `HasWindowHandle` for `WebviewWindow`; on the
    /// X11/XWayland GTK backend that handle carries the XID as a cached
    /// toolkit value — no X round trip happens here.
    pub(super) fn window_xid(window: &WebviewWindow) -> Option<Window> {
        let handle = window.window_handle().ok()?;
        xid_from_raw_window_handle(handle.as_raw())
    }

    /// Apply the tool-window style: replace `_NET_WM_WINDOW_TYPE` with
    /// exactly `[_NET_WM_WINDOW_TYPE_UTILITY]`, mirroring the Windows
    /// policy's `WS_EX_TOOLWINDOW`-without-`WS_EX_APPWINDOW` semantics (skip
    /// taskbar / pager / alt-tab presence). The write is skipped when the
    /// type is already exactly UTILITY, mirroring the Windows policy's
    /// "only write when the style would change" guard.
    ///
    /// Every failure — including a native Wayland session, where no XID
    /// exists — conservatively does nothing: no error is surfaced for a
    /// styling hint the compositor may not even honor.
    pub(super) fn apply_tool_style_for_xid(xid: Option<Window>) {
        let Some(window) = xid else {
            return;
        };

        with_x11_exchange(move |connection, _root| {
            let property = intern_existing_atom(connection, NAME_NET_WM_WINDOW_TYPE)?;
            let utility = intern_existing_atom(connection, NAME_NET_WM_WINDOW_TYPE_UTILITY)?;

            let current = read_atom_list(connection, window, property)?;
            if current == [utility] {
                return Some(());
            }

            // Format-32 property data is written in the client's native byte
            // order — the same encoding x11rb uses for every u32 it
            // serializes.
            let data = utility.to_ne_bytes();
            connection
                .change_property(
                    PropMode::REPLACE,
                    window,
                    property,
                    AtomEnum::ATOM,
                    32,
                    1,
                    &data,
                )
                .ok()?
                .check()
                .ok()?;
            connection.flush().ok()?;
            Some(())
        });
    }

    /// Move the window above (`floating`) or below (parked) its siblings by
    /// sending the two `_NET_WM_STATE` client messages from
    /// [`z_order_transitions`] to the root window — the EWMH equivalent of
    /// the Windows policy's `HWND_TOPMOST` / `HWND_BOTTOM` placement. The
    /// messages carry the `SubstructureNotify | SubstructureRedirect` event
    /// mask so the window manager (the only client allowed to select those)
    /// receives them.
    ///
    /// Every failure — including a native Wayland session, where no XID
    /// exists, or a non-EWMH window manager, where the `_NET_WM_STATE` atoms
    /// do not exist — conservatively does nothing.
    pub(super) fn set_z_order_for_xid(xid: Option<Window>, floating: bool) {
        let Some(window) = xid else {
            return;
        };

        with_x11_exchange(move |connection, root| {
            let state = intern_existing_atom(connection, NAME_NET_WM_STATE)?;
            let above = intern_existing_atom(connection, ZOrderState::Above.atom_name())?;
            let below = intern_existing_atom(connection, ZOrderState::Below.atom_name())?;

            for transition in z_order_transitions(floating) {
                let property_atom = match transition.state {
                    ZOrderState::Above => above,
                    ZOrderState::Below => below,
                };
                let message = state_toggle_message(window, state, transition, property_atom);
                connection
                    .send_event(
                        false,
                        root,
                        EventMask::SUBSTRUCTURE_NOTIFY | EventMask::SUBSTRUCTURE_REDIRECT,
                        message,
                    )
                    .ok()?
                    .check()
                    .ok()?;
            }
            connection.flush().ok()?;
            Some(())
        });
    }

    /// True if the EWMH active window is a client window currently in the
    /// `_NET_WM_STATE_FULLSCREEN` state. Every failure — no `$DISPLAY`, a
    /// non-EWMH window manager, no active window, an unreadable state list —
    /// conservatively reports `false` (the same answer the Windows policy
    /// gives for desktop/shell/own-process foregrounds).
    pub(super) fn foreground_is_fullscreen() -> bool {
        with_x11_exchange(|connection, root| {
            let active_property = intern_existing_atom(connection, NAME_NET_ACTIVE_WINDOW)?;
            let state_property = intern_existing_atom(connection, NAME_NET_WM_STATE)?;
            let fullscreen = intern_existing_atom(connection, NAME_NET_WM_STATE_FULLSCREEN)?;

            let active = read_window_word(connection, root, active_property)?;
            let window = active_window_candidate(active, root)?;
            let states = read_atom_list(connection, window, state_property)?;
            Some(state_list_is_fullscreen(&states, fullscreen))
        })
        .unwrap_or(false)
    }
}

// ---------------------------------------------------------------------------
// Unit tests — pure logic only: no X11 connection is made anywhere here, so
// these pass in CI environments without a display. Everything below compiles
// only on Linux (x11rb / raw-window-handle are Linux-target dependencies).
// ---------------------------------------------------------------------------
#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::ewmh::{
        active_window_candidate, apply_tool_style_for_xid, parse_u32_property, set_z_order_for_xid,
        state_list_is_fullscreen, state_toggle_message, xid_from_raw_window_handle,
        z_order_transitions, StateTransition, ZOrderState, NAME_NET_WM_STATE,
        NAME_NET_WM_WINDOW_TYPE_UTILITY, NET_WM_SOURCE_APPLICATION, NET_WM_STATE_ADD,
        NET_WM_STATE_REMOVE,
    };
    use super::LINUX_WINDOW_VALIDATED;
    use raw_window_handle::{
        RawWindowHandle, WaylandWindowHandle, XcbWindowHandle, XlibWindowHandle,
    };
    use x11rb::protocol::xproto::CLIENT_MESSAGE_EVENT;

    #[test]
    fn gate_keeps_the_policy_at_stub_behavior() {
        // STAGE6 contract: until real-desktop validation is recorded, the
        // policy must keep the exact stub behavior — Ok(()) and false —
        // without touching X11. A `WebviewWindow` cannot be constructed
        // headlessly, so the trait methods cannot be invoked from this test;
        // the contract is pinned structurally (the gate check above precedes
        // every X11 call) plus by this const assertion. Flipping
        // LINUX_WINDOW_VALIDATED requires updating this test together with
        // the validation evidence.
        assert!(!LINUX_WINDOW_VALIDATED);
    }

    #[test]
    fn floating_adds_above_and_clears_below() {
        let transitions = z_order_transitions(true);
        assert_eq!(
            transitions[0],
            StateTransition {
                action: NET_WM_STATE_ADD,
                state: ZOrderState::Above,
            }
        );
        assert_eq!(
            transitions[1],
            StateTransition {
                action: NET_WM_STATE_REMOVE,
                state: ZOrderState::Below,
            }
        );
    }

    #[test]
    fn parked_adds_below_and_clears_above() {
        let transitions = z_order_transitions(false);
        assert_eq!(
            transitions[0],
            StateTransition {
                action: NET_WM_STATE_ADD,
                state: ZOrderState::Below,
            }
        );
        assert_eq!(
            transitions[1],
            StateTransition {
                action: NET_WM_STATE_REMOVE,
                state: ZOrderState::Above,
            }
        );
    }

    #[test]
    fn z_order_states_use_the_ewmh_atom_names() {
        assert_eq!(ZOrderState::Above.atom_name(), "_NET_WM_STATE_ABOVE");
        assert_eq!(ZOrderState::Below.atom_name(), "_NET_WM_STATE_BELOW");
        // The message-type property and the fullscreen probe use the
        // canonical EWMH names too — a typo here would silently disable the
        // whole policy on every window manager.
        assert_eq!(NAME_NET_WM_STATE, "_NET_WM_STATE");
        assert_eq!(
            super::ewmh::NAME_NET_WM_STATE_FULLSCREEN,
            "_NET_WM_STATE_FULLSCREEN"
        );
        assert_eq!(super::ewmh::NAME_NET_ACTIVE_WINDOW, "_NET_ACTIVE_WINDOW");
        assert_eq!(
            NAME_NET_WM_WINDOW_TYPE_UTILITY,
            "_NET_WM_WINDOW_TYPE_UTILITY"
        );
        assert_eq!(super::ewmh::NAME_NET_WM_WINDOW_TYPE, "_NET_WM_WINDOW_TYPE");
    }

    #[test]
    fn state_toggle_message_carries_action_property_and_source() {
        let transition = z_order_transitions(true)[0];
        let message = state_toggle_message(0x1200_0042, 0x77, transition, 0x99);

        assert_eq!(message.response_type, CLIENT_MESSAGE_EVENT);
        assert_eq!(message.format, 32);
        assert_eq!(message.window, 0x1200_0042);
        assert_eq!(message.type_, 0x77);
        // action, property, no second property, source=application.
        assert_eq!(
            message.data.as_data32(),
            [NET_WM_STATE_ADD, 0x99, 0, NET_WM_SOURCE_APPLICATION, 0]
        );
    }

    #[test]
    fn removal_transitions_carry_the_remove_action() {
        let transition = z_order_transitions(false)[1];
        let message = state_toggle_message(7, 1, transition, 0xAB);
        let data = message.data.as_data32();
        assert_eq!(data[0], NET_WM_STATE_REMOVE);
        assert_eq!(data[1], 0xAB);
        assert_eq!(data[3], NET_WM_SOURCE_APPLICATION);
    }

    #[test]
    fn parses_native_endian_format32_words() {
        let words: [u32; 3] = [0x1, 0xdead_beef, 0xffff_ffff];
        let bytes: Vec<u8> = words.iter().flat_map(|word| word.to_ne_bytes()).collect();
        assert_eq!(parse_u32_property(&bytes, 32), words);
    }

    #[test]
    fn empty_property_parses_to_no_words() {
        assert!(parse_u32_property(&[], 32).is_empty());
        // A missing property replies with format 0 and no value.
        assert!(parse_u32_property(&[], 0).is_empty());
    }

    #[test]
    fn non_format32_property_is_never_reinterpreted() {
        // e.g. a STRING-typed property (format 8) must not be read as words.
        assert!(parse_u32_property(b"just some text", 8).is_empty());
        assert!(parse_u32_property(&[0, 0], 16).is_empty());
    }

    #[test]
    fn truncated_trailing_word_is_dropped() {
        // One full word plus one stray byte: the stray byte is ignored
        // rather than turned into a bogus window id / atom.
        let bytes = [0x2a, 0, 0, 0, 0x7f];
        assert_eq!(parse_u32_property(&bytes, 32), vec![0x2a]);
    }

    #[test]
    fn fullscreen_requires_the_explicit_state_atom() {
        assert!(state_list_is_fullscreen(&[0x1, 0x99, 0x2], 0x99));
        assert!(!state_list_is_fullscreen(&[0x1, 0x2], 0x99));
        // Unset property (empty list) and a list read as another format
        // stay false — never guessed.
        assert!(!state_list_is_fullscreen(&[], 0x99));
        assert!(!state_list_is_fullscreen(
            &parse_u32_property(b"junk", 8),
            0x99
        ));
    }

    #[test]
    fn active_window_zero_and_root_are_not_clients() {
        let root = 0x3a;
        assert_eq!(active_window_candidate(0, root), None);
        assert_eq!(active_window_candidate(root, root), None);
        assert_eq!(
            active_window_candidate(0x1200_0055, root),
            Some(0x1200_0055)
        );
    }

    #[test]
    fn xid_comes_from_xlib_and_xcb_handles_only() {
        assert_eq!(
            xid_from_raw_window_handle(RawWindowHandle::Xlib(XlibWindowHandle::new(0x2a))),
            Some(0x2a)
        );
        // The Xcb handle's window id is NonZeroU32 — XCB_NONE impossible.
        assert_eq!(
            xid_from_raw_window_handle(RawWindowHandle::Xcb(XcbWindowHandle::new(
                std::num::NonZeroU32::new(0x2b).expect("nonzero test xid")
            ))),
            Some(0x2b)
        );
        // Native Wayland surfaces carry no XID; EWMH is simply not reachable.
        assert_eq!(
            xid_from_raw_window_handle(RawWindowHandle::Wayland(WaylandWindowHandle::new(
                std::ptr::NonNull::dangling()
            ))),
            None
        );
    }

    #[test]
    fn xid_zero_or_out_of_range_is_rejected() {
        // XID 0 is XCB_NONE, not a window.
        assert_eq!(
            xid_from_raw_window_handle(RawWindowHandle::Xlib(XlibWindowHandle::new(0))),
            None
        );
        // X11 window ids are 32-bit; a wider `c_ulong` value cannot be one.
        assert_eq!(
            xid_from_raw_window_handle(RawWindowHandle::Xlib(XlibWindowHandle::new(
                u64::from(u32::MAX) + 1
            ))),
            None
        );
    }

    #[test]
    fn wayland_or_handleless_sessions_do_nothing() {
        // Without an XID (native Wayland, or the raw handle being
        // unavailable) the setters must complete immediately, successfully,
        // and without ever opening an X11 connection — the None path
        // short-circuits before the exchange helper runs.
        apply_tool_style_for_xid(None);
        set_z_order_for_xid(None, true);
        set_z_order_for_xid(None, false);
    }
}
