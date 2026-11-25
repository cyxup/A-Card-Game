import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserPrincipal } from "../auth/session.js";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function requireUser(request: FastifyRequest): UserPrincipal {
  if (!request.principal || request.principal.kind !== "user") {
    throw new ApiError(401, "sign_in_required", "Sign in to do that.");
  }
  return request.principal;
}

export function badRequest(message: string, code = "bad_request"): never {
  throw new ApiError(400, code, message);
}

export function sendError(reply: FastifyReply, error: unknown): void {
  if (error instanceof ApiError) {
    reply.code(error.status).send({ error: error.message, code: error.code });
    return;
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  reply.code(500).send({ error: message, code: "server_error" });
}
