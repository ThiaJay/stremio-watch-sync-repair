# Recovery and troubleshooting

The tool is designed to stop rather than “repair” uncertain state.

## Source/outage stops

- `SOURCE_COOLDOWN`: repeated transient failures opened a bounded source cooldown. Do not bypass it by widening network access; retry later or use a configured provider fallback where appropriate.
- `WATCHED_MAPPING_UNAVAILABLE` / `CINEMETA_ENDPOINT_UNAVAILABLE`: no authoritative/current series map is available. A validated cached mapping may be used automatically; otherwise the series stays unknown.
- `POSTER_UNREACHABLE` / `POSTER_CONTENT_TYPE_INVALID`: the replacement artwork could not be proved to be a reachable image; no poster mutation is planned.
- `TRAKT_PAGINATION_MISSING`, `TRAKT_CHANGED_DURING_PAGINATION` or `TRAKT_CHANGED_DURING_SCAN`: discard the unstable read and retry a complete snapshot.
- `UPSTREAM_429`: safe reads honour bounded `Retry-After`; writes are not blindly replayed.
- `TRAKT_ITEM_NOT_FOUND`: that identifier is isolated. A mixed bulk response can still verify accepted peers independently.

## Stale/concurrent state

- `NEWER_ITEM_STATE_DETECTED` / `ITEM_RECENTLY_ACTIVE`: Stremio changed after preview or is inside its quiet window. Generate a fresh plan later.
- `WATCHED_ANCHOR_MISSING`, `EPISODE_ORDER_CHANGED`, `WATCHED_BITMAP_CORRUPT`: do not regenerate the bitmap from another metadata provider. Isolate/review the series.
- `WATCHED_PLAN_STALE` / `PLAN_EXPIRED_OR_CHANGED`: source/config/secret state changed after preview. Generate a new plan.
- `OPPOSING_WATCHED_CHANGES`: both sides changed incompatibly from the baseline. Resolve manually.

## Write holds

`WRITE_OUTCOME_UNKNOWN`, `SYNC_PARTIAL_WRITE`, `UNEXPECTED_STATE_CHANGE` and `INTERRUPTED_WRITE_REQUIRES_REVIEW` block further mutation. Inspect the encrypted backup/index, current live state and stopped plan before acknowledging a hold. Never clear a hold merely to make automation continue.
## Manual history review

Export history before resolving ambiguous differences. JSON includes hashed source identities; CSV is editable. Only fill `desired` for rows you have actually reviewed. Import always rereads current sources before generating a plan.

Do not invent old episode timestamps merely to eliminate a difference. Trakt history is timestamped; if Stremio proves “watched” without a trustworthy episode date, leaving the row review-only is safer than claiming it was watched now or on an arbitrary historical date.

## Poster restoration

A Stremio backup stores the complete before-record, intended candidate and allowed fields. Restoration creates a new preview that overlays only the originally changed metadata fields onto the **current** LibraryItem. Watched/progress restoration is handled through reconciliation, not stale whole-record rollback.

## Service lock

Use `Stop Stremio Watch Sync & Repair.vbs` / `Open Stremio Watch Sync & Repair.vbs` on Windows. A stale `data/service.lock` may be cleared with the CLI only after its recorded PID is no longer alive. A live owner's lock must never be removed.

Keep `config.json`, `data/`, `.master-key`, exports and plaintext `backup-export` results private. If the master key is lost, encrypted state cannot be recovered; reconnect accounts and rebuild state rather than weakening encryption.
