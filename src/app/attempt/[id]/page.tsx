import Link from "next/link";
import { notFound } from "next/navigation";
import { getAttempt } from "@/lib/store";
import { RunLog } from "@/components/run-log";
import { OUTCOME, OutcomeTag } from "@/components/outcome";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const a = await getAttempt((await params).id);
  return {
    title: a ? `${OUTCOME[a.outcome].label} · leash` : "leash",
    description: a ? a.invoice.slice(0, 150) : undefined,
  };
}

export default async function AttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const a = await getAttempt((await params).id);
  if (!a) notFound();
  const when = new Date(a.createdAt).toISOString().replace("T", " ").slice(0, 16) + " utc";

  return (
    <article className="max-w-[720px] pt-10 sm:pt-14">
      <div className="flex items-baseline justify-between gap-4 text-[13px] text-mute">
        <span className="font-mono">attempt {a.id}</span>
        <span className="num font-mono">{when}</span>
      </div>
      <OutcomeTag outcome={a.outcome} className="mt-6 text-[32px] font-semibold tracking-[-0.02em]" />
      <p className="mt-2 text-[16px] text-slate">{OUTCOME[a.outcome].note}</p>

      <h2 className="mt-12 text-[13px] font-medium text-slate">the invoice</h2>
      <pre className="mt-3 border border-line bg-sand px-4 py-4 font-mono text-[13px] leading-[1.65] whitespace-pre-wrap break-words">
        {a.invoice}
      </pre>

      <h2 className="mt-12 text-[13px] font-medium text-slate">what the agent did</h2>
      <div className="mt-3 border-t border-line">
        <RunLog steps={a.steps} />
      </div>

      {a.txs.length > 0 && (
        <>
          <h2 className="mt-12 text-[13px] font-medium text-slate">on-chain</h2>
          <ul className="mt-3 border-t border-line">
            {a.txs.map((t) => (
              <li key={t.explorer} className="flex items-baseline justify-between gap-4 border-b border-line py-3 text-[14px]">
                <span>{t.label}</span>
                <a href={t.explorer} target="_blank" rel="noreferrer" className="text-blue-ink underline underline-offset-4">
                  solscan
                </a>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-12">
        <Link href="/arena" className="inline-flex h-11 items-center bg-ink px-5 text-[15px] font-medium text-paper hover:bg-[#222]">
          try your own
        </Link>
      </div>
    </article>
  );
}
