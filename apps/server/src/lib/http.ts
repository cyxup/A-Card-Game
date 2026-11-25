import type { FastifyRequest } from "fastify";
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

export function requireOwner(request: FastifyRequest): UserPrincipal {
  const principal = requireUser(request);
  if (!principal.user.isOwner) {
    throw new ApiError(403, "owner_only", "Owner only.");
  }
  return principal;
}

export function badRequest(message: string, code = "bad_request"): never {
  throw new ApiError(400, code, message);
}
