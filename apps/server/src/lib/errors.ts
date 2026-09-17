export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Transport-agnostic domain errors. Libs throw these instead of `HttpError`
 * so the ops domain stays decoupled from the HTTP adapter; `app.ts`
 * maps them to statuses once at the edge.
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ActionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionFailedError";
  }
}
