/** TTL付きメモリキャッシュ（同一条件の再検索でAPI消費を抑える） */

export interface Cache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  clear(): void;
  size(): number;
}

/** キャッシュの実体を生成する（TTLで自動失効） */
export function createCache<T>(ttlMs = 60_000, now: () => number = () => Date.now()): Cache<T> {
  const store = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expiresAt) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: now() + ttlMs });
    },
    has(key) {
      return this.get(key) !== undefined;
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}

/** オブジェクトのキー順に依存しない安定した文字列化 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** 検索条件からキャッシュキーを作る */
export function cacheKeyFor(params: unknown): string {
  return stableStringify(params);
}
