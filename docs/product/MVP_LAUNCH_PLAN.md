# Glance Bar MVP Launch Plan

> Purpose: turn the existing technical foundation into a Windows-first product that users can keep running every day. This is a product-validation plan, not a replacement for the engineering execution plan.

## 1. MVP decision

The MVP answers one question:

> Does a small, always-available status center help people notice and act on their most important desktop state with less effort than opening the source application?

The MVP focuses on three high-frequency states:

1. **Media**: what is playing and the available playback action.
2. **Downloads**: meaningful progress, completion, and failure states.
3. **Focus**: an active session and its completion state.

System performance remains a supporting resident state. Git, Docker, npm, AI tasks, and other developer-oriented sources remain available for engineering experiments but are not MVP success criteria.

## 2. User and job to be done

### Primary user

Windows users who work with media, downloads, and focused work sessions while switching between several applications.

### Job to be done

When an important desktop activity changes, the user wants to understand what happened and take the next small action without searching for the originating application.

### Product promise

Glance Bar should be useful at a glance, predictable when it changes, and quiet when it has nothing valuable to say.

## 3. MVP scope

### In scope

- Windows desktop shell: tray, show/hide, close-to-tray, position persistence, and autostart.
- Media, download, and focus states flowing through the Provider -> HubEventBus -> state -> UI path.
- Clear priority, duration, manual-selection, and auto-return rules.
- Safe unavailable/fallback states when a source cannot provide live data.
- Settings for always float, fullscreen avoidance, lock position, and autostart.
- Basic diagnostics and a reproducible bug-report path.

### Out of scope

- Feature parity on macOS and Linux.
- Account integrations, browser scraping, chat scraping, or process inspection.
- A full notification center, task manager, or developer dashboard.
- Adding new source types unless user evidence shows that one is more valuable than the three MVP states.

## 4. Display policy to validate

The scheduler must make visible behavior explainable. The exact timings can be tuned during testing, but the MVP uses these rules as the starting contract:

| Situation | Expected behavior |
|---|---|
| User selects a status manually | Pin it for the configured preference window, then return to automatic selection. |
| A download completes or fails | Surface it promptly for a bounded period, then return to the next useful state. |
| A focus session completes | Surface completion clearly and offer the next relevant action. |
| Media is active without a higher-priority state | Show media, alternating with the resident state only when the policy says both deserve space. |
| Source is unavailable or malformed | Do not show misleading live data; render the supported fallback/health state. |
| User is in fullscreen mode | Respect the fullscreen-avoidance preference. |

Every visible change should be attributable to one of these rules. If a tester cannot explain why the displayed state changed, it is a product bug.

## 5. Six-week delivery plan

### Week 1 — define the experience contract

- Confirm the three MVP states and write their source, display, expiry, and action rules.
- Create a concise scenario matrix covering normal, empty, unavailable, completion, and failure behavior.
- Identify which existing provider paths are production-ready and which need fallback work.

**Exit criteria:** the team can describe what the bar shows in every MVP scenario without referring to implementation details.

### Week 2 — make scheduling predictable

- Verify priority, manual selection, preference expiry, and media/resident alternation against the scenario matrix.
- Add focused scheduler and resolver tests for every MVP rule.
- Remove visual transitions that obscure why a state changed.

**Exit criteria:** automated tests and a manual walkthrough agree on the visible state for each scenario.

### Weeks 3–4 — harden the Windows daily-use path

- Validate tray recall, close behavior, autostart, settings persistence, dragging, and fullscreen avoidance.
- Harden media, download, and focus providers against unavailable runtime data and restart/cleanup behavior.
- Make error and degraded states understandable without exposing private system data.
- Run the application in normal work sessions and record failures or interruptions.

**Exit criteria:** the bar can remain enabled for a workday without broken positioning, repeated noise, unhandled failures, or misleading state.

### Week 5 — user validation

- Recruit 3–5 target users or internal testers.
- Ask each tester to use the bar during normal work for several sessions.
- Collect short structured feedback after each session: useful moment, distracting moment, confusing transition, missing action, and whether they would keep it enabled.

**Exit criteria:** there is evidence for the most useful state, the most disruptive behavior, and the next product decision.

### Week 6 — release candidate

- Fix the highest-frequency confusion and reliability issues.
- Remove or hide low-value behavior discovered during validation.
- Prepare a Windows release checklist, known limitations, and a feedback channel.

**Exit criteria:** the MVP meets the release criteria below and has a clear post-MVP decision.

## 6. Release criteria

The MVP is ready for a limited Windows release when all of the following are true:

- The application installs, launches, recalls from the tray, and respects saved preferences.
- Media, download, and focus states have verified live or truthful fallback behavior.
- No state claims to be live when its provider reports unavailable, unsupported, or degraded input.
- Manual selection and automatic return behave predictably.
- Fullscreen avoidance, lock position, and always-float preferences work as described.
- Required TypeScript, Vitest, QA, and Rust checks pass for the release candidate.
- At least three testers have completed the validation sessions and the findings are recorded.

## 7. Success metrics

Use qualitative evidence first; avoid pretending that early product value can be reduced to one dashboard number.

| Signal | MVP target |
|---|---|
| Daily usefulness | Most testers can name at least one moment when the bar saved them a context switch. |
| Noise | No repeated complaint that the bar interrupted work without useful information. |
| Understandability | Testers can usually explain why the visible state changed. |
| Retention intent | A majority of testers choose to keep the bar enabled after the trial. |
| Reliability | No unresolved high-severity desktop-shell or misleading-status issue during the final validation week. |

## 8. Post-MVP decision gate

After the release candidate, choose one direction using evidence:

1. **Deepen the core** if media, downloads, and focus are valuable but need reliability or interaction refinement.
2. **Add one new state** only if users repeatedly request the same missing source and it fits the low-interruption promise.
3. **Start another platform** only after the Windows experience is stable and the capability/fallback contract can be carried across platforms.

The default decision is to deepen the core. New integrations are earned by observed user value, not by the availability of another API.
