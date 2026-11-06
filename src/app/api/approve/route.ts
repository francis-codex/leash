import * as multisig from "@sqds/multisig";
import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { addr, connection, explorerTx, feesKey, state } from "@/lib/config";
import { allow } from "@/lib/store";

export const runtime = "nodejs";

/**
 * step "build": the fee wallet builds + signs approve/execute (or reject) for the owner.
 * step "send": relays the owner-signed tx. The fee wallet only ever signs owner-only
 * instructions, so a non-owner gets a tx the program refuses.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!(await allow("approve", 60, 3600))) return Response.json({ error: "slow down" }, { status: 429 });

  if (body?.step === "send") {
    const tx = VersionedTransaction.deserialize(Buffer.from(String(body.tx), "base64"));
    if (!tx.message.staticAccountKeys[0].equals(feesKey().publicKey)) {
      return Response.json({ error: "not a leash approval" }, { status: 400 });
    }
    try {
      const sig = await connection.sendTransaction(tx);
      return Response.json({ signature: sig, explorer: explorerTx(sig) });
    } catch (e) {
      const logs: string[] = (e as { logs?: string[] }).logs ?? [];
      const code = logs.map((l) => l.match(/Error Code: (\w+)/)?.[1]).find(Boolean);
      return Response.json({ error: code ?? "the network rejected it" }, { status: 400 });
    }
  }

  const owner = new PublicKey(String(body?.owner ?? ""));
  if (owner.toBase58() !== state.owner) {
    return Response.json({ error: "this wallet isn't the owner" }, { status: 403 });
  }
  const transactionIndex = BigInt(Number(body?.index));
  const multisigPda = addr("multisig");
  const fees = feesKey();
  const ixs = [];
  let lookupTables: Awaited<ReturnType<typeof multisig.instructions.vaultTransactionExecute>>["lookupTableAccounts"] = [];
  if (body?.action === "reject") {
    ixs.push(multisig.instructions.proposalReject({ multisigPda, transactionIndex, member: owner }));
  } else {
    ixs.push(multisig.instructions.proposalApprove({ multisigPda, transactionIndex, member: owner }));
    const ex = await multisig.instructions.vaultTransactionExecute({ connection, multisigPda, transactionIndex, member: owner });
    ixs.push(ex.instruction);
    lookupTables = ex.lookupTableAccounts;
  }
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = new VersionedTransaction(
    new TransactionMessage({ payerKey: fees.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(lookupTables),
  );
  tx.sign([fees]);
  return Response.json({ tx: Buffer.from(tx.serialize()).toString("base64") });
}
