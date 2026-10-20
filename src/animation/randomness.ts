import type { Outcome } from './mechanism';

export type RandomMode = 'local' | 'external';
export const RANDOM_POOL_SIZE = 16;
export const RANDOM_TIMEOUT_MS = 120_000;
const base = 'https://www.random.org';
const quotaURL = `${base}/quota/?format=plain`;
const numbersURL = `${base}/integers/?num=${RANDOM_POOL_SIZE}&min=0&max=255&col=1&base=10&format=plain&rnd=new`;
const cooldown = 10 * 60_000;
let quotaCheckedAt = -Infinity, blockedUntil = 0, busy = false;

export const localOutcome = (): Outcome => (crypto.getRandomValues(new Uint8Array(1))[0] & 1) ? 'yes' : 'no';

// No question, URL state, identifier or cookie enters this API. The pool is
// fresh atmospheric-noise randomness; Math.random selects one of its 16 bytes.
// This selection and the independent WebCrypto camera draw never share a seed.
export async function externalOutcome(signal: AbortSignal): Promise<Outcome> {
  signal.throwIfAborted();
  if (Date.now() < blockedUntil) throw new Error('RANDOM.ORG quota unavailable. Try again in 10 minutes or choose LOCAL.');
  if (busy) throw new Error('A random-number request is already finishing. Please retry.');
  busy = true;
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  // RANDOM.ORG asks clients to allow at least two minutes, batch numbers,
  // serialize requests and periodically check the free IP-based quota.
  const timeout = setTimeout(() => controller.abort(new DOMException('Random-number request timed out. Please retry or choose LOCAL.', 'TimeoutError')), RANDOM_TIMEOUT_MS);
  const read = async (url: string) => {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error' });
    if (!response.ok) {
      if (response.status === 429 || response.status === 503) blockedUntil = Date.now() + cooldown;
      throw new Error('RANDOM.ORG is unavailable. Please try later or choose LOCAL.');
    }
    const text = (await response.text()).trim();
    if (text.length > 1024) throw new Error('RANDOM.ORG returned an invalid response. Please retry or choose LOCAL.');
    return text;
  };
  try {
    if (Date.now() - quotaCheckedAt >= cooldown) {
      const quota = await read(quotaURL);
      if (!/^-?\d+$/.test(quota) || !Number.isSafeInteger(Number(quota))) throw new Error('RANDOM.ORG returned an invalid quota. Please retry or choose LOCAL.');
      if (Number(quota) < 0) {
        blockedUntil = Date.now() + cooldown;
        throw new Error('RANDOM.ORG quota exhausted. Try again in 10 minutes or choose LOCAL.');
      }
      quotaCheckedAt = Date.now();
    }
    const text = await read(numbersURL);
    const values = text.split(/\s+/);
    if (values.length !== RANDOM_POOL_SIZE || values.some(value => !/^\d{1,3}$/.test(value) || Number(value) > 255)) {
      throw new Error('RANDOM.ORG returned invalid numbers. Please retry or choose LOCAL.');
    }
    controller.signal.throwIfAborted();
    const selected = Number(values[Math.floor(Math.random() * values.length)]);
    return (selected & 1) ? 'yes' : 'no';
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error instanceof TypeError) throw new Error('Cannot reach RANDOM.ORG. Check your connection, retry or choose LOCAL.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
    busy = false;
  }
}
