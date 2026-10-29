# Project status

Movie and Freestyle are implemented, with independent route/answer selection,
Cyrillic input, optional sound and accessible fallback behavior.

Freestyle now uses a continuous camera sweep through the pin field, spiral and
target. Camera movement and aiming follow the ball with different smoothing
windows, so rebounds remain visible without jolting the entire view. Shot
transitions share velocity and acceleration; short approaches have extra turning
time. The seed adds restrained framing variation. Playback now starts
its clock when the first frame callback actually runs, preventing a slow scene
preparation from skipping the opening in either mode.

Public documentation contains product and portable development information.
Deployment-specific configuration and historical working notes are kept outside Git.
Analytics is optional and configured at build time; a fresh clone sends no analytics.

## Motion refinement — 29 October 2026

Application revision `71604ac` is released. Freestyle now gives at least nine
real pin strikes across seven distinct pins. Escaped launches are rejected; no
perimeter rebound is invented. Departures point toward the inlet, and the metal guide rails have
clearance for the full sphere and stop before the rolled mouth. The obsolete
perimeter rails have been removed. Ball spin preserves angular momentum across
normal impacts; both stars rotate on continuous clocks.

Movie retains its authored collision route and recognizable shots while
reconstructing continuous movement from the film's duplicated exposures. Its
camera rail, coil progression and final flight no longer reproduce the capture's
short stops and speed pulses. The close-up composition tests allow the intended
smoothing; physical clearance, full-ball framing and acceleration remain guarded.
Freestyle traverses the powered coil in 1.2 seconds with matched entry/exit speed.

The build, 25 geometry/motion/composition checks and 16 browser scenarios
covering playback, modes, sound and accessibility pass. The route sampler
completed 1,000 launches; a separate 300-run comparison measured 9–24 contacts
(mean 18.6), with every pin-free field leg under
one second. Tests check the actual rail and tube triangles, both mirrored routes,
full-ball framing, spin continuity, real playback, independent answers and seeks.
Candidate and public HTTPS checks each passed all eight mode/route/answer
combinations, with PAUSE and SHOW ANSWER absent throughout playback. Desktop and
mobile playing-state screenshots were reviewed; shipped assets match the tested
build. Full-journey 30 fps captures are retained privately for both modes and
routes, with browser playback, pause, seek and quarter-speed checks. All 41
original reference files still match their manifest. The
[full CI](https://github.com/Terro216/major-decision/actions/runs/40948150947)
is still running at this release handoff. These checks do not constitute
physical-device or user visual acceptance.

## Playback controls — 29 October 2026

Ordinary playback runs to its answer without PAUSE or SHOW ANSWER buttons.
NEW QUESTION cancels a run; reduced motion and background-tab handling remain
available. Diagnostic review controls are retained for deterministic comparisons.
Application revision `97dcbb4` is released. The build and all three affected
interaction tests pass. Candidate and public HTTPS browser checks each passed
all eight mode/route/answer combinations, including the absence of the removed
controls throughout playback, Cyrillic input, WebGL, sound and reset. Desktop
and mobile playing-state screenshots were reviewed; shipped assets match the
tested build. The [full CI](https://github.com/Terro216/major-decision/actions/runs/40931650127)
for this revision passed all 79 scenarios.

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
baseline; it and both real Movie journeys pass with the correction. The
[complete 79-scenario CI](https://github.com/Terro216/major-decision/actions/runs/40630479046)
passed for application revision `29ce5de`. This camera verification did not
include a deployment, physical-device frame rate or user visual acceptance.

## Verification — 27 October 2026

The [full browser CI](https://github.com/Terro216/major-decision/actions/runs/40437954869)
passed all 77 scenarios in 35.7 minutes. Its 68 build inputs match the
application and browser tests at that revision. Both Docker configuration variants build and pass
nginx validation. Three analytics scenarios and five CSP configuration cases pass.

The public history was rewritten and checked from a fresh clone. Previous workflow
records were archived privately and removed from Actions. New public logs and the
build artifact were checked for the known private identifiers.

The [history guard CI](https://github.com/Terro216/major-decision/actions/runs/40440101863)
passed its three regression checks and scanned the current files and reachable
history, including a disclosure removed only from the latest commit. Documentation and privacy-check
changes do not repeat an unchanged browser suite. No application deployment or
new visual acceptance is claimed by this maintenance pass.
