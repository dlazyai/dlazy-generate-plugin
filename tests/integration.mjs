// Integration test — runs REAL dlazy generation. Costs credits.
// Run: node tests/integration.mjs
//
// Prerequisites:
//   1. npm install -g @dlazy/cli
//   2. dlazy login    (or set DLAZY_API_KEY env var)
//   3. Account has credits
//
// Uses grok-4.2 — the cheapest/simplest text-to-image model.

import entry from "../dist/index.js";

const registered = [];
entry.register({
	pluginConfig: {},
	registerTool(def) {
		registered.push(def);
	},
});
const tool = registered[0];

console.log("Calling dlazy_run with model=grok-4.2, prompt='a red apple on white background'");
console.log("Timeout: 120s. This will charge a small number of credits.\n");

const t0 = Date.now();
try {
	const result = await tool.execute("integration-1", {
		model: "grok-4.2",
		args: { prompt: "a red apple on white background" },
		timeoutSeconds: 120,
	});
	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
	const text = result.content[0].text;

	console.log(`Elapsed: ${elapsed}s\n`);
	console.log("Raw output:");
	console.log("---");
	console.log(text.slice(0, 1500));
	if (text.length > 1500) console.log(`... (${text.length - 1500} more chars)`);
	console.log("---\n");

	// Parse the dlazy JSON envelope (pretty-printed, spans multiple lines)
	let envelope;
	try {
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		envelope = JSON.parse(text.slice(start, end + 1));
	} catch {
		console.error("FAIL — could not parse dlazy JSON envelope from output");
		process.exit(1);
	}

	if (envelope.ok === false) {
		console.error(`FAIL — dlazy returned error: code=${envelope.code}, message=${envelope.message}`);
		if (envelope.code === "unauthorized") {
			console.error("→ Run `dlazy login` first, or set apiKey in plugin config.");
		} else if (envelope.code === "insufficient_balance") {
			console.error("→ Top up credits at https://dlazy.com/dashboard/organization/settings?tab=credits");
		}
		process.exit(1);
	}

	const outputs = envelope.result?.outputs || envelope.outputs || [];
	const firstUrl = outputs[0]?.url || outputs[0];
	console.log(`PASS — got ${outputs.length} output(s)`);
	if (firstUrl) console.log(`First URL: ${firstUrl}`);
	process.exit(0);
} catch (err) {
	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
	console.error(`FAIL after ${elapsed}s — ${err.message}`);
	process.exit(1);
}
