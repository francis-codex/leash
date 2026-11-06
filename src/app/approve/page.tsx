import { pendingProposals } from "@/lib/chain";
import { state } from "@/lib/config";
import { Approve } from "./approve";

export const dynamic = "force-dynamic";
export const metadata = { title: "owner · leash" };

export default async function ApprovePage() {
  const proposals = await pendingProposals();
  const rpc = process.env.NEXT_PUBLIC_LEASH_RPC ?? `https://api.${state.network ?? "devnet"}.solana.com`;
  return <Approve initial={proposals} owner={state.owner} rpc={rpc} />;
}
