import { Cache, Milliseconds } from './caching';

export type MultiCache = Omit<Cache, 'store'> & {
  mset(args: [string, unknown][], ttl?: Milliseconds): Promise<void>;
  mget(...args: string[]): Promise<unknown[]>;
  mdel(...args: string[]): Promise<void>;
};

/**
 * Module that lets you specify a hierarchy of caches.
 */
export function multiCaching<Caches extends Cache[]>(
  caches: Caches,
): MultiCache {
  const get = async <T>(key: string) => {
    for (const cache of caches) {
      try {
        const val = await cache.get<T>(key);
        if (val !== undefined) return val;
      } catch (e) {}
    }
  };
  const set = async <T>(
    key: string,
    data: T,
    ttl?: Milliseconds | undefined,
  ) => {
    await Promise.all(caches.map((cache) => cache.set(key, data, ttl)));
  };
  return {
    get,
    set,
    del: async (key) => {
      await Promise.all(caches.map((cache) => cache.del(key)));
    },
    async wrap<T>(
      key: string,
      fn: () => Promise<T>,
      ttl?: Milliseconds,
    ): Promise<T> {
      let value: T | undefined;
      let i = 0;
      for (; i < caches.length; i++) {
        try {
          value = await caches[i].get<T>(key);
          if (value !== undefined) break;
        } catch (e) {}
      }
      if (value === undefined) {
        const result = await fn();
        await set<T>(key, result, ttl);
        return result;
      } else {
        await Promise.all(
          caches.slice(0, i).map((cache) => cache.set(key, value, ttl)),
        );
      }
      return value;
    },
    reset: async () => {
      await Promise.all(caches.map((x) => x.reset()));
    },
    mget: async (...keys: string[]) => {
      const values = new Array(keys.length).fill(undefined);
      for (const cache of caches) {
        if (values.every((x) => x !== undefined)) break;
        try {
          const val = await cache.store.mget(...keys);
          val.forEach((v, i) => {
            if (values[i] === undefined && v !== undefined) values[i] = v;
          });
        } catch (e) {}
      }
      return values;
    },
    mset: async (args: [string, unknown][], ttl?: Milliseconds) => {
      await Promise.all(caches.map((cache) => cache.store.mset(args, ttl)));
    },
    mdel: async (...keys: string[]) => {
      await Promise.all(caches.map((cache) => cache.store.mdel(...keys)));
    },
  };
}
