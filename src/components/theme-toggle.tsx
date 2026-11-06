"use client";

import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";
const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "auto", light: "light", dark: "dark" };

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    let t: Theme = "system";
    try {
      const s = localStorage.getItem("theme");
      if (s === "light" || s === "dark") t = s;
    } catch {}
    setTheme(t);
  }, []);

  function cycle() {
    const next = NEXT[theme ?? "system"];
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {}
  }

  return (
    <button
      onClick={cycle}
      aria-label={`theme: ${LABEL[theme ?? "system"]}. switch theme`}
      title="switch theme"
      className="inline-flex h-8 min-w-[48px] items-center justify-center border border-line px-2 font-mono text-[12px] text-slate transition-colors hover:border-ink hover:text-ink"
    >
      {theme ? LABEL[theme] : "auto"}
    </button>
  );
}
