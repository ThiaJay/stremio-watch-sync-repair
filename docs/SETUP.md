# Setup and operation

## Install

1. Install Node.js 22.14+ or use a trusted project-local runtime you supplied yourself.
2. Extract the source into a user-controlled folder. Do not run it from a shared/network-writable directory.
3. On Windows open `Open Watch Sync & Repair for Stremio.vbs`. On other platforms run `npm start`, then obtain the local dashboard URL with `node src/cli.js dashboard-url`.
4. The service binds to `127.0.0.1` only. It does not need router/firewall exposure or hosted HTTPS.

`config.json` and `data/` are created locally and excluded from release archives. The data path must remain inside the project tree.

## Connect Stremio and Trakt

Use **Connect Stremio** in the dashboard and complete the official Stremio pairing flow.

For watched reconciliation, use **Connect Trakt through Stremio** if Trakt is not already linked to the Stremio account. This opens Stremio's own Trakt authorisation page. No Trakt API application, client ID, client secret or VIP subscription is required by Watch Sync & Repair.

The linked Trakt access token remains owned by Stremio. Watch Sync & Repair reads it from the Stremio user record only in memory to call Stremio's own watched-history service; it is not copied into the local encrypted secret store.

Normal playback/scrobbling remains Stremio's job. Watch Sync & Repair repairs reviewed Trakt → Stremio state differences. Historical Stremio-only flags that native playback never scrobbled are reported, not pushed with borrowed Trakt API credentials.

## Poster source

Poster repair is optional. Configure one or both supported source modes:

- **Upstream**: save an HTTPS Stremio-style metadata manifest/base URL.
- **TMDB**: save your own TMDB read token. TMDB can be primary or fallback.

Provider order lives in `metadata.source` and `metadata.fallbackSources`. Fallback poster writes are disabled by default even when fallback reads are allowed.

## First reconciliation

Keep `server.scheduleEnabled`, `libraryRepair.writeEnabled`, `libraryRepair.allowNonAtomicAccountWrites` and `trakt.stremioWriteEnabled` false. Run **Compare Stremio ↔ Trakt** and inspect the bounded preview.

The first native baseline may propose only Trakt → Stremio repairs. Stremio-only differences are shown as `STREMIO_NATIVE_OUTBOUND_PENDING` because normal outbound history belongs to Stremio's native scrobbler. Missing/unknown state cannot become an automatic unwatch.

## Poster repair

Run **Preview stale poster repairs** with writes off. A changed poster must be HTTPS, on `network.imageHosts` and—unless disabled—reachable with an `image/*` response. Recently active LibraryItems are deferred.

Stremio writes are whole-record operations. To apply a reviewed poster plan you must explicitly enable both `libraryRepair.writeEnabled` and `libraryRepair.allowNonAtomicAccountWrites`.

## Upgrading old builds

Safe older configurations migrate to the current v3 native mode. Removed hosted/addon/spoiler/catalog/scrobble-monitor settings must already be disabled. Deprecated direct-Trakt client/access/refresh secrets are purged. An existing direct-Trakt reconciliation baseline is preserved as an encrypted private backup before the native baseline is reset.

Old history JSON/CSV schema identifiers remain accepted for import. The old `STREMIO_GUARD_CONFIG` and `GUARD_MASTER_KEY` environment variables remain migration aliases.

## Ongoing use

The PC does not need to remain running for ordinary Stremio playback or native Trakt scrobbling. Run the tool when you want inbound reconciliation, poster repair or history export. Scheduling is optional and remains gated.
