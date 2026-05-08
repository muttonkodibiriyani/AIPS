/**
 * Client preference: keyword vs AI/context signal (echoed in search `interpretation`).
 * Defaults privilege contextual discovery.
 */
export function discoveryWeightsFromBody(body: Record<string, unknown>): {
  lexicalWeight: number;
  semanticWeight: number;
} {
  const ctx =
    body.context && typeof body.context === "object" && body.context !== null
      ? (body.context as Record<string, unknown>)
      : {};
  const lx = Number(ctx.lexicalWeight);
  const sx = Number(ctx.semanticWeight);
  if (Number.isFinite(lx) && Number.isFinite(sx)) {
    return {
      lexicalWeight: Math.min(1, Math.max(0, lx)),
      semanticWeight: Math.min(1, Math.max(0, sx)),
    };
  }
  return { lexicalWeight: 0.18, semanticWeight: 0.82 };
}
