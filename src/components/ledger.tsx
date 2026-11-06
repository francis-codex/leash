"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Outcome } from "@/lib/store";
import { OutcomeTag, ago } from "./outcome";

export type FeedItem = {
  id: string;
  createdAt: number;
  invoice: string;
  outcome: Outcome;
  txs: { label: string; explorer: string; error?: string }[];
};

export function Ledger({ initial }: { initial: FeedItem[] }) {
  const [items, setItems] = useState(initial);
  const [, tick] = useState(0);

  useEffect(() => {
    const poll = setInterval(async () => {
      const r = await fetch("/api/feed", { cache: "no-store" }).catch(() => null);
      if (r?.ok) setItems((await r.json()).items);
    }, 10_000);
    const clock = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  if (!items.length) {
    return (
      <div className="border-y border-line py-12 text-center text-[15px] text-slate">
        no attempts yet.{" "}
        <Link href="/arena" className="text-blue-ink underline underline-offset-4">
          be the first
        </Link>
        .
      </div>
    );
  }

  return (
    <ol className="border-t border-line">
      {items.map((a) => {
        const tx = a.txs[a.txs.length - 1];
        return (
          <li key={a.id} className="border-b border-line">
            <Link
              href={`/attempt/${a.id}`}
              className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 py-4 transition-colors hover:bg-sand/60 sm:grid-cols-[56px_1fr_160px_168px] sm:items-baseline sm:px-2"
            >
              <span className="num order-3 font-mono text-[12px] text-mute sm:order-none">{ago(a.createdAt)}</span>
              <span className="col-span-2 line-clamp-2 text-[15px] leading-snug sm:col-span-1 sm:line-clamp-1">
                {a.invoice}
              </span>
              <OutcomeTag outcome={a.outcome} className="order-4 text-[13px] sm:order-none" />
              <span className="order-5 hidden truncate text-right font-mono text-[12px] text-mute sm:order-none sm:block">
                {tx?.error ?? (tx ? "tx" : "no tx")}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
