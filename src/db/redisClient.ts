import { createClient, RedisClientType } from "redis";
import "@std/dotenv";

// The redis npm library prefers a URL format.
// For Docker, the host is the service name ('redis'). For local dev, it's 'localhost'.
const redisHost = Deno.env.get("REDIS_HOST") || "localhost";
const redisPort = Deno.env.get("REDIS_PORT") || 6379;
const redisUrl = `redis://${redisHost}:${redisPort}`;

let redisClient: RedisClientType;

/**
 * Initializes the connection to Redis. This should be called once during application startup.
 */
export async function initializeRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    return;
  }
  try {
    redisClient = createClient({
      url: redisUrl,
    });

    redisClient.on('error', (err) => console.error('Redis Client Error', err));

    await redisClient.connect();
    console.log(`Successfully connected to Redis at ${redisUrl}!`);
  } catch (err) {
    console.error(`Failed to initialize Redis connection at ${redisUrl}:`, err);
    throw err; // Re-throw to fail fast if Redis is essential
  }
}

/**
 * Returns the singleton Redis client instance. Throws an error if initializeRedis() has not been called.
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error("Redis client has not been initialized. Call initializeRedis() first.");
  }
  return redisClient;
}