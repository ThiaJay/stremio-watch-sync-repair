# Stremio Watch Sync & Repair 1.0.0

This is the first community release candidate under the descriptive public name **Stremio Watch Sync & Repair**.

## What it does

- reads watched history through **Stremio's existing native Trakt integration**;
- repairs reviewed Trakt → Stremio watched-state differences in existing Stremio LibraryItems;
- reports Stremio-only historical differences without performing unsupported direct Trakt mutations;
- repairs reviewed stale poster URLs; and
- exports/imports comparison data for manual recovery.

No Trakt developer application, client ID, client secret or VIP subscription is required by this tool.

## Native Trakt design

Stremio remains the OAuth owner and playback scrobbler. The linked token from the Stremio user record is used only in memory to query Stremio's own watched-history service. It is never copied into Watch Sync & Repair's local secret store.

The abandoned direct-Trakt community design has been removed: no direct Trakt OAuth, no direct `api.trakt.tv` history mutation, no Trakt write retries and no user developer-app setup. Older direct-integration baselines are encrypted-backup/reset on migration and obsolete Trakt secrets are purged.

## Public-surface reduction

Management is localhost-only. Hosted Stremio addon endpoints, arbitrary image proxy/rendering, spoiler/catalog and scrobble-monitor functionality are not part of the public runtime.

## Resilience

Remote reads use bounded retry/cooldown. Missing/expired native Trakt auth or a Stremio Trakt-service outage stops reconciliation rather than being interpreted as empty history. Cinemeta remains sole watched-bit ordering authority with exact validated-cache fallback only. Poster 404/down responses are safe skips.

## Security

Local state is AES-256-GCM encrypted and rejects unsafe link/file types. Egress is HTTPS-only, exact-host allowlisted and private-network/DNS-rebinding protected. Writes default off and every Stremio mutation is previewed, bounded, backed up and read back.

The runtime has zero npm dependencies. CI pins official actions to full commit SHAs.

## Compatibility

Legacy history files remain importable. Safe older configs migrate to native v3. Deprecated direct-Trakt credentials are removed during migration.

## Verification

Final automated counts and release hashes are recorded in `RELEASE-STATUS.json` and `evidence/public-release-review-1.0.0.json` after the sealed archive is independently extracted and retested.
