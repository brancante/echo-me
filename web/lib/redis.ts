import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
  }
  return redis;
}

export async function pushJob(queue: string, jobId: string) {
  const client = getRedis();
  await client.rpush(queue, jobId);
}

export async function popJob(queue: string): Promise<string | null> {
  const client = getRedis();
  return await client.lpop(queue);
}
