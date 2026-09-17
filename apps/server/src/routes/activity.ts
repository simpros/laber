import { Elysia } from "elysia";
import { subscribe } from "../lib/activity";
import { sseResponse, encodeNamedEvent, encodeComment } from "../lib/sse";

export const activityRoutes = new Elysia().get("/api/activity/stream", () => {
  return sseResponse((controller, onCleanup) => {
    const unsubscribe = subscribe((event) => {
      try {
        controller.enqueue(
          encodeNamedEvent(event.type, JSON.stringify(event))
        );
      } catch {
        unsubscribe();
      }
    });
    onCleanup(unsubscribe);

    controller.enqueue(encodeComment("connected"));

    const check = setInterval(() => {
      try {
        controller.enqueue(encodeComment("ping"));
      } catch {
        clearInterval(check);
        unsubscribe();
      }
    }, 30000);
    onCleanup(() => clearInterval(check));
  });
});
