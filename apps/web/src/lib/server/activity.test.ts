import { describe, it, expect, mock } from "bun:test";
import {
  createActivity,
  appendOutput,
  finishActivity,
  subscribe,
} from "./activity";

describe("createActivity", () => {
  it("creates an activity with running status", () => {
    const activity = createActivity("Deploy stack");
    expect(activity.title).toBe("Deploy stack");
    expect(activity.status).toBe("running");
    expect(activity.output).toBe("");
    expect(activity.id).toBeDefined();
    expect(activity.startedAt).toBeGreaterThan(0);
  });

  it("generates unique IDs for each activity", () => {
    const a1 = createActivity("First");
    const a2 = createActivity("Second");
    expect(a1.id).not.toBe(a2.id);
  });
});

describe("appendOutput", () => {
  it("appends output to an existing activity", () => {
    const activity = createActivity("Test");
    appendOutput(activity.id, "line 1\n");
    appendOutput(activity.id, "line 2\n");
    expect(activity.output).toBe("line 1\nline 2\n");
  });

  it("does nothing for non-existent activity ID", () => {
    expect(() => appendOutput("nonexistent-id", "data")).not.toThrow();
  });
});

describe("finishActivity", () => {
  it("sets activity status to success", () => {
    const activity = createActivity("Test");
    finishActivity(activity.id, "success");
    expect(activity.status).toBe("success");
    expect(activity.finishedAt).toBeDefined();
  });

  it("sets activity status to error", () => {
    const activity = createActivity("Test");
    finishActivity(activity.id, "error");
    expect(activity.status).toBe("error");
  });

  it("does nothing for non-existent activity ID", () => {
    expect(() => finishActivity("nonexistent-id", "success")).not.toThrow();
  });
});

describe("subscribe", () => {
  it("returns an unsubscribe function", () => {
    const listener = mock(() => {});
    const unsubscribe = subscribe(listener);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  it("sends init event with existing activities on subscribe", () => {
    createActivity("Existing");

    const listener = mock(() => {});
    const unsubscribe = subscribe(listener);

    const calls = listener.mock.calls as unknown[][];
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const initEvent = calls[0][0] as { type: string; activities: unknown[] };
    expect(initEvent.type).toBe("init");
    expect(initEvent.activities.length).toBeGreaterThanOrEqual(1);

    unsubscribe();
  });

  it("broadcasts start events to subscribers", () => {
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    const unsubscribe = subscribe(listener);

    createActivity("New activity");

    const startEvent = events.find(
      (e: unknown) => (e as { type: string }).type === "start"
    ) as { type: string; activity: { title: string } } | undefined;
    expect(startEvent).toBeDefined();
    expect(startEvent!.activity.title).toBe("New activity");

    unsubscribe();
  });

  it("broadcasts output events to subscribers", () => {
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    const unsubscribe = subscribe(listener);

    const activity = createActivity("Test");
    appendOutput(activity.id, "hello");

    const outputEvent = events.find(
      (e: unknown) => (e as { type: string }).type === "output"
    ) as { type: string; id: string; chunk: string } | undefined;
    expect(outputEvent).toBeDefined();
    expect(outputEvent!.chunk).toBe("hello");

    unsubscribe();
  });

  it("broadcasts finish events to subscribers", () => {
    const events: unknown[] = [];
    const listener = (event: unknown) => events.push(event);
    const unsubscribe = subscribe(listener);

    const activity = createActivity("Test");
    finishActivity(activity.id, "success");

    const finishEvent = events.find(
      (e: unknown) => (e as { type: string }).type === "finish"
    ) as { type: string; id: string; status: string } | undefined;
    expect(finishEvent).toBeDefined();
    expect(finishEvent!.status).toBe("success");

    unsubscribe();
  });

  it("stops receiving events after unsubscribe", () => {
    const listener = mock(() => {});
    const unsubscribe = subscribe(listener);
    const callCountAfterSubscribe = listener.mock.calls.length;

    unsubscribe();
    createActivity("After unsub");

    expect(listener.mock.calls.length).toBe(callCountAfterSubscribe);
  });
});
