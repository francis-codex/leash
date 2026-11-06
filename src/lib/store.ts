import "server-only";
import { Redis } from "@upstash/redis";

export type Outcome = "agent_refused" | "wallet_refused" | "escalated" | "paid_vendor" | "error";

export type Step =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: unknown; output?: unknown };

export type Attempt = {
  id: string;
  createdAt: number;
  invoice: string;
  preset?: string;
  steps: Step[];
  outcome: Outcome;
  txs: { label: string; explorer: string; error?: string }[];
};

// Upstash when configured (deployed), process memory otherwise (local dev).
const redis =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
    ? new Redis({
        url: (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)!,
        token: (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)!,
      })
    : null;

type Mem = { attempts: Map<string, Attempt>; feed: string[]; counts: Record<string, number>; hits: Map<string, number> };
const g = globalThis as unknown as { __leash?: Mem };
const mem: Mem = (g.__leash ??= { attempts: new Map(), feed: [], counts: {}, hits: new Map() });

export async function saveAttempt(a: Attempt) {
  if (redis) {
    await Promise.all([
      redis.set(`attempt:${a.id}`, a),
      redis.lpush("feed", a.id).then(() => redis.ltrim("feed", 0, 499)),
      redis.incr(`count:${a.outcome}`),
    ]);
    return;
  }
  mem.attempts.set(a.id, a);
  mem.feed.unshift(a.id);
  mem.feed.length = Math.min(mem.feed.length, 500);
  mem.counts[a.outcome] = (mem.counts[a.outcome] ?? 0) + 1;
}

export async function getAttempt(id: string): Promise<Attempt | null> {
  if (redis) return redis.get<Attempt>(`attempt:${id}`);
  return mem.attempts.get(id) ?? null;
}

export async function feed(limit = 20): Promise<Attempt[]> {
  const ids = redis ? await redis.lrange<string>("feed", 0, limit - 1) : mem.feed.slice(0, limit);
  const all = await Promise.all(ids.map(getAttempt));
  return all.filter((a): a is Attempt => !!a);
}

export async function counts(): Promise<Record<Outcome, number>> {
  const keys: Outcome[] = ["agent_refused", "wallet_refused", "escalated", "paid_vendor", "error"];
  if (redis) {
    const vals = await redis.mget<(number | null)[]>(...keys.map((k) => `count:${k}`));
    return Object.fromEntries(keys.map((k, i) => [k, Number(vals[i] ?? 0)])) as Record<Outcome, number>;
  }
  return Object.fromEntries(keys.map((k) => [k, mem.counts[k] ?? 0])) as Record<Outcome, number>;
}

/** Fixed-window counter. Returns true while under the limit. */
export async function allow(key: string, limit: number, windowSec: number): Promise<boolean> {
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  if (redis) {
    const n = await redis.incr(bucket);
    if (n === 1) await redis.expire(bucket, windowSec);
    return n <= limit;
  }
  const n = (mem.hits.get(bucket) ?? 0) + 1;
  mem.hits.set(bucket, n);
  return n <= limit;
}
