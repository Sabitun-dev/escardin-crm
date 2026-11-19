// Loading data with a small memory cache: going back shows the last screen at once, then refreshes it.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, get } from "./api";

const cache = new Map<string, unknown>();
const listeners = new Set<(key: string) => void>();

/** Marks cached data as old (after a change), so screens using it reload. */
export function invalidate(prefix = "") {
  for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k);
  for (const l of listeners) l(prefix);
}

export function peek<T>(key: string): T | undefined {
  return cache.get(key) as T | undefined;
}

export function useData<T>(path: string | null) {
  const [data, setData] = useState<T | undefined>(() => (path ? (cache.get(path) as T | undefined) : undefined));
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setLoading(true);
    try {
      const d = await get<T>(path);
      cache.set(path, d);
      if (n === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (n === seq.current) setError(e instanceof ApiError ? e : new ApiError(0, "network"));
    } finally {
      if (n === seq.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setData(path ? (cache.get(path) as T | undefined) : undefined);
    load();
  }, [path, load]);

  useEffect(() => {
    if (!path) return;
    const l = (prefix: string) => path.startsWith(prefix) && load();
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [path, load]);

  /** Change the shown data at once (optimistic update). */
  const mutate = useCallback(
    (fn: (d: T) => T) => {
      setData((d) => {
        if (d === undefined) return d;
        const next = fn(d);
        if (path) cache.set(path, next);
        return next;
      });
    },
    [path],
  );

  return { data, error, loading, reload: load, mutate };
}
