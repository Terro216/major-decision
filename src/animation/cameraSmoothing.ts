// Reconstruct a live camera move from photographed exposures. A symmetric
// window removes capture holds without introducing playback lag; a cubic
// B-spline makes the baked rail C2, including arbitrary backward seeks.
export function smoothCamera(sample: (time: number) => number[], duration: number, radius = .28) {
  const hz = 120, count = Math.ceil(duration * hz), window = Math.ceil(radius * hz);
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const weights = Array.from({ length: 2 * window + 1 }, (_, i) => (1 + Math.cos(Math.PI * (i - window) / (window + 1))) ** 2);
  const total = weights.reduce((a, b) => a + b, 0);
  const source = Array.from({ length: count + 2 * window + 1 }, (_, i) => sample(clamp((i - window) / hz, 0, duration)));
  const samples = Array.from({ length: count + 1 }, (_, i) => source[i].map((_, channel) =>
    weights.reduce((sum, weight, j) => sum + weight * source[i + j][channel], 0) / total));
  const first = sample(0), last = sample(duration);
  const ease = (v: number) => { const u = clamp(v, 0, 1); return u ** 3 * (10 + u * (-15 + 6 * u)); };
  return (time: number) => {
    const t = clamp(time, 0, duration), value = t * hz, index = Math.floor(value), u = value - index;
    const basis = [(1-u)**3, 3*u**3-6*u*u+4, -3*u**3+3*u*u+3*u+1, u**3];
    const opening = ease(t / .22), ending = ease((t - (duration - .30)) / .20);
    return first.map((start, channel) => {
      const value = basis.reduce((sum, weight, i) => sum + weight * samples[clamp(index + i - 1, 0, count)][channel] / 6, 0);
      return (start + (value - start) * opening) * (1 - ending) + last[channel] * ending;
    });
  };
}
