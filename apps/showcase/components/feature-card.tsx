import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function FeatureCard(props: {
  icon: LucideIcon;
  title: string;
  body: string;
  delay: number;
}) {
  const Icon = props.icon;
  return (
    <article
      style={{ animationDelay: `${props.delay}ms` }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-950/72 p-7 transition",
        "hover:border-teal-500/30 hover:shadow-[0_20px_65px_-52px_rgba(16,185,129,0.52)]",
        "animate-fade-up [animation-fill-mode:forwards]",
      )}
    >
      <div className="mb-5 inline-flex rounded-xl border border-white/10 bg-white/[0.04] p-3 text-teal-200/90 shadow-inner">
        <Icon className="size-5" strokeWidth={1.85} />
      </div>
      <h4 className="text-lg font-semibold tracking-tight text-white">{props.title}</h4>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{props.body}</p>
    </article>
  );
}
