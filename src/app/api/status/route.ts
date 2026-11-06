import { vaultStatus } from "@/lib/chain";
import { VENDORS, explorerAccount, network, state } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await vaultStatus();
  return Response.json({
    network,
    ...s,
    vendors: VENDORS.map(({ name, address }) => ({ name, address })),
    accounts: Object.fromEntries(
      ["multisig", "vault", "spendingLimit", "mint", "agent", "owner"].map((k) => [
        k, { address: state[k], explorer: explorerAccount(state[k]) },
      ]),
    ),
  });
}
