# Source resilience and failure behaviour

Failures are classified by authority and certainty. A fallback may preserve availability only when it cannot silently change account-state meaning.

| Source / failure | Behaviour | May write? |
|---|---|---|
| Stremio read timeout / 5xx / 529 | bounded retry for idempotent reads; then stop | No if fresh state cannot be proved |
| Stremio write error | never blindly retry; read back outcome; hold if uncertain | Further writes stop on uncertainty |
| Stremio native Trakt token missing/expired | stop and ask user to connect/reconnect Trakt through Stremio | No |
| Stremio Trakt history 404/429/5xx/timeout | bounded safe-read retry where applicable; then stop | No until a complete native snapshot exists |
| Stremio-only watched discrepancy | report `STREMIO_NATIVE_OUTBOUND_PENDING` | No direct Trakt write |
| Metadata primary 404 | try only an explicitly configured fallback provider | Poster fallback still requires policy/review |
| Metadata timeout/5xx | bounded retry, source circuit/cooldown, then configured fallback | Only if all poster gates pass |
| Metadata security failure | fail immediately; no convenient fallback | No |
| Poster URL 404/down | safe skip; source cooldown after repeated transient failure | No poster write |
| Poster HEAD unsupported | bounded GET probe; require `image/*` MIME | Only after successful probe |
| Cinemeta 404/down | use exact previously validated series mapping if permitted | Yes for that proven mapping only |
| Cinemeta down + new/unproved series | mark series unknown/isolate | No |

## Native Trakt service

The Trakt source is deliberately treated as a Stremio-owned source, not as a second OAuth client. The adapter reads the current Stremio user link and then Stremio's watched-history endpoint. It does not fall back to direct Trakt API access when the native route is down.

A missing/expired link is not negative history. A native-source outage is not an empty watched set. Both conditions stop reconciliation safely.

## Circuit breaking

Metadata/image/Cinemeta sources track transient failures in memory. After the configured threshold they enter cooldown. A cooldown does not imply negative account state. Restarting resets in-memory circuit counters, not validation history.
