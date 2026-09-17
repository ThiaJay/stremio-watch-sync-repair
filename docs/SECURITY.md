# Security architecture

## Local management boundary

Stremio Watch Sync & Repair binds only to `127.0.0.1`. Admin routes require a random local bearer token, enforce loopback peer and strict Host checks, reject foreign browser origins and rate-limit failed authentication. Hosted addon/proxy surfaces are absent.

## Secrets and local state

Secrets and state use AES-256-GCM with profile/key-name associated data. State directories/files reject symbolic links; sensitive files reject hard links. Release archives exclude local configuration, data, exports, runtime state and keys.

### Native Trakt ownership

The public build does not ask for, store or use a Trakt developer client ID/client secret and does not obtain its own Trakt access/refresh token.

When Trakt is linked in Stremio, Stremio's `getUser` record contains the linked access token. The native adapter uses that token only in process memory to call Stremio's own watched-history service at `www.strem.io`. It does not write the token to disk, exports, logs or audit detail. Normal Stremio → Trakt playback scrobbling remains Stremio's responsibility.

The public source has no direct `api.trakt.tv` or `auth.trakt.tv` mutation/OAuth path. This is both a security boundary and an accessibility boundary: users do not need to create a separate Trakt API application.

## Network egress

Remote requests are HTTPS-only, exact-host allowlisted and reject unsafe/private destinations. DNS is resolved before connection and pinned to a verified public address. Response sizes, compression, concurrency, timeouts, retries and `Retry-After` are bounded. Mutating Stremio requests are not blindly retried.

The native Trakt connection opens Stremio's official browser authorisation URL; the local HTTP client does not capture OAuth redirects or impersonate another Trakt application.

## Stremio mutation safety

Stremio account writes replace a complete LibraryItem rather than offering a documented compare-and-set field patch. Before mutation the tool performs a fresh read, whole-record hash comparison and quiet-period check. It stores an encrypted backup, permits only reviewed fields and verifies the result afterwards.

Poster changes are restricted to configured metadata fields. Candidate URLs must use an explicitly allowed image host and normally pass a reachability and `image/*` MIME check.

## Watched-state safety

Cinemeta is the ordering authority for Stremio series watched bitmaps. If Cinemeta is down, only a mapping previously validated for that exact series can be reused.

Reconciliation requires complete identity-bound snapshots. Trakt history is read through Stremio's native service. Initial Trakt-only watched state can produce a reviewed Stremio repair. Trakt-side removals require repeated complete observations before a Stremio unwatch is proposed. Opposing changes become conflicts. Missing Stremio library membership is not created automatically.

Stremio-only discrepancies never become direct Trakt mutations. They are surfaced as native-outbound pending because Stremio owns outbound scrobbling.

## Trust limits

The tool cannot protect a fully compromised operating-system account/process memory/master key. It relies on Stremio's account API and native Trakt integration being available and semantically correct. Provider outages reduce capability; they never widen write authority.

The safest posture is local/manual: keep scheduling and write switches off except for reviewed operations.
