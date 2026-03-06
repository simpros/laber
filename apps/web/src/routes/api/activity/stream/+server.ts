import { subscribe } from "$lib/server/activity";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = () => {
	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		start(controller) {
			const unsubscribe = subscribe((event) => {
				try {
					controller.enqueue(
						encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
					);
				} catch {
					unsubscribe();
				}
			});

			controller.enqueue(encoder.encode(": connected\n\n"));

			void new Promise<void>((resolve) => {
				const check = setInterval(() => {
					try {
						controller.enqueue(encoder.encode(": ping\n\n"));
					} catch {
						clearInterval(check);
						unsubscribe();
						resolve();
					}
				}, 30000);
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		},
	});
};
