/**
 * Helpers for authenticated calls to COMMERCE_GATEWAY_URL admin routes from Next route handlers.
 */
export function gatewayBase(): string | null {
  const b = process.env.COMMERCE_GATEWAY_URL?.trim() ?? "";
  return b.length > 0 ? b.replace(/\/$/, "") : null;
}

export function gatewayBearer(): string {
  return process.env.COMMERCE_API_KEY ?? process.env.SHOWCASE_API_FALLBACK ?? "pk_demo";
}

export function gatewayAdminHeaders(extra?: Record<string, string>): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${gatewayBearer()}`,
    ...extra,
  };
}
