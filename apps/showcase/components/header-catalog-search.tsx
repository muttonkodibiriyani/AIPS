"use client";

import { FormEvent, useCallback, useState } from "react";
import { usePathname } from "next/navigation";

import { Search } from "lucide-react";

import { cn } from "@/lib/utils";

function scrollToExperience() {
  window.requestAnimationFrame(() => {
    document.getElementById("experience")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

type Props = { className?: string };

/**
 * Persistent search strip in the site header → syncs playground via ?q= and a window event.
 */
export function HeaderCatalogSearch({ className }: Props) {
  const pathname = usePathname();
  const [value, setValue] = useState("");

  const submit = useCallback(
    (q: string) => {
      const query = q.trim();
      const base = pathname || "/";
      const url = `${base}?q=${encodeURIComponent(query)}`;

      if (typeof window.history?.replaceState === "function") {
        window.history.replaceState({}, "", `${url}#experience`);
      }

      scrollToExperience();
      window.dispatchEvent(new CustomEvent("showcase-run-search", { detail: { query } }));
    },
    [pathname],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(value);
  };

  return (
    <form
      role="search"
      onSubmit={onSubmit}
      className={cn(
        "flex w-full min-w-0 flex-1 items-center gap-0 md:min-w-[min(520px,calc(100vw-380px))] lg:min-w-[min(620px,calc(100vw-460px))]",
        className,
      )}
    >
      <label htmlFor="header-catalog-search" className="sr-only">
        AI contextual catalog search
      </label>
      <input
        id="header-catalog-search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="AI search — white vase · gift for men · party outfit"
        className="min-w-0 flex-1 rounded-l-xl border border-white/14 bg-black/55 py-2.5 pl-[0.825rem] pr-3 font-[inherit] text-[13px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-teal-500/50 focus:bg-black/72"
      />
      <button
        type="submit"
        className="-ml-px inline-flex shrink-0 items-center gap-2 rounded-r-xl border border-teal-500/42 bg-teal-500/[0.16] px-3.5 py-2.5 text-[13px] font-semibold tracking-tight text-teal-100 transition hover:bg-teal-500/26 sm:px-4"
      >
        <Search className="size-[1.0625rem] opacity-95" aria-hidden strokeWidth={2} />
        <span className="hidden sm:inline">Ask AI</span>
      </button>
    </form>
  );
}
