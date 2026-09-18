# Maintainer discussion notes

## Primary upstream discussion

Use **Stremio/stremio-features #1305 — "Trakt 2-way sync is not working for manual actions"** as the first discussion target.

Why this issue:
- it is open;
- it is narrowly about an explicit manual watched action;
- current Stremio Core already has `ActionCtx::LibraryItemMarkAsWatched` and account persistence for that transition;
- it avoids mixing in the separate external-player and historical-backfill problems.

## Keep the first change deliberately narrow

First native behavior to agree with maintainers:

1. user explicitly marks an existing Stremio LibraryItem watched;
2. Stremio accepts/persists that account transition;
3. the same Stremio-owned integration emits an idempotent Trakt watched-history intent;
4. no addon API, community Trakt client ID/secret or separate OAuth ownership is introduced;
5. duplicate intents from multiple active Stremio devices are harmless.

Do **not** bundle these into the first PR:
- external-player callbacks (#1883/#1800);
- retroactive bulk history export (#1563);
- Trakt watchlist/library synchronization (#344);
- Continue Watching semantics (#1805);
- general platform-scrobbling fixes (#1476).

Those can reuse the same native primitive after its ownership and semantics are accepted.

## Evidence available

- 175/175 adversarial reference tests pass.
- The reference harness has exercised the real native Stremio/Trakt account path without direct Trakt API ownership.
- Multi-device drift, source relink, malformed/partial history, catalog drift, duplicate episode identity, bounded batching, interrupted writes and provider numbering mismatches have explicit behavior.
- The implementation-neutral contract is in `upstream/BEHAVIOUR-SPEC.md`.
- The minimal core outline is in `upstream/CORE-CHANGE-OUTLINE.md`.
- Stremio contribution requirements are summarized in `docs/STREMIO-COMPLIANCE.md`.

## Questions for maintainers

- Should the native watched-history intent be emitted directly from the existing manual watched action or from a backend/account event after persistence?
- What Stremio-owned primitive should perform the Trakt history mutation?
- What idempotency key/ordering should be authoritative across multiple devices?
- Should explicit manual unwatch be part of the same first change or a separate follow-up after Trakt removal semantics are agreed?
- Where should inbound native reconciliation live: Core, backend/history-sync or another Stremio-owned component?

These are discussion notes, not text intended to be pasted verbatim into an issue or PR.
