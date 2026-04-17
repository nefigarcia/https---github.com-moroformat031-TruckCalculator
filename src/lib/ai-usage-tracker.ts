import { createClient } from 'redis';

const RPD_LIMIT = 20;
const REDIS_KEY = 'gemini_rpd';

function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

async function withRedis<T>(fn: (client: ReturnType<typeof createClient>) => Promise<T>): Promise<T> {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

interface StoredUsage {
  date: string;
  count: number;
}

export async function getAiUsage() {
  return withRedis(async (client) => {
    const today = getTodayString();
    const raw = await client.get(REDIS_KEY);
    let count = 0;
    if (raw) {
      const data: StoredUsage = JSON.parse(raw);
      if (data.date === today) count = data.count;
    }
    return { date: today, count, remaining: Math.max(0, RPD_LIMIT - count), limit: RPD_LIMIT };
  });
}

export async function incrementAiUsage() {
  return withRedis(async (client) => {
    const today = getTodayString();
    const raw = await client.get(REDIS_KEY);
    let count = 0;
    if (raw) {
      const data: StoredUsage = JSON.parse(raw);
      if (data.date === today) count = data.count;
    }
    count += 1;
    await client.set(REDIS_KEY, JSON.stringify({ date: today, count }));
    return { date: today, count, remaining: Math.max(0, RPD_LIMIT - count), limit: RPD_LIMIT };
  });
}
