import { ThemeToggle } from "@/components/theme-toggle";
import { Mark } from "@/components/logo";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { network } from "@/lib/config";
import "./globals.css";

const sans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "leash",
  description: "your agent can be tricked. your money can't.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0d" },
  ],
};

const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

const nav = [
  { href: "/arena", label: "arena" },
  { href: "/rules", label: "rules" },
  { href: "/approve", label: "owner" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${sans.variable} ${mono.variable}`}>
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">
              <Mark className="size-[18px]" />
              leash
            </Link>
            <nav className="flex items-center gap-5 text-[14px] text-slate">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
                  {n.label}
                </Link>
              ))}
              {network === "devnet" && (
                <span className="hidden font-mono text-[12px] text-mute sm:inline">devnet</span>
              )}
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1080px] px-4 sm:px-6">{children}</main>
        <footer className="mx-auto mt-24 max-w-[1080px] border-t border-line px-4 py-8 text-[13px] text-mute sm:px-6">
          rules enforced by a squads v4 vault on solana. nothing here is a promise from us; it&apos;s the chain.
        </footer>
      </body>
    </html>
  );
}
