// Feature barrel — the single public API of the desktop feature
// (STRUCTURE_REFACTOR_PLAN.md §4 Rule 2). External consumers must
// import from here, never from deep paths inside the feature, so the
// internals stay free to move.
export { DesktopPage } from "./DesktopPage";
