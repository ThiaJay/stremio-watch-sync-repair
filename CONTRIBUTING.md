# Contributing

Contributions are welcome when they preserve the deliberately small scope: watched-state reconciliation, stale stored-poster repair, manual history exchange and the safety/resilience needed to support those jobs.

## Before changing behaviour

- Preserve Stremio's ownership of Trakt OAuth and outbound playback scrobbling. Do not add a user Trakt developer-app requirement or direct Trakt history mutation path without an explicit public design review.
- Keep account writes **off by default**.
- Do not turn missing, timed-out, 404 or unmappable data into a negative/unwatched assertion.
- Do not add public listeners, arbitrary URL fetches, raw proxies or unauthenticated mutation routes.
- Keep outbound hosts explicit and preserve private-network blocking.
- Treat Stremio whole-LibraryItem writes as non-atomic and preserve fresh-read/hash/backup/readback gates.

## Pull-request standard

Run `npm test`. Add regression tests for both the intended behaviour and realistic failure/adversarial cases. New configuration must be bounded and documented. New sources need an authority/fallback policy explaining what can happen on 404, timeout, malformed response and identity mismatch.

Avoid new runtime dependencies unless the benefit clearly outweighs the supply-chain and attack-surface cost. The current runtime intentionally has none.

Never commit `config.json`, `data/`, `.master-key`, exports, backups, tokens, real account identifiers or local runtime binaries. Use synthetic fixtures only.

## Compatibility

If a schema change is necessary, provide an explicit migration that narrows or preserves authority. Removed security boundaries must fail migration rather than silently reopening an old surface.
