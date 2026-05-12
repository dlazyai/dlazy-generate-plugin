import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { runCommandWithTimeout } from "openclaw/plugin-sdk/process-runtime";

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_RESULT_CHARS = 60_000;

type PluginConfig = {
	command?: string;
	apiKey?: string;
	timeoutMs?: number;
};

type CliResult = {
	stdout: string;
	stderr: string;
	exitCode: number;
};

function optionalString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function optionalTimeoutMs(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 1_000)
		return undefined;
	return value;
}

function normalizePluginConfig(value: unknown): PluginConfig {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const record = value as Record<string, unknown>;
	return {
		command: optionalString(record.command),
		apiKey: optionalString(record.apiKey),
		timeoutMs: optionalTimeoutMs(record.timeoutMs),
	};
}

function configuredCommand(config: PluginConfig): string {
	return config.command || "dlazy";
}

function configuredTimeoutMs(
	config: PluginConfig,
	timeoutSeconds?: number,
): number {
	if (
		typeof timeoutSeconds === "number" &&
		Number.isFinite(timeoutSeconds) &&
		timeoutSeconds >= 1
	) {
		return Math.min(Math.max(timeoutSeconds, 1), 1800) * 1_000;
	}
	if (config.timeoutMs) return config.timeoutMs;
	return DEFAULT_TIMEOUT_MS;
}

function truncate(value: string): string {
	if (value.length <= MAX_RESULT_CHARS) return value;
	return `${value.slice(0, MAX_RESULT_CHARS)}\n\n[truncated ${value.length - MAX_RESULT_CHARS} chars]`;
}

function flagify(args: Record<string, unknown>): string[] {
	const out: string[] = [];
	for (const [key, value] of Object.entries(args)) {
		if (value === undefined || value === null) continue;
		const flag = key.startsWith("-") ? key : `--${key}`;
		if (typeof value === "boolean") {
			if (value) out.push(flag);
			continue;
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item === undefined || item === null) continue;
				out.push(flag, String(item));
			}
			continue;
		}
		out.push(flag, String(value));
	}
	return out;
}

async function runDlazy(
	config: PluginConfig,
	args: string[],
	timeoutSeconds?: number,
): Promise<CliResult> {
	const command = configuredCommand(config);
	const timeoutMs = configuredTimeoutMs(config, timeoutSeconds);
	const env = { ...process.env };
	if (config.apiKey) env.DLAZY_API_KEY = config.apiKey;

	const result = await runCommandWithTimeout([command, ...args], {
		timeoutMs,
		env,
	});

	if (result.termination === "timeout") {
		throw new Error(`dlazy command timed out after ${timeoutMs}ms`);
	}

	return {
		stdout: result.stdout,
		stderr: result.stderr,
		exitCode: result.code ?? 1,
	};
}

function textResult(text: string) {
	return {
		content: [{ type: "text" as const, text }],
		details: {},
	};
}

export default definePluginEntry({
	id: "dlazy-generate",
	name: "dLazy Generate",
	description:
		"Run any @dlazy/cli generation model (image, video, audio, composite). Wraps the dlazy CLI as a single tool.",
	register(api) {
		const config = normalizePluginConfig(api.pluginConfig);

		api.registerTool({
			name: "dlazy_run",
			label: "Run dLazy generator",
			description:
				"Invoke the dlazy CLI. Pass the model name (e.g. 'veo-3.1', 'seedream-4.5', 'suno-music') and an args object whose keys become CLI flags (e.g. { prompt: '...', image: 'url' }). Boolean true emits a bare flag; arrays repeat the flag. Returns the JSON envelope printed by dlazy on stdout. Run `dlazy <model> -h` for per-model flags.",
			parameters: Type.Object({
				model: Type.String({
					description:
						"dlazy model/subcommand, e.g. 'veo-3.1', 'seedream-4.5', 'kling-v3', 'suno-music', 'one-click-generation'.",
				}),
				args: Type.Optional(
					Type.Record(Type.String(), Type.Any(), {
						description:
							"Object whose keys are CLI flag names (without leading --). Values: string/number become '--key value'; true emits '--key'; arrays repeat the flag.",
					}),
				),
				timeoutSeconds: Type.Optional(
					Type.Number({
						minimum: 1,
						maximum: 1800,
						description: "Per-call timeout in seconds. Default 300.",
					}),
				),
			}),
			async execute(_id, params) {
				const record = (params || {}) as Record<string, unknown>;
				const model = optionalString(record.model);
				if (!model) throw new Error("Missing required parameter: model");
				const argsObj =
					record.args && typeof record.args === "object" && !Array.isArray(record.args)
						? (record.args as Record<string, unknown>)
						: {};
				const timeoutSeconds =
					typeof record.timeoutSeconds === "number" ? record.timeoutSeconds : undefined;

				const cliArgs = [model, ...flagify(argsObj)];
				const result = await runDlazy(config, cliArgs, timeoutSeconds);

				const text =
					result.exitCode === 0
						? result.stdout.trim() || result.stderr.trim() || "OK"
						: [result.stdout.trim(), result.stderr.trim()]
								.filter(Boolean)
								.join("\n\n") || `dlazy exited with status ${result.exitCode}`;
				return textResult(truncate(text));
			},
		});
	},
});
