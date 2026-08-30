// Feature barrel — the single public API of the showcase feature
// (STRUCTURE_REFACTOR_PLAN.md §4 Rule 2). Routing the lazy() dynamic
// import through this barrel keeps the async chunk limited to the page
// and its CSS, while deep paths stay an internal implementation detail.
export { ShowcasePage } from "./ShowcasePage";
