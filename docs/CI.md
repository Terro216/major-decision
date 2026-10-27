# Continuous integration

The workflow builds the app and runs the Playwright suite on a dedicated,
isolated self-hosted runner with the project label. Only trusted owner actions on
the main branch can start this workflow; do not run untrusted pull-request code there.

The runner image provides Node, browsers and a virtual audio sink. It has no Docker
socket or production checkout. A separate proxy permits the dependencies needed
by the build; private networks and unrelated destinations are blocked.

For a new installation, copy ci/.env.example to ci/.env and choose unused subnets.
Register the runner using a short-lived repository registration token passed on stdin
to ci/runner.py. The credentials directory is ignored by Git. Do not publish tokens,
runner identities, host details or operational records.

Every run checks tracked files and the complete reachable history for private
metadata, including a regression test for disclosures removed only from the latest
commit. Changes to the application, browser tests or build inputs also run the
TypeScript/Vite build and browser suite. Documentation and privacy-check changes
run the hygiene checks without repeating an unchanged browser suite. Manual runs
always include the complete browser suite. Test artifacts are retained for seven days. Deployment is
separate from CI. Public logs must not contain deployment-specific configuration.
