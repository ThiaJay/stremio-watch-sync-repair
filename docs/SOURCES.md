# Implementation references

Provider/API contracts were rechecked for the public release in September 2026. Remote contracts can change; adapter mismatches fail closed rather than being guessed.

- **Stremio Core** (`Stremio/stremio-core`): current Stremio library/profile/account model and watched-state behaviour.
- **Stremio History Sync** (`Stremio/stremio-history-sync`): authoritative public reference for Stremio's Trakt history integration. It reads `userData.trakt.access_token`, requests `https://www.strem.io/trakt/watched.json` and imports watched history into Stremio. Watch Sync & Repair follows this native ownership boundary rather than asking users to create a separate Trakt application.
- **Stremio watched-bitfield**: compatibility reference for series watched-state encoding.
- **Stremio addon protocol documentation**: IMDb series video IDs use the `imdb:season:episode` form used by mapping validation.
- **TMDB API**: optional IMDb→TMDB metadata/poster fallback.
- **Stremio-style upstream metadata endpoints**: optional user-configured poster source, treated as untrusted remote input.

The source release does not bundle Stremio auth keys, linked Trakt tokens, TMDB tokens, upstream metadata credentials, history exports or upstream artwork. The linked Trakt token is never copied into the tool's local secret store.

No Stremio source code is bundled. Watched-bitfield compatibility is independently implemented and tested with synthetic fixtures plus read-only native interoperability.

- **TMDB attribution assets**: the About/Credits view uses the unmodified approved Primary short (blue) SVG from TMDB's official Logos & Attribution page.
