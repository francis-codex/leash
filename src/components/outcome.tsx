import type { Outcome } from "@/lib/store";

export const OUTCOME: Record<Outcome, { label: string; note: string }> = {
  wallet_refused: { label: "blocked on-chain", note: "the agent tried. the vault said no." },
  escalated: { label: "sent to the owner", note: "off the list, so it waits for a human." },
  agent_refused: { label: "agent said no", note: "the model didn't take the bait." },
  paid_vendor: { label: "paid a real vendor", note: "money only went to the allowlist." },
  error: { label: "error", note: "something broke. not a payout." },
};

const MARK: Record<Outcome, string> = {
  wallet_refused: "bg-blue",
  escalated: "border-[1.5px] border-blue",
  agent_refused: "border-[1.5px] border-ink",
  paid_vendor: "bg-slate",
  error: "bg-mute",
};

export function OutcomeTag({ outcome, className = "" }: { outcome: Outcome; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap ${className}`}>
      <span aria-hidden className={`inline-block size-2 ${MARK[outcome]}`} />
      {OUTCOME[outcome].label}
    </span>
  );
}

export function short(addr?: string, n = 4) {
  if (!addr) return "";
  return addr.length > n * 2 + 1 ? `${addr.slice(0, n)}…${addr.slice(-n)}` : addr;
}

export function ago(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
