import { describe, it, expect } from "bun:test";
import { unwrap, ApiError } from "./api";

describe("unwrap", () => {
  it("returns data on success", () => {
    expect(unwrap({ data: { ok: true }, error: null })).toEqual({
      ok: true,
    });
  });

  it("throws ApiError with the server message", () => {
    try {
      unwrap({
        data: null,
        error: { status: 400, value: { error: "Invalid request" } },
      });
      expect(false).toBe(true);
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).message).toBe("Invalid request");
      expect((e as ApiError).status).toBe(400);
    }
  });

  it("throws ApiError with a fallback message", () => {
    try {
      unwrap({ data: null, error: { status: 500, value: null } });
      expect(false).toBe(true);
    } catch (e) {
      expect((e as ApiError).message).toBe("Request failed");
    }
  });
});
