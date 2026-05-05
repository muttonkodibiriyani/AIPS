import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HttpModule } from "@nestjs/axios";
import { GatewayController } from "./gateway.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env", "../../../.env"] }),
    HttpModule.register({ timeout: 30_000, maxRedirects: 0 }),
  ],
  controllers: [GatewayController],
})
export class AppModule {}
