type MetricsPayload = { u?: string; r?: string | null; p?: { url?: string } };
type Plausible = ((...args: unknown[]) => void) & { q?: unknown[][]; init?: (options: unknown) => void; o?: unknown };
declare global { interface Window { __siteMetricsLoaded?: boolean; plausible?: Plausible } }

// Public page counts only. Never send form values, query strings or room codes.
export function installMetrics(host: string | undefined, scriptUrl: string | undefined) {
  if (!host || !scriptUrl || location.hostname !== host || window.__siteMetricsLoaded) return;
  let source: URL;
  try { source = new URL(scriptUrl); } catch { return; }
  if (source.protocol !== 'https:' || source.username || source.password) return;
  window.__siteMetricsLoaded = true;

  function redactedUrl(value: string) {
    const url = new URL(value, location.origin);
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    url.pathname = url.pathname.replace(/^\/room\/[^/]+/, "/room/:code");
    return url;
  }

  const plausible = window.plausible = window.plausible || function (...args: unknown[]) {
    (plausible.q = plausible.q || []).push(args);
  } as Plausible;
  plausible.init = plausible.init || function (options: unknown) { plausible.o = options || {}; };
  plausible.init({
    transformRequest(payload: MetricsPayload) {
      const url = redactedUrl(payload.u || location.href);
      url.host = host;
      url.protocol = "https:";
      payload.u = url.href;
      payload.r = document.referrer ? new URL(document.referrer).origin : null;
      if (payload.p && typeof payload.p.url === "string") {
        payload.p.url = redactedUrl(payload.p.url).href;
      }
      return payload;
    },
  });
  const script = document.createElement("script");
  script.async = true;
  script.referrerPolicy = "no-referrer";
  script.src = source.href;
  document.head.appendChild(script);
}
