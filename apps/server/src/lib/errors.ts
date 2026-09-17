/**
 * Transport-agnostic domain errors. Libs throw these; only the HTTP adapter
 * (`app.ts`) knows what wire status each kind maps to. No numeric status
 * lives here by design — the ops domain must not carry HTTP notions.
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
 * A compose/git run failed. The full transcript already lives in the
 * deployment log and the activity stream, so the message stays short —
 * it is what the API returns as `{ error }`.
 */
export class ActionFailedError extends DomainError {
  constructor(message: string) {
    super(message, "action_failed");
    this.name = "ActionFailedError";
  }
}
