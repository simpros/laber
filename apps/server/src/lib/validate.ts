import * as v from "valibot";
import { HttpError } from "./errors";

export function parseBody<const S extends v.GenericSchema<unknown>>(
  schema: S,
  body: unknown
): v.InferOutput<S> {
  const result = v.safeParse(schema, body);
  if (!result.success) {
    const details = result.issues.map((issue) => issue.message).join("; ");
    throw new HttpError(400, `Invalid request body: ${details}`);
  }
  return result.output;
}
