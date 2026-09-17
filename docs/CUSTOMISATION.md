# Customisation reference

All public settings use config schema **v3**. The dashboard validates the whole configuration before saving it. Unknown keys and out-of-range values fail closed.

## Profiles

Each profile has its own encrypted state and Stremio connection. Up to 20 profiles are supported. Two enabled writer profiles resolving to the same Stremio account are blocked as competing writers.

## Native watched reconciliation (`trakt`)

- `mode`: fixed to `stremio-native`.
- `stremioWriteEnabled`: default `false`; permits reviewed watched-state repairs **into Stremio only**.
- `syncMarkUnwatched`: allows a Trakt-side unwatch to be proposed for Stremio after confirmation.
- `confirmUnwatchedCycles`: 2–10 separated complete observations before a Trakt-side unwatch may be proposed.
- `conflictPolicy`: retained for conflict handling; ambiguous opposing changes are held for review.
- `maxChanges`: 1–100 Stremio repair operations per automatic plan.
- `intervalMinutes`: 5–1440 when scheduling is enabled.

Stremio owns Trakt OAuth and normal playback scrobbling. There are no Trakt client-ID/secret settings and no direct Trakt mutation setting. Stremio-only historical discrepancies are reported as `STREMIO_NATIVE_OUTBOUND_PENDING`.

## Poster repair (`libraryRepair`)

- `writeEnabled`: default `false`.
- `allowNonAtomicAccountWrites`: separate acknowledgement of Stremio's whole-LibraryItem write limitation; default `false`.
- `quietSeconds`: 60–86400; recently changed/playback-active items are deferred.
- `maxChanges`: 1–100 per plan.
- `fields`: subset of `poster`, `posterShape`, `name`.
- `verifyPosterReachability`: default `true`.
- `intervalMinutes`: 5–1440.

## Metadata (`metadata` / `metadataText`)

- `source`: `upstream` or `tmdb`.
- `fallbackSources`: ordered alternate providers.
- `repairFallback`: default `false`.
- `cacheSeconds`: 0–300.
- `metadataText.preferredLanguages`: ordered BCP-47 language tags.
- `metadataText.fallbackOrder`: `preferred`, `original` and optionally `any`.

Metadata provider fallback never controls Stremio watched-bit ordering. That authority remains Cinemeta/validated cache.

## Resilience (`resilience`)

- `readRetries`: 0–3 for safe/idempotent reads.
- `requestTimeoutSeconds`: 5–60.
- `sourceFailureThreshold`: 1–10 transient failures before circuit cooldown.
- `sourceCooldownSeconds`: 5–3600.
- `maxRetryAfterSeconds`: 1–300 maximum honoured upstream delay.
- `watchedMappingFallback`: `validated-cache-only` or `none`.

## Network allowlists (`network`)

`metadataHosts` and `imageHosts` contain exact public DNS hostnames only. The Stremio and Stremio-Trakt service hosts are fixed in code and are not user-expandable arbitrary proxy targets.

## Scheduling (`server.scheduleEnabled`)

Scheduling is off by default. Enabling it does not remove write gates: a scheduled native watched plan must be complete, unconflicted, within the batch limit and contain only safe positive Stremio repairs. Removals always remain review-gated.
