# Documentation Contribution Guide

The repository-level [CONTRIBUTING.md](../CONTRIBUTING.md) defines workflow. This guide explains documentation ownership.

## Current sources of truth

- Product and execution: [GLANCE_BAR_PLAN.md](plans/GLANCE_BAR_PLAN.md)
- Structure and dependency rules: [STRUCTURE_REFACTOR_PLAN.md](plans/STRUCTURE_REFACTOR_PLAN.md)
- Architecture and event path: [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) and [architecture/EVENT_FLOW.md](architecture/EVENT_FLOW.md)
- Provider extension contract: [providers/PROVIDER_SDK.md](providers/PROVIDER_SDK.md)

## Update expectations

Update the relevant current page when you change a public contract, module location, runtime behavior, user-visible state, developer workflow, or quality gate. Keep code paths relative to the repository and point to real files.

Do not edit `docs/archive/`. When material becomes historical, mark its active-page copy as superseded and link to the active source rather than duplicating implementation facts.
