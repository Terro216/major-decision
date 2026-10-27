import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const [operation, root, artifacts, status, ...selection] = process.argv.slice(2);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = dir => readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
if (operation === 'inputs') {
  const names = ['package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','playwright.config.ts',...files('src'),...files('public'),...files('tests')].sort();
  const inputs = Object.fromEntries(names.map(name => [name, hash(readFileSync(path.join(root, name)))]));
  writeFileSync(path.join(artifacts, 'build-inputs.json'), JSON.stringify({ files: inputs, sourceSha256: hash(JSON.stringify(inputs)) }, null, 2));
} else {
  const inputs = JSON.parse(readFileSync(path.join(artifacts, 'build-inputs.json')));
  writeFileSync(path.join(artifacts, 'check-result.json'), JSON.stringify({ checkedAt: new Date().toISOString(), execution: 'isolated', testExit: Number(status), selection: selection.length ? selection : ['all'], sourceSha256: inputs.sourceSha256, indexSha256: hash(readFileSync(path.join(root,'dist/index.html'))) }, null, 2));
}
