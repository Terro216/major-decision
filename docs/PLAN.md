# Project plan

Recreate the film's decision machine while keeping it usable on desktop and mobile.

Implemented: SVG/CSS shell, live Movie and Freestyle scenes, independent answer
selection, Cyrillic input, optional sound, pause/skip, reduced motion, keyboard
accessibility and a fallback when WebGL is unavailable.

Future visual changes should start from film evidence and preserve a before/after
comparison. Maintain deterministic seeking, collision clearance, answer independence
and the full usable case. Check both routes with both answers in each mode.

Build and browser automation belong on the configured build host. See
[CI](CI.md) and [deployment](DEPLOYMENT.md) for portable setup information.
