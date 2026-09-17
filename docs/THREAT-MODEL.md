# Threat model

The primary assets are Stremio account state, watched history, Stremio-held authentication material, local encrypted backups, history exports and the integrity of reviewed plans.

The model considers malicious remote metadata/image responses, DNS rebinding/SSRF attempts, malformed local imports, stale/replayed plans, hostile configuration edits, filesystem link attacks and attempts to reopen removed public surfaces.

It also considers non-malicious races: playback changes while a LibraryItem is being repaired, Stremio native Trakt history being unavailable, delayed provider recovery and metadata episode ordering drifting.

## Native Trakt boundary

Stremio is the OAuth owner. Watch Sync & Repair does not obtain its own Trakt developer application or persist a Trakt access/refresh token. The linked access token may exist transiently in process memory because Stremio's public history-sync design uses it to call Stremio's own watched-history service.

A compromised Stremio service/account can therefore return incorrect state; the tool reduces impact through source completeness checks, identity binding, fail-closed mapping and reviewed Stremio writes. It does not fall back to direct Trakt API calls.

## Local trust

The encrypted store assumes the operating-system user and master key have not both been compromised. Full process-memory compromise is outside the boundary. External provider compromise is also outside the boundary, though strict parsing and authority rules limit what returned data may cause.
