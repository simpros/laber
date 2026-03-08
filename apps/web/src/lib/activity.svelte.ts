import type { Activity } from "$lib/server/activity";

let activities = $state<Activity[]>([]);
let open = $state(false);
let eventSource: EventSource | null = null;

function handleEvent(raw: MessageEvent) {
	const event = JSON.parse(raw.data);

	if (event.type === "init") {
		activities = event.activities;
		return;
	}

	if (event.type === "start") {
		const a: Activity = event.activity;
		activities = [a, ...activities].slice(0, 50);
		open = true;
		return;
	}

	if (event.type === "output") {
		activities = activities.map((a) =>
			a.id === event.id ? { ...a, output: a.output + event.chunk } : a,
		);
		return;
	}

	if (event.type === "finish") {
		activities = activities.map((a) =>
			a.id === event.id
				? { ...a, status: event.status, finishedAt: event.finishedAt }
				: a,
		);
	}
}

export const activityStore = {
	get activities() {
		return activities;
	},
	get open() {
		return open;
	},
	set open(v: boolean) {
		open = v;
	},
	get hasRunning() {
		return activities.some((a) => a.status === "running");
	},
	get runningCount() {
		return activities.filter((a) => a.status === "running").length;
	},
	connect() {
		if (eventSource) return;
		eventSource = new EventSource("/api/activity/stream");
		eventSource.addEventListener("init", handleEvent);
		eventSource.addEventListener("start", handleEvent);
		eventSource.addEventListener("output", handleEvent);
		eventSource.addEventListener("finish", handleEvent);
		eventSource.onerror = () => {
			eventSource?.close();
			eventSource = null;
			setTimeout(() => activityStore.connect(), 3000);
		};
	},
	disconnect() {
		eventSource?.close();
		eventSource = null;
	},
	clear() {
		activities = activities.filter((a) => a.status === "running");
	},
};
