import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable } from "rxjs";

/** Stub: accepts Bearer tokens starting with pk_ or sk_; dev mode allows missing auth. */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
    const dev = this.config.get<string>("COMMERCE_AI_DEV_MODE") === "true";
    const raw = req.headers?.authorization ?? "";
    const token = raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";

    if (dev && !token) {
      (req as { tenantId?: string }).tenantId = "demo";
      return true;
    }
    if (!token || (!token.startsWith("pk_") && !token.startsWith("sk_"))) {
      throw new UnauthorizedException("Invalid or missing API key");
    }
    (req as { tenantId?: string }).tenantId = this.stubTenantFromKey(token);
    return true;
  }

  private stubTenantFromKey(_key: string): string {
    return "tenant_stub";
  }
}
