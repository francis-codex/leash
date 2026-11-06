import "server-only";
import fs from "node:fs";
import path from "node:path";
import bs58 from "bs58";
import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";

// Deployed: LEASH_STATE (json) + LEASH_AGENT_KEY / LEASH_FEES_KEY (base58 or json array).
// Local: falls back to .keys/ written by scripts/setup.ts.
const KEYS = path.join(process.cwd(), ".keys");

function loadState(): Record<string, string> {
  if (process.env.LEASH_STATE) return JSON.parse(process.env.LEASH_STATE);
  return JSON.parse(fs.readFileSync(path.join(KEYS, "state.json"), "utf8"));
}

function loadKey(envName: string, file: string): Keypair {
  const raw = process.env[envName]?.trim();
  if (raw) {
    return Keypair.fromSecretKey(
      raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw),
    );
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, `${file}.json`), "utf8"))),
  );
}

export const state = loadState();
export const network = (state.network ?? "devnet") as "devnet" | "mainnet-beta";
export const connection = new Connection(
  process.env.LEASH_RPC ?? clusterApiUrl(network),
  "confirmed",
);

let _agent: Keypair | undefined;
let _fees: Keypair | undefined;
export const agentKey = () => (_agent ??= loadKey("LEASH_AGENT_KEY", "agent"));
export const feesKey = () => (_fees ??= loadKey("LEASH_FEES_KEY", "fees"));

export const addr = (k: string) => new PublicKey(state[k]);

export const VENDORS = [
  { name: "northwind hosting", key: "vendor-1" },
  { name: "paperplane design studio", key: "vendor-2" },
  { name: "bean & bolt coffee", key: "vendor-3" },
].map((v) => ({ ...v, address: state[v.key] }));

export const MAX_PAY_USDC = 2;
export const explorerTx = (sig: string) =>
  `https://solscan.io/tx/${sig}${network === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAccount = (a: string) =>
  `https://solscan.io/account/${a}${network === "devnet" ? "?cluster=devnet" : ""}`;
