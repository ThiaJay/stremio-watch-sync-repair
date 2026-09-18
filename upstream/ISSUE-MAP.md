# Existing Stremio issues

Do not open another generic "better Trakt sync" request. The root problem is already represented upstream.

## Directly relevant

- **#1305 — Trakt 2-way sync is not working for manual actions**: manual watched actions do not reach Trakt.
- **#1883 — sync watched history to trakt**: manual/external-player watched history should reach Trakt.
- **#1563 — Option to sync watch history to Trakt**: retroactive Stremio history after auth expiry or late Trakt setup.
- **#245 — Sync Stremio history with Trakt**: history predating Trakt integration is not pushed.
- **#1145 — Full Trakt Integration**: manual marks, external players and unreliable ordinary scrobbling.

## Related but separate

- **#1476**: iOS/tvOS platform scrobbling support.
- **#1800**: external-player callback/progress integration.
- **#1805**: using integrated Trakt data for Continue Watching.
- **#345**: Trakt watched history reflected in Stremio.
- **#344**: library/watchlist synchronization; this is not watched-history reconciliation.

## Recommended discussion sequence

Start with the existing manual/history issues rather than opening a duplicate. Present the reproducible state-transition matrix and reference tests. Ask maintainers where they want the Stremio-owned outbound-history primitive to live. Only after that decision should a focused core/backend PR be opened.
