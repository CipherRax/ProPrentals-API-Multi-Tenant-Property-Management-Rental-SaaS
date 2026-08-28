export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: Record<string, never>;
}

// BullMQ/ioredis want structured connection options rather than a bare
// URL string in NestJS's BullModule config — parse REDIS_URL once here
// instead of repeating this in every module that needs a queue.
export function parseRedisUrl(redisUrl: string): RedisConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 6379,
    password: url.password || undefined,
    username: url.username || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}
