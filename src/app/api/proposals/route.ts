import { pendingProposals, resumeStranded, strandedTransactions } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET() {
  const [proposals, stranded] = await Promise.all([pendingProposals(), strandedTransactions()]);
  return Response.json({ proposals, stranded });
}

/**
 * Finishes any payment request whose second step never landed. It only opens proposals for
 * transactions the agent already created, and each still needs the owner to approve, so it
 * moves no money and is safe to call twice.
 */
export async function POST() {
  return Response.json({ resumed: await resumeStranded() });
}
