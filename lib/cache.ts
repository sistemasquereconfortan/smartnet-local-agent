import NodeCache from 'node-cache';

const ttlSeconds = Number(process.env.CACHE_TTL_SECONDS) || 15;

// Singleton cache instance across hot-reloads in Next.js dev mode
const globalForCache = global as unknown as { cacheInstance: NodeCache };

export const cache = globalForCache.cacheInstance || new NodeCache({ stdTTL: ttlSeconds, checkperiod: 30 });

if (process.env.NODE_ENV !== 'production') globalForCache.cacheInstance = cache;

export default cache;
