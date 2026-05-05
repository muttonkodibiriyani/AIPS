import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Public config hint for the deployment banner (no secrets).
 */
export async function GET() {
  const gw = process.env.COMMERCE_GATEWAY_URL?.trim() ?? "";
  const demo = process.env.SHOWCASE_DEMO_SEARCH === "true";

  return NextResponse.json({
    gatewayConfigured: gw.length > 0,
    demoSearchEnabled: demo,
    liveSearchAvailable: gw.length > 0,
  });
}
