import { createClient, RedisClientType } from "redis";
import "@std/dotenv";

// Prioritize a full connection URL if provided
const redisUrl = Deno.env.get("REDIS_URL") || (() => {
  const redisHost = Deno.env.get("REDIS_HOST") || "localhost";
  const redisPort = Deno.env.get("REDIS_PORT") || 6379;
  const redisPass = Deno.env.get("REDIS_PASSWORD");
  const redisUser = Deno.env.get("REDIS_USER") || "default";

  if (redisPass) {
    return `redis://${redisUser}:${redisPass}@${redisHost}:${redisPort}`;
  }
  return `redis://${redisHost}:${redisPort}`;
})();

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