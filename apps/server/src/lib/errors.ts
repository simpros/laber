/**
 * Transport-agnostic domain errors: only the HTTP adapter (`app.ts`) maps
 * each kind to a wire status — no numerics live here.
 */
export type DomainErrorKind =
  | "not_found"
  | "conflict"
  | "validation"
  | "action_failed";

export class DomainError extends Error {
  readonly kind: DomainErrorKind;

  constructor(message: string, kind: DomainErrorKind) {
    super(message);
    this.name = "DomainError";
    this.kind = kind;
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, "not_found");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "conflict");
    this.name = "ConflictError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "validation");
    this.name = "ValidationError";
  }
}

/**
 * The transcript already lives in the deployment log and activity stream, so the message stays short.
 */
export class ActionFailedError extends DomainError {
  constructor(message: string) {
    super(message, "action_failed");
    this.name = "ActionFailedError";
  }
}
