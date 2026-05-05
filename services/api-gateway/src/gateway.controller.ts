import { Body, Controller, Get, Req, Post, UseGuards, Res, Param } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import type { RawBodyRequest } from "@nestjs/common/interfaces";
import type { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { ApiKeyGuard } from "./auth/api-key.guard";

type ProxyResult = { status: number; data: unknown; headers?: Record<string, unknown | string[] | undefined> };

@Controller()
export class GatewayController {
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  @Get("/health")
  health(): { ok: boolean } {
    return { ok: true };
  }

  private async proxyTo(
    baseEnv: string,
    suffix: string,
    req: RawBodyRequest<Request>,
    body?: unknown,
  ): Promise<ProxyResult> {
    const upstream =
      typeof process.env[baseEnv] === "string" && process.env[baseEnv]!.length > 0
        ? process.env[baseEnv]!
        : this.config.get<string>(baseEnv);
    if (!upstream) throw new Error(`Missing env ${baseEnv}`);
    const url = new URL(`${upstream}${suffix}`);
    const q = req.query as Record<string, string>;
    Object.entries(q).forEach(([k, v]) => url.searchParams.set(k, String(v)));

    const method = req.method;
    const headers = { ...(req.headers as Record<string, string | undefined>) };
    delete headers["host"];

    try {
      const resp = await firstValueFrom(
        this.http.request({
          url: url.toString(),
          method,
          headers,
          data: method === "GET" || method === "HEAD" ? undefined : body,
          validateStatus: () => true,
        }),
      );
      return { status: resp.status, data: resp.data, headers: resp.headers as ProxyResult["headers"] };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { status: 502, data: { error: "bad_gateway", message: msg } };
    }
  }

  private flush(res: Response, r: ProxyResult): void {
    res.status(r.status);
    const h = r.headers ?? {};
    const allow = ["content-type", "content-length", "cache-control", "etag"];
    for (const [k, v] of Object.entries(h)) {
      if (!allow.includes(k.toLowerCase())) continue;
      if (typeof v === "string") res.setHeader(k, v);
      else if (Array.isArray(v) && typeof v[0] === "string") res.setHeader(k, v[0]);
    }
    res.send(r.data);
  }

  @UseGuards(ApiKeyGuard)
  @Post("/v1/search")
  async search(@Res() res: Response, @Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    const r = await this.proxyTo("SEARCH_ORCHESTRATOR_URL", "/v1/search", req, body);
    this.flush(res, r);
  }

  @UseGuards(ApiKeyGuard)
  @Get("/v1/autocomplete")
  async autocomplete(@Res() res: Response, @Req() req: RawBodyRequest<Request>) {
    const r = await this.proxyTo("SEARCH_ORCHESTRATOR_URL", "/v1/autocomplete", req);
    this.flush(res, r);
  }

  @UseGuards(ApiKeyGuard)
  @Post("/v1/agent/query")
  async agentQuery(@Res() res: Response, @Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    const r = await this.proxyTo("AGENT_SERVICE_URL", "/v1/agent/query", req, body);
    this.flush(res, r);
  }

  @UseGuards(ApiKeyGuard)
  @Post("/v1/analytics/events")
  async analytics(@Res() res: Response, @Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    const r = await this.proxyTo("ANALYTICS_SERVICE_URL", "/v1/analytics/events", req, body);
    this.flush(res, r);
  }

  @UseGuards(ApiKeyGuard)
  @Post("/v1/admin/feeds/presign")
  async feedsPresign(@Res() res: Response, @Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    const r = await this.proxyTo("CATALOG_INGESTION_URL", "/v1/admin/feeds/presign", req, body);
    this.flush(res, r);
  }

  @UseGuards(ApiKeyGuard)
  @Get("/v1/admin/feeds/jobs/:jobId")
  async feedsJob(@Res() res: Response, @Req() req: RawBodyRequest<Request>, @Param("jobId") jobId: string) {
    const upstream =
      typeof process.env.CATALOG_INGESTION_URL === "string" && process.env.CATALOG_INGESTION_URL.length > 0
        ? process.env.CATALOG_INGESTION_URL
        : this.config.get<string>("CATALOG_INGESTION_URL");
    if (!upstream) throw new Error("Missing env CATALOG_INGESTION_URL");
    const path = `/v1/admin/feeds/jobs/${encodeURIComponent(jobId)}`;
    const url = new URL(`${upstream}${path}`);
    const q = req.query as Record<string, string>;
    Object.entries(q).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    try {
      const hdrs = { ...(req.headers as Record<string, string | undefined>) };
      delete hdrs.host;
      delete hdrs.connection;
      delete hdrs["content-length"];

      const resp = await firstValueFrom(
        this.http.request({
          url: url.toString(),
          method: "GET",
          headers: hdrs,
          validateStatus: () => true,
        }),
      );
      const h = resp.headers ?? {};
      res.status(resp.status);
      for (const [k, v] of Object.entries(h)) {
        if (typeof v === "string") res.setHeader(k, v);
      }
      res.send(resp.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(502).json({ error: "bad_gateway", message: msg });
    }
  }

  @UseGuards(ApiKeyGuard)
  @Post("/v1/admin/feeds/import")
  async feedsImport(@Res() res: Response, @Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    const r = await this.proxyTo("CATALOG_INGESTION_URL", "/v1/admin/feeds/import", req, body);
    this.flush(res, r);
  }

  @UseGuards(ApiKeyGuard)
  @Post("/v1/internal/jobs/reindex")
  async reindex(@Res() res: Response, @Req() req: RawBodyRequest<Request>, @Body() body: unknown) {
    const r = await this.proxyTo("CATALOG_INGESTION_URL", "/v1/internal/jobs/reindex", req, body);
    this.flush(res, r);
  }
}
