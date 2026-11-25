import type { Principal } from "./auth/session.js";

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
    sessionToken: string | null;
  }
}
