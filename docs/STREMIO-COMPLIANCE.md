# Stremio upstream compliance

This repository is a community **reference and adversarial test harness** for watched-state reconciliation. It is not a Stremio addon, hosted sync service, device daemon or unofficial Stremio binary.

## Contribution contract followed

The upstream target is `Stremio/stremio-core`. Its current `CONTRIBUTING.md` requires contributors to search existing issues/PRs, discuss architectural changes with maintainers first, branch from `development`, keep PRs focused, make the smallest practical root-cause change, follow Action/Internal/Event runtime discipline, add unit tests and run the documented Rust validation commands.

Accordingly, this project does **not** publish an unsolicited broad core refactor. It provides executable behavior and issue mapping first, then a focused patch after maintainers confirm the ownership boundary.

## Native ownership boundaries

- Stremio remains owner of the Stremio account, LibraryItems and linked Trakt OAuth state.
- Users do not provide a Trakt developer client ID/secret and this project has no direct Trakt mutation API.
- Normal playback scrobbling remains Stremio functionality.
- The reference harness reads native linked Trakt history only through Stremio's existing integration.
- Account writes are restricted to existing Stremio LibraryItems and are used only for reference/repair validation.
- The production cross-device implementation belongs in Stremio Core/backend so no particular user device must remain running.

## Required native behavior

A native implementation should preserve all behavior in `upstream/BEHAVIOUR-SPEC.md`, particularly complete-source requirements, explicit origin tracking, multi-device conflict handling, episode-order authority, idempotence, account identity isolation and fail-closed outage behavior.

## Validation expected by Stremio

Before a future core PR is opened, run the upstream-required commands:

```sh
cargo fmt --all -- --check
cargo clippy --all --no-deps -- -D warnings
cargo test
git diff --check
```

If the WASM bridge changes:

```sh
cd stremio-core-web
npm ci
npm run build
```

Persisted core-type changes require the upstream schema-version bump and migration required by Stremio's contribution guide. The preferred first change avoids a persisted-type change if maintainers agree.
