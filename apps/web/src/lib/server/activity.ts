export type Activity = {
	id: string;
	title: string;
	status: "running" | "success" | "error";
	output: string;
	startedAt: number;
	finishedAt?: number;
};

type ActivityEvent =
	| { type: "init"; activities: Activity[] }
	| { type: "start"; activity: Activity }
	| { type: "output"; id: string; chunk: string }
	| { type: "finish"; id: string; status: "success" | "error"; finishedAt: number };

type Listener = (event: ActivityEvent) => void;

const MAX_ACTIVITIES = 50;

const activities: Activity[] = [];
const listeners = new Set<Listener>();

function broadcast(event: ActivityEvent) {
	for (const listener of listeners) {
		try {
			listener(event);
		} catch {
			listeners.delete(listener);
		}
	}
}

export function createActivity(title: string): Activity {
	const activity: Activity = {
		id: crypto.randomUUID(),
		title,
		status: "running",
		output: "",
		startedAt: Date.now(),
	};
	activities.unshift(activity);
	if (activities.length > MAX_ACTIVITIES) activities.pop();
	broadcast({ type: "start", activity: { ...activity } });
	return activity;
}

export function appendOutput(id: string, chunk: string) {
	const activity = activities.find((a) => a.id === id);
	if (!activity) return;
	activity.output += chunk;
	broadcast({ type: "output", id, chunk });
}

export function finishActivity(id: string, status: "success" | "error") {
	const activity = activities.find((a) => a.id === id);
	if (!activity) return;
	activity.status = status;
	activity.finishedAt = Date.now();
	broadcast({ type: "finish", id, status, finishedAt: activity.finishedAt });
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	const running = activities.filter((a) => a.status === "running");
	if (running.length > 0 || activities.length > 0) {
		listener({ type: "init", activities: activities.map((a) => ({ ...a })) });
	}
	return () => listeners.delete(listener);
}
