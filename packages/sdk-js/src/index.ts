import type { CommerceAISearchConfig } from "./types.js";

/**
 * Drop-in search client — thin wrapper over gateway `/v1/search`.
 * Full typing after `pnpm types:generate` extends paths.
 */
export class CommerceAISearch {
  constructor(private readonly config: CommerceAISearchConfig) {}

  async search(body: {
    query: string;
    filters?: Record<string, unknown>;
    locale?: string;
  }): Promise<unknown> {
    const res = await fetch(`${this.config.baseUrl}/v1/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        query: body.query,
        tenantId: this.config.tenantId,
        locale: body.locale ?? "en-AE",
        filters: body.filters,
        pagination: { from: 0, size: 24 },
      }),
    });
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    return res.json();
  }
}

export type { CommerceAISearchConfig } from "./types.js";
