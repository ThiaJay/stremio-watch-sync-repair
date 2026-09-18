# Upstream path for Stremio

## Positioning

This project is a **community companion and reference implementation**, not a Stremio addon and not an unofficial binary patch.

Stremio addons provide content resources such as catalog/meta/stream/subtitles. Watched-state reconciliation changes authenticated account state, so forcing it into the addon protocol would create the wrong security and lifecycle model.

## What the reference implementation proves

The companion already implements and tests:

- complete, identity-bound Stremio account snapshots;
- protection against another Stremio client changing state during a scan or immediately before a write;
- native Stremio-linked Trakt watched-history reads;
- Trakt → Stremio watched repair;
- repeated-observation rules before Trakt → Stremio unwatch;
- Cinemeta-authoritative episode ordering with validated-cache outage fallback;
- external/manual Stremio changes as outbound grace/pending/stale observations;
- bounded retries, cooldowns, write backups, readback and write holds.

These behaviours can be used as executable acceptance criteria for a native implementation.

## Small upstream capability 1: background inbound reconciliation

Stremio already publishes `stremio-history-sync` and already owns the Trakt OAuth connection. The smallest native improvement is to make the existing Trakt-history import/reconciliation callable by Stremio Core as a background action with a maintainer-selected cadence.

Required properties:

1. complete history response before mutation;
2. no missing/failed response interpreted as unwatched;
3. canonical episode order;
4. idempotent writes;
5. account/library state revalidated before write;
6. retry/backoff owned by Stremio;
7. no second Trakt application.

## Small upstream capability 2: retrospective outbound history

Open Stremio feature requests #1563 and #1883 cover the remaining gap: manually marked watched/unwatched state and external-player history do not have a general retrospective Stremio → Trakt path.

The clean native solution is a **Stremio-owned server/core action** that submits an explicit watched/unwatched history decision through Stremio's existing Trakt OAuth ownership. The community companion should never need the user's Trakt token or Stremio's Trakt client identity.

The action should be idempotent, accept stable media identity plus watched state/date when known, return an explicit result and be safe to retry only where the server can prove idempotence.

## Contribution sequence

Stremio Core's contribution guide asks contributors to discuss architectural work before implementing it and to keep PRs focused.

Recommended sequence:

1. Publish this companion/reference implementation with its test suite.
2. Comment on feature requests #1563 and #1883 with the concrete behaviour matrix and reference repository.
3. Ask maintainers whether they prefer the background import work in Core, Web or the Stremio backend/history-sync package.
4. Prepare one focused PR for inbound background reconciliation after maintainers agree the ownership boundary.
5. Treat retrospective outbound history as a separate change/PR because it needs a Stremio-owned Trakt write primitive.
6. Keep community fallback code until released Stremio versions expose equivalent native behaviour, then automatically disable redundant companion functions.

## Why this is easy to absorb

The companion is intentionally decomposed into pure reconciliation rules plus adapters. Stremio does not need the local dashboard, encrypted file store or any device/background-service wrapper. It can lift the tested state-transition rules and implement them against Stremio Core/backend primitives.

That keeps the upstream change small and lets Stremio choose its own scheduling, telemetry, UX and infrastructure policy.
