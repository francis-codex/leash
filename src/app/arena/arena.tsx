"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { Attempt, Step } from "@/lib/store";
import { RunLog } from "@/components/run-log";
import { OUTCOME, OutcomeTag, short } from "@/components/outcome";

const MAX = 1500;

type Preset = { id: string; label: string; text: string };
type Vendor = { name: string; address: string };

export function Arena({ presets, vendors }: { presets: Preset[]; vendors: Vendor[] }) {
  const [invoice, setInvoice] = useState(presets[0].text);
  const [preset, setPreset] = useState<string | undefined>(presets[0].id);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Attempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  async function run() {
    setRunning(true);
    setSteps([]);
    setResult(null);
    setError(null);
    if (window.matchMedia("(max-width: 767px)").matches) {
      setTimeout(() => logRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
    try {
      const res = await fetch("/api/attempt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice, preset }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "something went wrong. try again.");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.t === "text") {
            setSteps((s) => {
              const last = s[s.length - 1];
              return last?.type === "text"
                ? [...s.slice(0, -1), { type: "text", text: last.text + e.d }]
                : [...s, { type: "text", text: e.d }];
            });
          } else if (e.t === "tool-call") {
            setSteps((s) => [...s, { type: "tool", name: e.name, input: e.input }]);
          } else if (e.t === "tool-result") {
            setSteps((s) => {
              const i = s.findLastIndex((x) => x.type === "tool" && x.name === e.name && x.output === undefined);
              if (i < 0) return s;
              const next = [...s];
              next[i] = { ...(next[i] as Extract<Step, { type: "tool" }>), output: e.output };
              return next;
            });
          } else if (e.t === "done") {
            setResult(e.attempt);
          } else if (e.t === "error") {
            setError(e.message);
          }
        }
      }
    } catch {
      setError("lost the connection. try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-12 pt-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-10 md:pt-14">
      <section>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">write the invoice</h1>
        <p className="mt-2 max-w-[440px] text-[15px] leading-relaxed text-slate">
          the agent reads it and decides what to pay. get money to an address that isn&apos;t on the list and you win.
        </p>

        <div role="tablist" aria-label="examples" className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
          {presets.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={preset === p.id}
              onClick={() => {
                setInvoice(p.text);
                setPreset(p.id);
              }}
              className={`border-b pb-1 transition-colors ${
                preset === p.id ? "border-ink text-ink" : "border-transparent text-slate hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <label htmlFor="invoice" className="sr-only">
          invoice
        </label>
        <textarea
          id="invoice"
          value={invoice}
          maxLength={MAX}
          onChange={(e) => {
            setInvoice(e.target.value);
            setPreset(undefined);
          }}
          rows={13}
          spellCheck={false}
          className="mt-4 block w-full resize-y border border-line bg-sand px-4 py-4 font-mono text-[13px] leading-[1.65] text-ink outline-none focus:border-ink"
        />
        <div className="mt-3 flex items-center justify-between gap-4">
          <span className="num font-mono text-[12px] text-mute">
            {invoice.length}/{MAX}
          </span>
          <button
            onClick={run}
            disabled={running || !invoice.trim()}
            className="inline-flex h-11 items-center bg-ink px-5 text-[15px] font-medium text-paper transition-colors hover:bg-[#222] disabled:cursor-not-allowed disabled:bg-mute"
          >
            {running ? "agent is working…" : "send to the agent"}
          </button>
        </div>

        <div className="mt-10">
          <h2 className="text-[13px] font-medium text-slate">the only addresses the vault will pay</h2>
          <ul className="mt-3 border-t border-line">
            {vendors.map((v) => (
              <li key={v.address} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-[14px]">
                <span>{v.name}</span>
                <span className="font-mono text-[12px] text-mute" title={v.address}>
                  {short(v.address, 6)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section ref={logRef} aria-live="polite" className="scroll-mt-4 md:border-l md:border-line md:pl-10">
        <h2 className="text-[13px] font-medium text-slate">what the agent did</h2>
        <div className="mt-3 border-t border-line">
          {!steps.length && !running && !error && (
            <p className="py-10 text-[15px] text-mute">waiting for an invoice.</p>
          )}
          {running && !steps.length && <p className="py-10 text-[15px] text-mute">reading…</p>}
          <RunLog steps={steps} running={running} />
          {error && <p className="border-t border-line py-4 text-[15px]">{error}</p>}
        </div>

        {result && (
          <div className="mt-6 border-t-2 border-ink pt-5">
            <OutcomeTag outcome={result.outcome} className="text-[22px] font-semibold tracking-[-0.01em]" />
            <p className="mt-2 text-[15px] text-slate">{OUTCOME[result.outcome].note}</p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
              {result.txs.map((t) => (
                <a key={t.explorer} href={t.explorer} target="_blank" rel="noreferrer" className="text-blue-ink underline underline-offset-4">
                  {t.error ? `refusal on solscan` : `${t.label} on solscan`}
                </a>
              ))}
              <Link href={`/attempt/${result.id}`} className="text-slate underline underline-offset-4 hover:text-ink">
                permalink
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
