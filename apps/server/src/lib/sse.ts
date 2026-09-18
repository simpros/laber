const encoder = new TextEncoder();

export function encodeEvent(data: string): Uint8Array {
  return encoder.encode(`data: ${data}\n\n`);
}

export function encodeNamedEvent(type: string, data: string): Uint8Array {
  return encoder.encode(`event: ${type}\ndata: ${data}\n\n`);
}

export function encodeComment(comment: string): Uint8Array {
  return encoder.encode(`: ${comment}\n\n`);
}

function sseHeaders(): Record<string, string> {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}

/**
 * `cleanup` runs on client disconnect; producers also clean up when `enqueue` throws on a closed stream.
 */
export function sseResponse(
  start: (
    controller: ReadableStreamDefaultController<Uint8Array>,
    onCleanup: (fn: () => void) => void
  ) => void | Promise<void>
): Response {
  const cleanups: Array<() => void> = [];
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        // ignore cleanup errors
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const onCleanup = (fn: () => void) => {
        cleanups.push(fn);
      };
      try {
        const done = start(controller, onCleanup);
        if (done instanceof Promise) {
          done.catch(() => {
            cleanup();
            try {
              controller.close();
            } catch {
              // already closed
            }
          });
        }
      } catch {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
