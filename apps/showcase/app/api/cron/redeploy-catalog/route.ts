import { NextResponse } from "next/server";

/**
 * Hourly catalogue refresh via Vercel Cron (Production): triggers a Deploy Hook rebuild so
 * `prebuild` re-streams `SHOWCASE_CATALOG_URL` → `demo-catalog.json`.
 *
 * Env (Vercel):
 * - `VERCEL_DEPLOY_HOOK_URL` — Deploy Hook POST URL from Project → Settings → Git → Deploy Hooks
 * - `CRON_SECRET` — required; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set in project env
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const secret =
    String(process.env.CRON_SECRET ?? process.env.SHOWCASE_CRON_SECRET ?? "").trim() || "";

  const authHdr = req.headers.get("authorization") ?? "";
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "cron_misconfigured", message: "Set CRON_SECRET in Vercel env for cron authorization." },
      { status: 501 },
    );
  }
  if (authHdr !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hook = String(process.env.VERCEL_DEPLOY_HOOK_URL ?? "").trim();
  if (!hook) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason:
        "VERCEL_DEPLOY_HOOK_URL unset — set a Deploy Hook URL to rebuild hourly, or rely on github/.github/workflows/showcase-deploy-hook.yml",
    });
  }

  try {
    const ctl = AbortSignal.timeout(90_000);
    const res = await fetch(hook, { method: "POST", signal: ctl });
    const text = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, deployHookHttpStatus: res.status, snippet: text.slice(0, 400) },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      deployHookHttpStatus: res.status,
      note: "Vercel will queue a new deployment; catalogue updates when SHOWCASE_CATALOG_URL points at the latest gzip/CSV.",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "deploy_hook_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
