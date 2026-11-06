import { pendingProposals } from "@/lib/chain";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ proposals: await pendingProposals() });
}
