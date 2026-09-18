# Minimal Stremio-native change outline

This is a discussion aid, not a ready-made PR. Stremio's contribution guide asks maintainers to agree architectural ownership first.

## Existing core hooks

Current core already has `ActionCtx::LibraryItemMarkAsWatched { id, is_watched }`, `LibraryItem::mark_as_watched()`, account LibraryItem persistence and Trakt playback events.

## Smallest useful first change

Ensure an explicit manual watched-state transition produces a native Trakt-sync intent **after** the Stremio account transition is accepted, using Stremio-owned identity/OAuth infrastructure. The intent must identify the media, desired watched state and authoritative event time/origin.

Do not route this through the addon protocol and do not expose Trakt client secrets/tokens to addons or community services.

## Native inbound reconciliation

Reuse or replace the existing `stremio-history-sync` import behavior with an idempotent account/core action that can be triggered at login/resume and at a maintainer-approved cadence while a client is active. A failed source must leave account state unchanged.

## Retrospective outbound reconciliation

Old Stremio watched bitmaps lack enough per-episode origin/time information to resolve every conflict. Treat old history as an explicit migration operation with additive-safe defaults. Once the new transition path exists, future manual/external-player events can be exact.

## Multi-device idempotence

Two active clients may emit the same desired transition. The Stremio-owned path should be idempotent by account/media/desired-state and should use server/core ordering rather than trusting local device clocks where possible.

## Unwatch semantics

Do not infer unwatch from absence. Only an explicit Stremio unwatch or a proven Trakt history removal should request deletion. Maintainers should confirm how Trakt play-history removal semantics map to Stremio's boolean watched model before outbound unwatch is enabled.
