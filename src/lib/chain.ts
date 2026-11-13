import "server-only";
import * as multisig from "@sqds/multisig";
import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { addr, agentKey, connection, explorerTx, feesKey } from "./config";

export type ChainResult = {
  ok: boolean;
  signature?: string;
  explorer?: string;
  error?: string;
  detail?: string;
};

const CODES: Record<number, string> = {
  6004: "Unauthorized",
  6005: "NotAMember",
  6024: "InvalidMint",
  6025: "InvalidDestination",
  6026: "SpendingLimitExceeded",
  6027: "DecimalsMismatch",
};

const DETAIL: Record<string, string> = {
  ProposalNotCreated: "the payment was prepared but the request to the owner did not go out. asking again for the same payee and amount finishes it instead of starting a second one",
  InvalidDestination: "the vault refused: this address is not on the owner's allowlist",
  SpendingLimitExceeded: "the vault refused: this would go over today's spending limit",
  Unauthorized: "the vault refused: the agent key is not allowed to do this",
  AccountNotInitialized: "the destination has no usdc account",
};

function errorName(logs: string[], err: unknown): string {
  for (const l of logs) {
    const m = l.match(/Error Code: (\w+)/);
    if (m) return m[1];
  }
  const c = JSON.stringify(err ?? "").match(/"Custom":(\d+)/);
  if (c) return CODES[Number(c[1])] ?? `Custom(${c[1]})`;
  if (logs.some((l) => /insufficient/i.test(l))) return "InsufficientFunds";
  return JSON.stringify(err);
}

async function waitConfirmed(sig: string) {
  for (let i = 0; i < 40; i++) {
    const st = (await connection.getSignatureStatuses([sig])).value[0];
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 600));
  }
}

/** Simulate for the error, then land the tx either way so refusals have a signature. */
async function land(tx: VersionedTransaction): Promise<ChainResult> {
  const sim = await connection.simulateTransaction(tx, { sigVerify: false });
  const sig = await connection.sendTransaction(tx, { skipPreflight: true });
  await waitConfirmed(sig);
  if (sim.value.err) {
    const error = errorName(sim.value.logs ?? [], sim.value.err);
    return { ok: false, signature: sig, explorer: explorerTx(sig), error, detail: DETAIL[error] };
  }
  return { ok: true, signature: sig, explorer: explorerTx(sig) };
}

const mint = () => addr("mint");
const multisigPda = () => addr("multisig");

export async function agentPay(to: string, usdc: number, memo: string): Promise<ChainResult> {
  const destination = new PublicKey(to);
  // the vault only pays into existing usdc accounts; a missing one is a refusal, not our cost
  const ata = getAssociatedTokenAddressSync(mint(), destination, true);
  if (!(await connection.getAccountInfo(ata))) {
    return { ok: false, error: "AccountNotInitialized", detail: DETAIL.AccountNotInitialized };
  }
  const fees = feesKey();
  const agent = agentKey();
  const { blockhash } = await connection.getLatestBlockhash();
  const tx = multisig.transactions.spendingLimitUse({
    blockhash,
    feePayer: fees.publicKey,
    multisigPda: multisigPda(),
    member: agent.publicKey,
    spendingLimit: addr("spendingLimit"),
    mint: mint(),
    vaultIndex: 0,
    amount: Math.round(usdc * 1e6),
    decimals: 6,
    destination,
    memo: memo.slice(0, 64),
  });
  tx.sign([fees, agent]);
  return land(tx);
}

export async function agentPropose(
  to: string,
  usdc: number,
  memo: string,
): Promise<ChainResult & { proposal?: string }> {
  const destination = new PublicKey(to);
  const destAta = getAssociatedTokenAddressSync(mint(), destination, true);
  if (!(await connection.getAccountInfo(destAta))) {
    return { ok: false, error: "AccountNotInitialized", detail: DETAIL.AccountNotInitialized };
  }
  const fees = feesKey();
  const agent = agentKey();
  const lamports = Math.round(usdc * 1e6);
  // resume first: a transaction this agent created for the same payee and amount that never
  // got its proposal (a dropped or failed proposalCreate) is finished, not duplicated
  const stranded = await strandedTransaction(destAta, lamports);
  if (stranded !== null) {
    const resumed = await openProposal(stranded);
    return { ...resumed, proposal: stranded.toString() };
  }
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda());
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  const [vault] = multisig.getVaultPda({ multisigPda: multisigPda(), index: 0 });
  const ix = createTransferCheckedInstruction(addr("vaultAta"), mint(), destAta, vault, lamports, 6);
  const { blockhash } = await connection.getLatestBlockhash();
  const createTx = multisig.transactions.vaultTransactionCreate({
    blockhash,
    feePayer: fees.publicKey,
    multisigPda: multisigPda(),
    transactionIndex,
    creator: agent.publicKey,
    rentPayer: fees.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: new TransactionMessage({ payerKey: vault, recentBlockhash: blockhash, instructions: [ix] }),
    memo: memo.slice(0, 64),
  });
  createTx.sign([fees, agent]);
  const created = await land(createTx);
  if (!created.ok) return created;
  const proposed = await openProposal(transactionIndex);
  return { ...proposed, proposal: transactionIndex.toString() };
}

const proposalExists = async (transactionIndex: bigint) => {
  const [pPda] = multisig.getProposalPda({ multisigPda: multisigPda(), transactionIndex });
  return !!(await connection.getAccountInfo(pPda));
};

/**
 * Opens the proposal for an already-created vault transaction. Tries three times with a
 * fresh blockhash, and treats "the proposal is there" as success, so a send that landed
 * but timed out on our side is not reported as a failure.
 */
async function openProposal(transactionIndex: bigint): Promise<ChainResult> {
  const fees = feesKey();
  const agent = agentKey();
  let last: ChainResult = { ok: false, error: "ProposalNotCreated", detail: DETAIL.ProposalNotCreated };
  for (let i = 0; i < 3; i++) {
    if (await proposalExists(transactionIndex).catch(() => false)) return { ...last, ok: true, error: undefined, detail: undefined };
    try {
      // sdk 2.1.4 rpc.proposalCreate drops rentPayer; the tx builder keeps it
      const tx = multisig.transactions.proposalCreate({
        blockhash: (await connection.getLatestBlockhash()).blockhash,
        feePayer: fees.publicKey,
        multisigPda: multisigPda(),
        transactionIndex,
        creator: agent.publicKey,
        rentPayer: fees.publicKey,
      });
      tx.sign([fees, agent]);
      last = await land(tx);
      if (last.ok) return last;
    } catch (e) {
      last = { ok: false, error: "ProposalNotCreated", detail: `${DETAIL.ProposalNotCreated} (${e instanceof Error ? e.message : String(e)})` };
    }
  }
  if (await proposalExists(transactionIndex).catch(() => false)) return { ...last, ok: true, error: undefined, detail: undefined };
  return { ...last, error: "ProposalNotCreated", detail: last.detail ?? DETAIL.ProposalNotCreated };
}

/** Recent vault transactions with no proposal account: created, then the second step never landed. */
export async function strandedTransactions() {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda());
  const last = Number(ms.transactionIndex.toString());
  const out: { index: number; creator: string; destAta?: string; amount?: number }[] = [];
  for (let i = last; i > Math.max(0, last - 15); i--) {
    if (await proposalExists(BigInt(i))) continue;
    const [tPda] = multisig.getTransactionPda({ multisigPda: multisigPda(), index: BigInt(i) });
    const t = await multisig.accounts.VaultTransaction.fromAccountAddress(connection, tPda).catch(() => null);
    if (!t) continue;
    const ix = t.message.instructions[0];
    const data = Buffer.from(ix?.data ?? []);
    out.push({
      index: i,
      creator: t.creator.toBase58(),
      destAta: ix ? t.message.accountKeys[ix.accountIndexes[2]]?.toBase58() : undefined,
      amount: data[0] === 12 ? Number(data.readBigUInt64LE(1)) : undefined,
    });
  }
  return out;
}

async function strandedTransaction(destAta: PublicKey, amount: number): Promise<bigint | null> {
  const me = agentKey().publicKey.toBase58();
  const hit = (await strandedTransactions()).find(
    (t) => t.creator === me && t.destAta === destAta.toBase58() && t.amount === amount,
  );
  return hit ? BigInt(hit.index) : null;
}

/** Owner-side resume: open the proposal for every stranded transaction the agent created. */
export async function resumeStranded() {
  const me = agentKey().publicKey.toBase58();
  const out: { index: number; ok: boolean; error?: string; tx?: string }[] = [];
  for (const t of await strandedTransactions()) {
    if (t.creator !== me) continue;
    const r = await openProposal(BigInt(t.index));
    out.push({ index: t.index, ok: r.ok, error: r.error, tx: r.explorer });
  }
  return out;
}

export async function vaultStatus() {
  const [bal, sl] = await Promise.all([
    getAccount(connection, addr("vaultAta")).then((a) => Number(a.amount) / 1e6).catch(() => 0),
    multisig.accounts.SpendingLimit.fromAccountAddress(connection, addr("spendingLimit")),
  ]);
  return {
    vaultUsdc: bal,
    dailyCapUsdc: Number(sl.amount.toString()) / 1e6,
    remainingTodayUsdc: Number(sl.remainingAmount.toString()) / 1e6,
    allowlist: sl.destinations.map((d) => d.toBase58()),
  };
}

export async function pendingProposals() {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda());
  const last = Number(ms.transactionIndex.toString());
  const out: { index: number; status: string; to?: string; usdc?: number; memo?: string }[] = [];
  for (let i = last; i > Math.max(0, last - 15); i--) {
    const [pPda] = multisig.getProposalPda({ multisigPda: multisigPda(), transactionIndex: BigInt(i) });
    const p = await multisig.accounts.Proposal.fromAccountAddress(connection, pPda).catch(() => null);
    if (!p) continue;
    const status = p.status.__kind;
    const [tPda] = multisig.getTransactionPda({ multisigPda: multisigPda(), index: BigInt(i) });
    const t = await multisig.accounts.VaultTransaction.fromAccountAddress(connection, tPda).catch(() => null);
    let to: string | undefined;
    let usdc: number | undefined;
    if (t) {
      const ix = t.message.instructions[0];
      const keys = t.message.accountKeys;
      to = keys[ix.accountIndexes[2]]?.toBase58();
      const data = Buffer.from(ix.data);
      if (data[0] === 12) usdc = Number(data.readBigUInt64LE(1)) / 1e6; // transferChecked
    }
    out.push({ index: i, status, to, usdc });
  }
  return out;
}
