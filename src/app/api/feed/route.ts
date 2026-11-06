import { counts, feed } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [items, c] = await Promise.all([feed(20), counts()]);
  return Response.json({
    counts: c,
    items: items.map(({ id, createdAt, invoice, outcome, txs }) => ({
      id, createdAt, outcome, txs, invoice: invoice.slice(0, 140),
    })),
  });
}
