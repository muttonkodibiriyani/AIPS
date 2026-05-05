import { NextResponse } from "next/server";

/**
 * Server-side proxy: keeps COMMERCE_API_KEY off the browser bundle.
 */
export async function POST(req: Request) {
  const base = process.env.COMMERCE_GATEWAY_URL;
  if (!base) {
    return NextResponse.json(
      {
        error: "gateway_unconfigured",
        message:
          "Set COMMERCE_GATEWAY_URL on Vercel (or locally) to your Nest gateway HTTPS origin, then redeploy.",
        products: [],
        facets: {},
        total: 0,
      },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const key = process.env.COMMERCE_API_KEY ?? process.env.SHOWCASE_API_FALLBACK ?? "pk_demo";
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }

  const stripped = base.replace(/\/$/, "");

  try {
    const upstream = await fetch(`${stripped}/v1/search`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      next: { revalidate: 0 },
    });

    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "upstream_error";
    return NextResponse.json({ error: "gateway_unreachable", message: msg, products: [] }, { status: 502 });
  }
}
