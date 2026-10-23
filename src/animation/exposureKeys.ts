// Repeated filmed exposures describe one observed pose, not a physical stop.
// Keep the observations, but interpolate through the centre of each exposure
// group so live motion never waits for the next photographed frame.
export function exposureKeys(keys: readonly (readonly number[])[], equal: (a: readonly number[], b: readonly number[]) => boolean = (a, b) => a.slice(1).every((v, i) => Math.abs(v - b[i + 1]) < 1e-8)): [number, ...number[]][] {
  const result: [number, ...number[]][] = [];
  for (let start = 0; start < keys.length;) {
    let end = start;
    while (end + 1 < keys.length && equal(keys[start], keys[end + 1])) end++;
    result.push([(keys[start][0] + keys[end][0]) / 2, ...keys[start].slice(1)]);
    start = end + 1;
  }
  return result;
}
