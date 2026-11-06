import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  clusterApiUrl,
} from "@solana/web3.js";

export const KEYS = path.join(process.cwd(), ".keys");
export const STATE = path.join(KEYS, "state.json");

export const network = (process.env.LEASH_NETWORK ?? "devnet") as
  | "devnet"
  | "mainnet-beta";
export const connection = new Connection(
  process.env.LEASH_RPC ?? clusterApiUrl(network),
  "confirmed",
);

export function kp(name: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(path.join(KEYS, `${name}.json`), "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

export function newKp(name: string): Keypair {
  const file = path.join(KEYS, `${name}.json`);
  if (fs.existsSync(file)) return kp(name);
  const k = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify(Array.from(k.secretKey)));
  return k;
}

export type State = Record<string, string>;
export const readState = (): State =>
  fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
export const writeState = (s: State) =>
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
export const pk = (s: State, k: string) => new PublicKey(s[k]);

export const explorer = (sig: string) =>
  `https://solscan.io/tx/${sig}${network === "devnet" ? "?cluster=devnet" : ""}`;

/**
 * Simulate to read the program error, then (optionally) land the tx anyway
 * with skipPreflight so the refusal has an on-chain signature.
 */
export async function simulateThenSend(
  tx: VersionedTransaction,
  landFailures = true,
): Promise<{ ok: boolean; sig?: string; error?: string; logs?: string[] }> {
  const sim = await connection.simulateTransaction(tx, { sigVerify: false });
  const logs = sim.value.logs ?? [];
  if (sim.value.err) {
    const error = parseSquadsError(logs) ?? errName(sim.value.err) ?? JSON.stringify(sim.value.err);
    if (!landFailures) return { ok: false, error, logs };
    const sig = await connection.sendTransaction(tx, { skipPreflight: true });
    await confirm(sig);
    return { ok: false, sig, error, logs };
  }
  const sig = await connection.sendTransaction(tx, { skipPreflight: true });
  await confirm(sig);
  return { ok: true, sig, logs };
}

export async function confirm(sig: string) {
  // poll status; a failed tx is still "landed" for our purposes
  for (let i = 0; i < 40; i++) {
    const st = (await connection.getSignatureStatuses([sig])).value[0];
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return st;
    await new Promise((r) => setTimeout(r, 750));
  }
  throw new Error(`tx not confirmed: ${sig}`);
}

export function parseSquadsError(logs: string[]): string | undefined {
  for (const l of logs) {
    const m = l.match(/Error Code: (\w+)/);
    if (m) return m[1];
  }
  for (const l of logs) {
    if (/insufficient funds/i.test(l)) return "InsufficientFunds";
  }
  return undefined;
}

const CODES: Record<number, string> = {
  6004: "Unauthorized", 6005: "NotAMember", 6024: "InvalidMint",
  6025: "InvalidDestination", 6026: "SpendingLimitExceeded", 6027: "DecimalsMismatch",
};
export function errName(err: unknown): string | undefined {
  const m = JSON.stringify(err ?? "").match(/"Custom":(\d+)/);
  return m ? CODES[Number(m[1])] ?? `Custom(${m[1]})` : undefined;
}
