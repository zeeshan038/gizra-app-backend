import { createClient, type RedisClientType } from 'redis';

type MemoryEntry = { value: string; expiresAt: number };

const memoryStore = new Map<string, MemoryEntry>();

let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<RedisClientType | null> | null = null;
let redisDisabled = false;

async function connectRedis(): Promise<RedisClientType | null> {
  if (redisDisabled) return null;
  if (redisClient?.isOpen) return redisClient;

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    return null;
  }

  if (!redisConnectPromise) {
    redisConnectPromise = (async () => {
      try {
        const client = createClient({ url }) as RedisClientType;
        client.on('error', (err) => {
          console.warn('[redis] client error', err instanceof Error ? err.message : err);
        });
        await client.connect();
        redisClient = client;
        return client;
      } catch (err) {
        console.warn(
          '[redis] connect failed; using in-memory cache fallback',
          err instanceof Error ? err.message : err
        );
        redisDisabled = true;
        redisClient = null;
        return null;
      } finally {
        redisConnectPromise = null;
      }
    })();
  }

  return redisConnectPromise;
}

function memoryGet(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key: string, value: string, ttlSeconds: number): void {
  const ttlMs = Math.max(1, Math.floor(ttlSeconds)) * 1000;
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Best-effort get: Redis when available, else process memory (same TTL semantics). */
export async function redisGet(key: string): Promise<string | null> {
  const client = await connectRedis();
  if (client) {
    try {
      return await client.get(key);
    } catch (err) {
      console.warn('[redis] get failed', err instanceof Error ? err.message : err);
    }
  }
  return memoryGet(key);
}

/** Best-effort set with TTL seconds. */
export async function redisSetEx(key: string, ttlSeconds: number, value: string): Promise<void> {
  memorySet(key, value, ttlSeconds);
  const client = await connectRedis();
  if (!client) return;
  try {
    await client.setEx(key, Math.max(1, Math.floor(ttlSeconds)), value);
  } catch (err) {
    console.warn('[redis] setEx failed', err instanceof Error ? err.message : err);
  }
}

/** Test helper — clear in-memory fallback only. */
export function resetRedisMemoryStoreForTests(): void {
  memoryStore.clear();
}
