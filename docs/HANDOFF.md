# Project status

Movie and Freestyle are implemented, with independent route/answer selection,
Cyrillic input, optional sound and accessible fallback behavior.

Freestyle now uses a continuous camera sweep through the pin field, spiral and
target. Camera movement and aiming follow the ball with different smoothing
windows, so rebounds remain visible without jolting the entire view. Shot
transitions share velocity and acceleration; short approaches have extra turning
time. The seed adds restrained framing variation. Movie trajectories, collision
geometry, answer selection and sound timing are unchanged. Playback now starts
its clock when the first frame callback actually runs, preventing a slow scene
preparation from skipping the opening in either mode.

Public documentation contains product and portable development information.
Deployment-specific configuration and historical working notes are kept outside Git.
Analytics is optional and configured at build time; a fresh clone sends no analytics.

## Camera verification — 28 October 2026

The TypeScript/Vite build and eight camera/trajectory regression tests pass.
Coverage includes 100 seeds on each route with the complete ball inside the frame,
reverse seeking, repeatable camera poses, bounded camera acceleration and banking,
opening/result framing and physical contact timing. Both routes and answers were
compared visually with the baseline; desktop/mobile checks covered pause/resume,
backward seeking, answer-independent frames and reduced motion. Full-journey
30 fps exports and browser video playback checks are retained privately.

The initial full CI passed 77 of 78 scenarios and exposed an existing first-frame
clock jump in Movie. A controlled delayed-frame regression reproduces it on the
baseline; it and both real Movie journeys pass with the correction. Complete
browser CI for the corrected clock is pending. No application
deployment, physical-device frame rate or user visual acceptance is claimed.

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
