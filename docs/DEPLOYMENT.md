# Deployment

The application is a static Vite build. It needs no database, accounts or persistent
question storage. The Docker image serves the build through nginx on port 8080.

Use the configured build host. Copy .env.example to .env and set the existing
reverse-proxy network. The supplied Compose file integrates with Caddy. Adapt the
public domain for your installation. Do not commit local environment files.

Analytics is disabled unless both VITE_METRICS_SITE_HOST and
VITE_METRICS_SCRIPT_URL are configured. The script URL must use HTTPS without
credentials. These values are public in the resulting browser bundle and CSP;
they are not secrets. Compose passes them as build arguments. For a Vite-only build,
use .env.local. The question, answer, query string and hash are not sent to analytics.

Build and test an image before switching the web service. Preserve the previous
image for rollback, then update only this project's service. Check health, HTTPS,
security headers, assets and browser behavior after the switch. Avoid restarting
shared infrastructure for a single-site update.

The image excludes film references, development reports, source history and local
configuration. Recovery consists of rebuilding a known source revision and supplying
the installation's private configuration. Store release-specific records privately.
