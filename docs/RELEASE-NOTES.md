# Watch Sync & Repair for Stremio 1.0.1

This is the hardened community reference implementation and account-repair harness for a Stremio-native watched-state fix. It is not a Stremio addon, device daemon or hosted sync service.

## Native Trakt design

Stremio remains the OAuth owner and normal playback scrobbler. No Trakt developer application, client ID, client secret or VIP subscription is required. The reference harness reads linked watched history through Stremio's existing native integration and has no direct Trakt mutation path.

## Hardened reconciliation

- complete, identity-bound Stremio and native-Trakt snapshots;
- multi-device account changes abort rather than merge speculatively;
- source/account relinks preserve the old baseline and perform a no-write rebaseline;
- safe inbound watched repairs converge in bounded batches;
- intentional Stremio-side unwatch retains origin and is never repaired back from stale Trakt state;
- destructive Trakt-side unwatch requires repeated complete observations;
- malformed, partial, duplicate or unavailable native history fails closed;
- provider numbering/catalog mismatches are isolated rather than guessed.

## Episode-map resilience

Cinemeta remains primary authority. Exact previously validated video order is retained in an encrypted mapping registry so an existing watched bitmap can survive later catalog drift or anchor removal. The registry preserves non-episode video rows because they occupy bitmap positions. Duplicate episode identities may be readable when all duplicate bits agree, while writes remain blocked as ambiguous.

## Public/upstream positioning

Device autostart, Docker/systemd worker and hosted-watchdog designs were retired from the public tree. The permanent cross-device target is Stremio Core/account integration. The upstream folder contains the issue map, implementation-neutral behavior specification and smallest-change core outline aligned to Stremio's current contribution guide.

## Verification

The final source suite passes **175/175 tests** with zero failures or skips. There are zero runtime npm dependencies and npm audit --omit=dev reports zero known vulnerabilities. Public syntax and real-value secret-leak gates also pass.

See RELEASE-STATUS.json, evidence/public-release-review-1.0.1.json and docs/STREMIO-COMPLIANCE.md.
