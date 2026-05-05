import { useCallback, useState } from "react";
import { CommerceAISearch, type CommerceAISearchConfig } from "@commerce-ai/search-js";

export function useCommerceSearch(config: CommerceAISearchConfig) {
  const [client] = useState(() => new CommerceAISearch(config));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<unknown>(null);

  const search = useCallback(
    async (query: string) => {
      setLoading(true);
      setError(null);
      try {
        const r = await client.search({ query });
        setData(r);
        return r;
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  return { search, loading, error, data };
}
