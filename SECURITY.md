# Security policy

## Reporting a vulnerability

Please do **not** publish exploitable details in a public issue. If the hosting repository offers private vulnerability reporting, use **Security → Report a vulnerability**. Otherwise contact the maintainer privately using the private contact method listed by the repository owner.

Include the affected version, platform, reproduction steps, expected/actual behaviour and whether account data or credentials could be exposed or modified. Redact real tokens, auth keys, history exports and backups.

## Supported release line

Security fixes target the latest public release candidate/release. Older private `Stremio Guard` builds should be upgraded before reporting a defect that is already covered by current hardening.

## Security expectations

The project aims to be fail-closed and least-privilege; it does not claim that software can be proven universally unexploitable. Management is loopback-only, writes are disabled by default, network destinations are allowlisted and private-network targets are blocked. Security boundaries and known limits are documented in `docs/SECURITY.md` and `docs/THREAT-MODEL.md`.

## Out of scope

Reports that require prior control of the operating-system account running the tool, intentional editing of encrypted state with the master key already stolen or compromise of Stremio/Trakt/TMDB themselves may fall outside the project boundary. Please still report cases where the tool could reduce the impact of such conditions.
