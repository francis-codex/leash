import * as multisig from "@sqds/multisig";
import { PublicKey, TransactionMessage } from "@solana/web3.js";
import { createTransferCheckedInstruction } from "@solana/spl-token";
import { connection, kp, pk, readState, writeState, explorer, simulateThenSend, parseSquadsError, errName } from "./common";

const s = readState();
const fees = kp("fees");
const owner = kp("owner");
const agent = kp("agent");
const multisigPda = pk(s, "multisig");
const mint = pk(s, "mint");

async function agentPay(to: PublicKey, usd: number, memo: string) {
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = multisig.transactions.spendingLimitUse({
    blockhash,
    feePayer: fees.publicKey,
    multisigPda,
    member: agent.publicKey,
    spendingLimit: pk(s, "spendingLimit"),
    mint,
    vaultIndex: 0,
    amount: Math.round(usd * 1e6),
    decimals: 6,
    destination: to,
    memo,
  });
  tx.sign([fees, agent]);
  return simulateThenSend(tx);
}

async function trySend(label: string, fn: () => Promise<string>) {
  try {
    const sig = await fn();
    await connection.confirmTransaction(sig, "confirmed");
    return { ok: true, sig };
  } catch (e: any) {
    const logs: string[] = e?.logs ?? e?.transactionLogs ?? [];
    return { ok: false, error: parseSquadsError(logs) ?? errName(e) ?? String(e?.message ?? e).slice(0, 600) + " LOGS:" + logs.slice(-6).join(" | "), label };
  }
}

async function main() {
  const out: Record<string, unknown> = {};

  const only = process.argv[2]; // "escalate" to run step 4 alone
  if (only !== "escalate") {
  // 1. allowlisted vendor, under cap -> pays
  const r1 = await agentPay(pk(s, "vendor-1"), 0.1, "prove:allowlisted");
  out.allowlisted = r1;
  console.log("1 allowlisted pay   ", r1.ok ? "PAID" : r1.error, r1.sig && explorer(r1.sig));

  // 2. off-list destination -> InvalidDestination, landed on-chain
  const r2 = await agentPay(pk(s, "decoy-1"), 0.1, "prove:offlist");
  out.offlist = r2;
  console.log("2 off-list pay      ", r2.ok ? "PAID (BAD)" : r2.error, r2.sig && explorer(r2.sig));

  // 3. allowlisted but over the daily cap -> SpendingLimitExceeded
  const r3 = await agentPay(pk(s, "vendor-2"), 1.5, "prove:overcap");
  out.overcap = r3;
  console.log("3 over-cap pay      ", r3.ok ? "PAID (BAD)" : r3.error, r3.sig && explorer(r3.sig));

  }
  // 4. escalation: agent proposes an off-list payment, agent can't approve, owner approves + executes
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  let transactionIndex = BigInt(ms.transactionIndex.toString());
  const [lastProposal] = multisig.getProposalPda({ multisigPda, transactionIndex });
  // resume: a vault tx without a proposal (e.g. a retried send) gets its proposal, else make a new one
  const resume = transactionIndex > 0n && !(await connection.getAccountInfo(lastProposal));
  if (!resume) transactionIndex += 1n;
  const [vault] = multisig.getVaultPda({ multisigPda, index: 0 });
  const ix = createTransferCheckedInstruction(
    pk(s, "vaultAta"), mint, pk(s, "decoy-1Ata"), vault, 250_000, 6,
  );
  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({ payerKey: vault, recentBlockhash: blockhash, instructions: [ix] });

  const c = resume
    ? { ok: true, sig: undefined, error: undefined }
    : await trySend("create", () =>
        multisig.rpc.vaultTransactionCreate({
          connection, feePayer: fees, multisigPda, transactionIndex, creator: agent.publicKey,
          rentPayer: fees.publicKey, vaultIndex: 0, ephemeralSigners: 0, transactionMessage: message,
          memo: "prove:escalate", signers: [agent],
        }),
      );
  console.log("4a vault tx         ", c.ok ? `#${transactionIndex}${resume ? " (resumed)" : ""}` : c.error);
  const p = await trySend("proposal", () =>
    // rpc.proposalCreate in sdk 2.1.4 drops rentPayer, so build the tx with it set
    (async () => {
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = multisig.transactions.proposalCreate({
        blockhash, feePayer: fees.publicKey, multisigPda, transactionIndex,
        creator: agent.publicKey, rentPayer: fees.publicKey,
      });
      tx.sign([fees, agent]);
      return connection.sendTransaction(tx);
    })(),
  );
  console.log("4a agent proposes   ", p.ok ? `proposal #${transactionIndex}` : p.error, p.sig && explorer(p.sig));

  const a = await trySend("agent-approve", () =>
    multisig.rpc.proposalApprove({ connection, feePayer: fees, member: agent, multisigPda, transactionIndex }),
  );
  console.log("4b agent self-approve", a.ok ? "APPROVED (BAD)" : a.error);

  const oa = await trySend("owner-approve", () =>
    multisig.rpc.proposalApprove({ connection, feePayer: fees, member: owner, multisigPda, transactionIndex }),
  );
  const ex = await trySend("execute", () =>
    multisig.rpc.vaultTransactionExecute({ connection, feePayer: fees, multisigPda, transactionIndex, member: owner.publicKey, signers: [owner] }),
  );
  console.log("4c owner approve+exec", oa.ok && ex.ok ? "EXECUTED" : oa.error ?? ex.error, ex.sig && explorer(ex.sig));
  out.escalate = { create: c, proposal: p, agentApprove: a, ownerApprove: oa, execute: ex };

  const sl = await multisig.accounts.SpendingLimit.fromAccountAddress(connection, pk(s, "spendingLimit"));
  console.log("remaining today     ", Number(sl.remainingAmount.toString()) / 1e6, "usdc");

  s.proofs = JSON.stringify(out);
  writeState(s);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
