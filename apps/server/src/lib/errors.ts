/**
 * Transport-agnostic domain errors. Libs throw these instead of HTTP
 * statuses so the ops domain stays decoupled from the HTTP adapter;
 * `app.ts` maps them to statuses once at the edge via `status`.
 */
export class DomainError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409);
    this.name = "ConflictError";
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400);
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
    super(message, 500);
    this.name = "ActionFailedError";
  }
}
