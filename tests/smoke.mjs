// Smoke test for the dlazy-generate code-plugin.
// Run: node tests/smoke.mjs
//
// Validates:
//   1. dist/index.js loads, default export has correct shape (id, register).
//   2. register(api) successfully registers exactly one tool: dlazy_run.
//   3. Missing `model` is rejected.
//   4. Invoking `dlazy_run` with model="--version" returns dlazy's version envelope (requires dlazy on PATH).
//
// To skip step 4 (no CLI installed): SKIP_CLI=1 node tests/smoke.mjs

import { execSync } from "node:child_process";
import entry from "../dist/index.js";

let passed = 0;
let failed = 0;

function check(name, fn) {
	return Promise.resolve()
		.then(fn)
		.then(() => {
			console.log(`  PASS  ${name}`);
			passed++;
		})
		.catch((err) => {
			console.log(`  FAIL  ${name}`);
			console.log(`        ${err.message}`);
			failed++;
		});
}

function assert(cond, msg) {
	if (!cond) throw new Error(msg);
}

async function main() {
	console.log("dlazy-generate plugin smoke test\n");

	// --- 1. Plugin entry shape ---
	await check("entry exports id/name/description", () => {
		assert(entry.id === "dlazy-generate", `id was ${entry.id}`);
		assert(typeof entry.name === "string");
		assert(typeof entry.description === "string");
		assert(typeof entry.register === "function");
	});

	// --- 2. Tool registration ---
	const registered = [];
	const fakeApi = {
		pluginConfig: {},
		registerTool(def, _opts) {
			registered.push(def);
		},
	};
	await check("register(api) registers exactly one tool", () => {
		entry.register(fakeApi);
		assert(registered.length === 1, `got ${registered.length} tools`);
		assert(registered[0].name === "dlazy_run", `name=${registered[0].name}`);
		assert(typeof registered[0].execute === "function");
	});

	const tool = registered[0];

	// --- 3. Missing model is rejected ---
	await check("execute rejects when model is missing", async () => {
		let threw = false;
		try {
			await tool.execute("test-1", {});
		} catch (e) {
			threw = e.message.includes("model");
		}
		assert(threw, "expected error mentioning 'model'");
	});

	// --- 4. Real CLI roundtrip ---
	if (process.env.SKIP_CLI) {
		console.log("\n  SKIP  dlazy --version roundtrip (SKIP_CLI=1)");
	} else {
		let cliAvailable = false;
		try {
			execSync("dlazy --version", { stdio: "ignore" });
			cliAvailable = true;
		} catch {
			console.log(
				"\n  SKIP  dlazy not on PATH — install with `npm install -g @dlazy/cli` to run CLI tests",
			);
		}
		if (cliAvailable) {
			await check("execute spawns dlazy and captures stdout (--version)", async () => {
				const result = await tool.execute("test-2", { model: "--version" });
				assert(Array.isArray(result.content), "missing content array");
				assert(result.content[0]?.type === "text", "expected text content");
				const text = result.content[0].text;
				assert(text && text.length > 0, "empty output");
				// dlazy --version typically prints a semver-like string
				assert(/\d+\.\d+/.test(text), `unexpected output: ${text.slice(0, 200)}`);
			});
		}
	}

	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error("Test runner crashed:", err);
	process.exit(2);
});
