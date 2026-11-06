"use client";

import { useMemo, useState } from "react";
import { VersionedTransaction } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { short } from "@/components/outcome";

type Proposal = { index: number; status: string; to?: string; usdc?: number };

export function Approve(props: { initial: Proposal[]; owner: string; rpc: string }) {
  return (
    <ConnectionProvider endpoint={props.rpc}>
      <WalletProvider wallets={useMemo(() => [], [])} autoConnect>
        <Inner {...props} />
      </WalletProvider>
    </ConnectionProvider>
  );
}

const STATUS: Record<string, string> = {
  Active: "waiting",
  Approved: "approved",
  Executed: "paid",
  Rejected: "rejected",
  Cancelled: "cancelled",
  Draft: "draft",
};

function Inner({ initial, owner }: { initial: Proposal[]; owner: string }) {
  const { wallets, select, connect, connected, publicKey, signTransaction, disconnect, wallet } = useWallet();
  const [proposals, setProposals] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const isOwner = publicKey?.toBase58() === owner;
  const available = wallets.filter((w) => w.readyState === WalletReadyState.Installed);

  async function act(index: number, action: "approve" | "reject") {
    if (!publicKey || !signTransaction) return;
    setBusy(index);
    setNote(null);
    try {
      const built = await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "build", owner: publicKey.toBase58(), index, action }),
      }).then((r) => r.json());
      if (built.error) throw new Error(built.error);
      const signed = await signTransaction(VersionedTransaction.deserialize(Buffer.from(built.tx, "base64")));
      const sent = await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "send", tx: Buffer.from(signed.serialize()).toString("base64") }),
      }).then((r) => r.json());
      if (sent.error) throw new Error(sent.error);
      setProposals((ps) => ps.map((p) => (p.index === index ? { ...p, status: action === "approve" ? "Executed" : "Rejected" } : p)));
      setNote(`${action === "approve" ? "paid" : "rejected"}. ${sent.explorer}`);
    } catch (e) {
      setNote((e as Error).message.toLowerCase());
    } finally {
      setBusy(null);
    }
  }

  const pending = proposals.filter((p) => p.status === "Active");
  const done = proposals.filter((p) => p.status !== "Active");

  return (
    <div className="max-w-[720px] pt-10 sm:pt-14">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">owner</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-slate">
        payments the agent couldn&apos;t make on its own. approving one sends it from the vault. only the owner key{" "}
        <span className="font-mono text-[13px]">{short(owner, 4)}</span> can.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-4 border-y border-line py-4">
        {connected && publicKey ? (
          <>
            <span className="font-mono text-[13px]">{short(publicKey.toBase58(), 6)}</span>
            <span className={`text-[13px] ${isOwner ? "text-blue-ink" : "text-slate"}`}>
              {isOwner ? "owner" : "not the owner, view only"}
            </span>
            <button onClick={() => disconnect()} className="ml-auto text-[14px] text-slate underline-offset-4 hover:text-ink hover:underline">
              disconnect
            </button>
          </>
        ) : available.length ? (
          available.map((w) => (
            <button
              key={w.adapter.name}
              onClick={() => (wallet?.adapter.name === w.adapter.name ? connect().catch(() => {}) : select(w.adapter.name))}
              className="inline-flex h-10 items-center border border-ink px-4 text-[14px] font-medium hover:bg-ink hover:text-paper"
            >
              connect {w.adapter.name.toLowerCase()}
            </button>
          ))
        ) : (
          <span className="text-[14px] text-slate">open this page inside phantom&apos;s browser to approve.</span>
        )}
      </div>

      {note && <p className="mt-4 font-mono text-[12px] break-all text-slate">{note}</p>}

      <h2 className="mt-10 text-[13px] font-medium text-slate">waiting</h2>
      <ul className="mt-3 border-t border-line">
        {!pending.length && <li className="border-b border-line py-6 text-[15px] text-mute">nothing waiting.</li>}
        {pending.map((p) => (
          <li key={p.index} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line py-4">
            <div className="min-w-0 flex-1">
              <div className="num text-[17px] font-medium">{p.usdc?.toFixed(2)} usdc</div>
              <div className="mt-1 font-mono text-[12px] text-mute">
                #{p.index} → usdc account {short(p.to, 6)}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                disabled={!isOwner || busy !== null}
                onClick={() => act(p.index, "reject")}
                className="h-10 border border-line px-4 text-[14px] hover:border-ink disabled:opacity-40"
              >
                reject
              </button>
              <button
                disabled={!isOwner || busy !== null}
                onClick={() => act(p.index, "approve")}
                className="h-10 bg-ink px-4 text-[14px] font-medium text-paper hover:bg-[#222] disabled:bg-mute"
              >
                {busy === p.index ? "signing…" : "approve and pay"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <>
          <h2 className="mt-10 text-[13px] font-medium text-slate">history</h2>
          <ul className="mt-3 border-t border-line">
            {done.map((p) => (
              <li key={p.index} className="flex items-baseline justify-between gap-4 border-b border-line py-3 text-[14px]">
                <span className="num">
                  #{p.index} · {p.usdc?.toFixed(2)} usdc
                </span>
                <span className="text-slate">{STATUS[p.status] ?? p.status.toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
