# Watch Sync & Repair for Stremio — maintainer handover

Public release line: **1.0.0**.

The product owns four areas: native watched-state reconciliation, reviewed stale-poster repair, JSON/CSV history exchange and their safety/resilience infrastructure.

Do not reintroduce the former hosted-addon/image-proxy/spoiler/catalog/scrobble-monitor design. Do not reintroduce direct Trakt API OAuth or mutation as a default/community requirement.

## Native Trakt boundary

Stremio owns Trakt OAuth and ordinary playback scrobbling. Watch Sync & Repair obtains the linked Trakt state from the authenticated Stremio user record and reads watched history only through Stremio's own `www.strem.io/trakt/watched.json` service, following the public Stremio history-sync implementation.

The linked Trakt token is used only in memory for that Stremio-owned request and is never copied into the tool's secret store. There are no public Trakt client-ID/client-secret fields.

Automatic reconciliation may write reviewed **Trakt → Stremio** watched-state corrections to existing Stremio LibraryItems. Stremio-only historical flags that were not natively scrobbled are reported as `STREMIO_NATIVE_OUTBOUND_PENDING`; do not turn those into direct Trakt writes by borrowing Stremio's OAuth application identity.

## Locked safety architecture

Management is loopback-only and authenticated. Remote egress is HTTPS-only, exact-host allowlisted and private-network blocked. Writes default off. Plans are bounded, expire and are identity/config/secret bound. Stremio mutations use quiet checks, complete-record hashes, encrypted backups, field allowlists and readback.

Cinemeta is the episode-ordering authority. During outage, only an exact previously validated per-series mapping may be reused. Generic metadata must never become watched-bit ordering authority.

Metadata fallback is availability only, not implicit write authority. `metadata.repairFallback` remains false by default.

## Migration

When the native integration marker is absent, an old direct-Trakt reconciliation baseline is backed up in encrypted storage, then reset. Deprecated Trakt client/access/refresh secrets are purged. Watched data itself is not deleted.

## Resilience contract

404, timeout, 5xx and 429 conditions are classified by source. Safe reads may use bounded retry/cooldown. Unknown/missing source data never becomes an unwatched assertion or unreviewed write. A Stremio-Trakt service outage stops reconciliation rather than changing authority.

## Release hygiene

The public archive excludes `config.json`, `data`, exports, `.runtime`, `.development`, `node_modules`, old private releases and host-specific evidence. Public evidence must be sanitised. Runtime npm dependencies remain zero.

Before sealing: run the entire suite, config check, npm audit, secret/path scan and manifest verification; extract the source archive into a clean directory and repeat config/test verification there.
