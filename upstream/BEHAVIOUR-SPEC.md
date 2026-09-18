# Watched-state reconciliation behavior specification

This is the implementation-neutral contract proven by the reference test suite.

## Sources and identity

1. Stremio account state and native linked-Trakt state are separate identified sources.
2. A source-account or linked-Trakt identity change never reuses the previous baseline silently.
3. The previous baseline is preserved for recovery, source observations are cleared and one no-write rebaseline cycle occurs.
4. Missing, failed, partial, malformed or rate-limited source data is **unknown**, never equivalent to unwatched.

## Multi-device concurrency

1. Multiple Stremio devices changing one account is normal.
2. A Stremio snapshot is accepted only if a complete second account read is identical.
3. Before a reference-harness write, the exact LibraryItem is reread and must match the planned record.
4. It is reread again immediately before the non-atomic write and verified afterwards.
5. Any concurrent drift cancels the operation; ambiguous post-write state creates a durable hold.
6. Native Stremio integration should eliminate the residual external read/write race by owning the transition inside Core/API.

## Direction and origin

- Trakt watched + Stremio not watched: eligible for safe Stremio repair when identity/mapping/library membership are proven.
- Stremio watched + Trakt not watched: allow native Stremio scrobbling a grace period, then classify pending/stale; never synthesize a direct Trakt write in the reference harness.
- Explicit Stremio-side unwatch keeps Stremio origin and is never later "repaired" back to watched merely because Trakt still has old history.
- Trakt-side unwatch is destructive and requires repeated complete observations; automatic removal is not the default.
- Opposing source changes become a conflict rather than last-writer guessing.

## Initial and historical ambiguity

Historical state does not carry enough episode-level origin/timestamp information to infer every old conflict. Initial migration should therefore be additive/safe by default. Future explicit user actions can carry authoritative origin/time and support proper two-way native convergence.

## Series mapping

Cinemeta/canonical Stremio episode ordering is authoritative for watched bitfields. Previously validated order may be used for the same series during outage. New or reordered/unmapped series are isolated, not guessed.

Specials (season 0), year-numbered seasons, non-episode video rows, duplicate episode identities, duplicate watched anchors and numbering-scheme mismatches are all handled explicitly in the reference tests.

## Batching and restart

Safe inbound repairs are bounded. A backlog larger than one batch continues in later batches rather than disappearing after baseline advancement. An interrupted APPLYING operation produces a durable review hold. Successful writes are idempotently read back before baseline advancement.

## Network/source failure

404/408/425/429/5xx, timeouts, invalid JSON, cooldown and Retry-After are handled without converting absence into state. Security-policy errors never fall through to a weaker provider.
