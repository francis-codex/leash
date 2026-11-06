import { randomBytes } from "node:crypto";
import { hasModel, runAgent, type AgentEvent } from "@/lib/agent";
import { allow, saveAttempt } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_INVOICE = 1500;

export async function POST(req: Request) {
  if (!hasModel()) return Response.json({ error: "the agent is offline (no model key)" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { invoice?: string; preset?: string } | null;
  const invoice = body?.invoice?.trim() ?? "";
  if (!invoice) return Response.json({ error: "write an invoice first" }, { status: 400 });
  if (invoice.length > MAX_INVOICE) {
    return Response.json({ error: `keep it under ${MAX_INVOICE} characters` }, { status: 400 });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const perIp = Number(process.env.LEASH_LIMIT_IP_HOUR ?? 3);
  const perDay = Number(process.env.LEASH_LIMIT_DAY ?? 300);
  if (!(await allow(`ip:${ip}`, perIp, 3600))) {
    return Response.json({ error: `${perIp} tries an hour per person. come back soon.` }, { status: 429 });
  }
  if (!(await allow("global", perDay, 86400))) {
    return Response.json({ error: "the arena is resting. back tomorrow." }, { status: 429 });
  }

  const id = randomBytes(5).toString("hex");
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        const attempt = await runAgent(invoice, id, emit);
        attempt.preset = body?.preset;
        await saveAttempt(attempt);
        emit({ t: "done", attempt });
      } catch (err) {
        console.error("attempt failed", id, err);
        emit({ t: "error", message: "the agent hit an error. try again." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" },
  });
}
