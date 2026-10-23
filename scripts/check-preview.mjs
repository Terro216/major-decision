import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const base = process.env.MD_PREVIEW_URL || 'http://127.0.0.1:4175';
const review = path.resolve(process.env.MD_CHECK_DIR || '.review');
const dist = path.join(review, 'dist');
const sha = data => createHash('sha256').update(data).digest('hex');
const built = readFileSync(path.join(dist, 'index.html'));
const response = await fetch(base + '/');
assert.equal(response.status, 200);
const live = Buffer.from(await response.arrayBuffer());
assert.equal(sha(live), sha(built), 'Preview must serve the checked build');
const urls = [...live.toString().matchAll(/(?:src|href)="(\/[^"#]+)"/g)].map(match => match[1]);
urls.push('/fonts/DecisionQuestion-Bold.woff2', '/fonts/LiberationSerif-Bold.woff2');
const assets = [];
for (const url of urls) {
  const result = await fetch(base + url);
  assert.equal(result.status, 200, url);
  const bytes = Buffer.from(await result.arrayBuffer());
  assert.equal(sha(bytes), sha(readFileSync(dist + url)), url);
  assets.push({ url, status: result.status, bytes: bytes.length });
}
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(dir + '/' + entry.name) : [dir + '/' + entry.name]);
assert.equal(files(dist).some(name => /\.(?:mp4|webm|png)$|references\/|\/\.review\//.test(path.relative(dist, name))), false);
const report = { checkedAt: new Date().toISOString(), preview: base, indexSha256: sha(live), assets, referenceMediaInBuild: false };
writeFileSync(path.join(review, 'preview-check.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
