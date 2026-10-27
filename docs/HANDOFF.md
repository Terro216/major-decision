# Project status

Movie and Freestyle are implemented, with independent route/answer selection,
Cyrillic input, optional sound and accessible fallback behavior. This maintenance
pass preserves scene geometry, camera paths and animation timing.

Public documentation now contains product and portable development information.
Deployment-specific configuration and historical working notes are kept outside Git.
Analytics is optional and configured at build time; a fresh clone sends no analytics.

CI validates public-repository hygiene before building and running the browser suite.
The history cleanup and final CI verification are in progress; this document will
be updated with the verified result. No application deployment is part of this pass.
