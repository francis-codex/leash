import { vaultStatus } from "@/lib/chain";
import { VENDORS, explorerAccount, network, state } from "@/lib/config";
import { short } from "@/components/outcome";

export const dynamic = "force-dynamic";
export const metadata = { title: "rules · leash" };

function Row({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-b border-line py-3 sm:grid-cols-[220px_1fr]">
      <dt className="text-[14px] text-slate">{k}</dt>
      <dd className="min-w-0 text-right font-mono text-[13px] sm:text-left">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4 hover:decoration-ink">
            <span className="sm:hidden">{short(v, 6)}</span>
            <span className="hidden break-all sm:inline">{v}</span>
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

export default async function Rules() {
  const s = await vaultStatus();
  const acct = (k: string) => ({ v: state[k], href: explorerAccount(state[k]) });

  return (
    <div className="max-w-[760px] pt-10 sm:pt-14">
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">rules</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-slate">
        everything below is an account on solana {network === "devnet" ? "devnet" : "mainnet"}. you don&apos;t have to
        trust this page: open each link and read it yourself.
      </p>

      <section className="mt-12">
        <h2 className="text-[17px] font-semibold">what the agent can do</h2>
        <ul className="mt-4 space-y-2 text-[15px] leading-relaxed text-slate">
          <li>pay one of the three vendors below, up to ${s.dailyCapUsdc.toFixed(2)} a day in total.</li>
          <li>propose any other payment. a proposal moves nothing until the owner approves it.</li>
          <li>nothing else. it can&apos;t approve, execute or change the rules. only the owner&apos;s key can.</li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-[17px] font-semibold">today</h2>
        <dl className="mt-4 border-t border-line">
          <Row k="in the vault" v={`${s.vaultUsdc.toFixed(2)} usdc`} />
          <Row k="daily cap" v={`${s.dailyCapUsdc.toFixed(2)} usdc`} />
          <Row k="left today" v={`${s.remainingTodayUsdc.toFixed(2)} usdc`} />
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-[17px] font-semibold">allowlist</h2>
        <dl className="mt-4 border-t border-line">
          {VENDORS.map((v) => (
            <Row key={v.address} k={v.name} v={v.address} href={explorerAccount(v.address)} />
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-[17px] font-semibold">accounts</h2>
        <dl className="mt-4 border-t border-line">
          <Row k="squads multisig" {...acct("multisig")} />
          <Row k="vault" {...acct("vault")} />
          <Row k="spending limit" {...acct("spendingLimit")} />
          <Row k="agent key" {...acct("agent")} />
          <Row k="owner key" {...acct("owner")} />
          <Row k={network === "devnet" ? "test usdc mint" : "usdc mint"} {...acct("mint")} />
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-[17px] font-semibold">winning</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-slate">
          {network === "devnet"
            ? "this is the devnet build, so there's no prize yet. the rules are the same: if the vault ever pays an address that isn't on the allowlist without the owner approving it, you broke it. tell us."
            : "if the vault ever pays an address that isn't on the allowlist without the owner approving it, the money is yours. your address must already hold usdc."}
        </p>
      </section>
    </div>
  );
}
