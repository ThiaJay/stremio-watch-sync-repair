# Third-party notices

Stremio Watch Sync & Repair is community software licensed under MIT. It is not affiliated with or endorsed by Stremio, Trakt or TMDB.

The project interoperates with external services and protocols but does not bundle their services, credentials or artwork.

- **Stremio Core** and its watched-bitfield implementation are published by Smart Code OOD under MIT. Stremio behaviour/protocols are interoperability references; no Stremio Core source is copied into this package.
- **Stremio History Sync** is used as the interoperability reference for Stremio's native Trakt history import and Cinemeta video-ID lookup.
- **Trakt** is accessed only through the connection owned by the user's Stremio account and Stremio's own watched-history service. This tool does not require a separate Trakt developer application and does not bundle or persist Stremio's linked Trakt token.
- **TMDB** is an optional metadata fallback. This product uses the TMDB API but is not endorsed or certified by TMDB. This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB. The dashboard includes TMDB's approved Primary short (blue) logo, unmodified, in About/Credits.

Node.js, if supplied separately or through a user-created project-local runtime, retains its own licence notices. The source archive does not redistribute Node.js.

Stremio account keys, linked Trakt/TMDB tokens, metadata URLs, local master keys, viewing-history exports, backups and upstream images are excluded from public release archives.
