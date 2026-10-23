export function bernsteinAt(controls: readonly number[], u: number): number {
  const work = [...controls];
  for (let size = work.length - 1; size > 0; size--)
    for (let i = 0; i < size; i++) work[i] += (work[i + 1] - work[i]) * u;
  return work[0];
}

// Subdivision tightens the convex-hull bound without sampling or losing its
// guarantee between sample points. Used by both C2 timing profiles.
export function bernsteinSplit(controls: readonly number[]): [number[], number[]] {
  const work = [...controls], left = [work[0]], right = [work.at(-1)!];
  for (let size = work.length - 1; size > 0; size--) {
    for (let i = 0; i < size; i++) work[i] = (work[i] + work[i + 1]) / 2;
    left.push(work[0]); right.unshift(work[size - 1]);
  }
  return [left,right];
}
export function bernsteinUpperBound(controls: readonly number[], depth = 5): number {
  if (!depth) return Math.max(...controls);
  const [left,right]=bernsteinSplit(controls);
  return Math.max(bernsteinUpperBound(left, depth - 1), bernsteinUpperBound(right, depth - 1));
}
