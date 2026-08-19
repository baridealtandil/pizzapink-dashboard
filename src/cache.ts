import { isPastRange } from "./utils/dates";

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();

const TEN_MINUTES = 10 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, forceRefresh = false): Promise<T> {
  const hit = store.get(key);
  if (!forceRefresh && hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

// Períodos totalmente cerrados (hasta < hoy) se cachean por un día entero: los datos no cambian.
// Si el rango toca el día de hoy, O si el query es parcial por recorte horario (isPartial=true),
// la cache corta (10 min).
export function cachedRange<T>(key: string, hasta: string, fn: () => Promise<T>, forceRefresh = false, isPartial = false): Promise<T> {
  const ttl = (!isPartial && isPastRange(hasta)) ? ONE_DAY : TEN_MINUTES;
  return cached(key, ttl, fn, forceRefresh);
}

export function cachedLive<T>(key: string, fn: () => Promise<T>, forceRefresh = false): Promise<T> {
  return cached(key, TEN_MINUTES, fn, forceRefresh);
}
