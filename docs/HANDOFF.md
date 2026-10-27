# Project status

Movie and Freestyle are implemented, with independent route/answer selection,
Cyrillic input, optional sound and accessible fallback behavior. This maintenance
pass preserves scene geometry, camera paths and animation timing.

Public documentation contains product and portable development information.
Deployment-specific configuration and historical working notes are kept outside Git.
Analytics is optional and configured at build time; a fresh clone sends no analytics.

## Verification — 27 October 2026

The [full browser CI](https://github.com/Terro216/major-decision/actions/runs/40437954869)
passed all 77 scenarios in 35.7 minutes. Its 68 build inputs match the current
application and browser tests. Both Docker configuration variants build and pass
nginx validation. Three analytics scenarios and five CSP configuration cases pass.

The public history was rewritten and checked from a fresh clone. Previous workflow
records were archived privately and removed from Actions. New public logs and the
build artifact were checked for the known private identifiers.

The [history guard CI](https://github.com/Terro216/major-decision/actions/runs/40440101863)
passed its three regression checks and scanned the current files and reachable
history, including a disclosure removed only from the latest commit. Documentation and privacy-check
changes do not repeat an unchanged browser suite. No application deployment or
new visual acceptance is claimed by this maintenance pass.
