import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-black/42 py-16">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-[1fr,auto] sm:gap-14">
        <div>
          <p className="font-display text-lg text-white">Commerce AI</p>
          <p className="mt-4 max-w-md text-[13px] leading-relaxed text-slate-500">
            Operational hybrid retrieval for enterprise commerce catalogs — ingestion, gateway, multilingual analyzers,
            SDKs — host on Compose, Kubernetes, VPC, or connect a managed gateway tier for board-ready milestones.
          </p>
          <div className="mt-9 flex gap-8 text-[12px] text-slate-500">
            <span>Privacy-by-architecture posture</span>
            <span>API keys never shipped to browsers</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 text-[13px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Ship</p>
          <Link href="#experience" className="text-slate-300 hover:text-white">
            Leadership demo
          </Link>
          <a
            className="text-slate-300 hover:text-white"
            href="https://github.com/muttonkodibiriyani/AIPS"
            rel="noopener noreferrer"
            target="_blank"
          >
            Repository
          </a>
          <a
            className="text-slate-300 hover:text-white"
            href="https://vercel.com/docs"
            rel="noopener noreferrer"
            target="_blank"
          >
            Vercel docs
          </a>
        </div>
      </div>
    </footer>
  );
}
