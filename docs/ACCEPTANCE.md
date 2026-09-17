# Public release acceptance — 1.0.0

Acceptance is separated into automated regression/adversarial coverage, migration checks and private operational interoperability. Public evidence contains no account identifiers, tokens, viewing history or screenshots.

## Automated acceptance

Final native-mode public suite: **146 tests, 146 passed, 0 failed, 0 skipped**.

Coverage includes:

- Stremio watched-bitfield decode/encode, mapping drift and malformed/corrupt bitmap isolation;
- Stremio-native Trakt authorisation/history reads with no developer application or direct Trakt mutation API;
- first native baseline behaviour, Trakt → Stremio additions, repeated inbound unwatch confirmation, opposing-change conflicts and stale-plan rejection;
- Stremio-only history reported as native-outbound pending rather than direct Trakt writes;
- native-integration migration: encrypted old-baseline backup, reset of obsolete reconciliation identity and purge of deprecated Trakt OAuth/client secrets;
- source 404/timeouts, bounded cooldown, metadata fallback authority and Cinemeta outage with validated-cache-only mapping fallback;
- poster host allowlists, reachability, MIME verification and safe skip on broken sources;
- HTTPS-only/DNS-pinned egress, private-network blocking and bounded response/concurrency controls;
- encrypted storage tamper detection, profile separation, symlink/hardlink protection and safe locking;
- loopback-only HTTP administration, auth/origin/Host gates, removed addon surface, request limits and security headers;
- configuration migration and bounds on community customisation;
- reviewed Stremio write plans, backups, quiet-period checks, readback, holds and competing-writer protection;
- JSON/CSV export/import identity checks, malformed input and spreadsheet-formula neutralisation.

The release candidate must not be sealed unless the final test run reports zero failed and zero skipped tests.

## Native operational interoperability

The actual linked Stremio account was read through the new native adapter with **zero external writes**. Stremio's linked Trakt state was detected and Stremio's own watched-history service returned a complete snapshot. No Trakt developer credentials were configured or required.

A read-only first native reconciliation produced no account writes and no conflicts. Stremio-only discrepancies were classified as native-outbound pending. Series whose legacy watched bitmaps cannot be mapped safely remain isolated rather than guessed.

## Configuration/state migration acceptance

The live configuration was normalized to v3 native mode with scheduling and all write gates off. The previous direct-Trakt baseline was preserved as an encrypted private backup before reset. Deprecated direct Trakt client/access/refresh secrets were removed. Stremio credentials and watched data were retained.

## Release gates

The final candidate must also pass npm audit, syntax checks, private-value leak scans, source/manifest verification and independent archive extraction/retest. The service must start only on loopback with write gates off.
