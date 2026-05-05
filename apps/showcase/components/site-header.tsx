import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-ink/82 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.125rem] max-w-6xl items-center justify-between gap-8 px-4">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="font-display text-xl font-semibold tracking-tight text-white transition group-hover:text-teal-200">
            Commerce AI
          </span>
          <span className="hidden rounded-full border border-teal-500/25 bg-teal-500/[0.1] px-2 py-[0.1rem] text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-200/92 sm:inline">
            Showcase
          </span>
        </Link>
        <nav className="flex items-center gap-7 text-[13px] font-medium">
          <Link href="#experience" className="hidden text-slate-400 transition hover:text-white md:inline">
            Live NL search
          </Link>
          <Link href="#capabilities" className="hidden text-slate-400 transition hover:text-white sm:inline">
            Platform
          </Link>
          <a
            href="https://github.com/muttonkodibiriyani/AIPS"
            rel="noopener noreferrer"
            target="_blank"
            className="rounded-lg border border-white/12 px-4 py-[0.6rem] text-slate-200 transition hover:border-teal-500/42 hover:bg-white/[0.04]"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
