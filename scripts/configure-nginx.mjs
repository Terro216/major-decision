import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: configure-nginx.mjs INPUT OUTPUT');
const script = process.env.VITE_METRICS_SCRIPT_URL;
const host = process.env.VITE_METRICS_SITE_HOST;
if (Boolean(script) !== Boolean(host)) throw new Error('Configure both metrics variables or neither');
let origin = '';
if (script && host) {
  const url = new URL(script);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Metrics script must use an HTTPS URL without credentials');
  }
  origin = url.origin;
}
writeFileSync(output, readFileSync(input, 'utf8').replaceAll('__METRICS_ORIGIN__', origin));
