import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";

/**
 * Turn a bare `/fork` into "fork this session into a new Herdr space".
 *
 * Inside a herdr-core terminal (the Herdr desktop app's, `HC_TERMINAL_ID`
 * set), the child `omp --fork <session>` starts in a new space through
 * `herdr-app do space.new`, and the parent session keeps running here.
 * Everywhere else the handler declines and omp's built-in `/fork` runs.
 */

const HERDR_APP_TIMEOUT_MS = 15_000;

const SCOPE_ENV_KEYS = [
	"PI_CODING_AGENT_DIR",
	"PI_CONFIG_DIR",
	"PI_CONFIG_FILES",
	"PI_CODING_AGENT_SESSION_DIR",
	"XDG_DATA_HOME",
	"XDG_STATE_HOME",
	"XDG_CACHE_HOME",
	"OMP_PROFILE",
	"PI_PROFILE",
] as const;

/** Whether this process runs in a herdr-core terminal (the Herdr desktop app's). */
export function isHerdrCoreHost(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.HC_TERMINAL_ID);
}

function scopeEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
	const scope: Record<string, string | undefined> = {};
	for (const key of SCOPE_ENV_KEYS) scope[key] = env[key];
	return scope;
}

/** The name a fork's space gets: the parent space's name, marked as a fork. */
export function forkName(parent: string): string {
	return `${parent} (fork)`;
}

/**
 * The name of the Herdr space showing `terminal`, from `herdr-app ls`.
 * Undefined when the window doesn't list it (a terminal on another machine,
 * or one not in any tab).
 */
export function spaceNameOf(ls: unknown, terminal: string): string | undefined {
	const spaces = (ls as { spaces?: { name?: string; tabs?: { terminals?: { terminal?: string }[] }[] }[] })?.spaces;
	for (const space of spaces ?? []) {
		for (const tab of space.tabs ?? []) {
			if (tab.terminals?.some(t => t.terminal === terminal)) return space.name || undefined;
		}
	}
	return undefined;
}

/**
 * The `space.new` arguments for a fork: the child runs in the parent's folder,
 * named after the parent's space when it has one, and the new space is shown.
 * A herdr-core terminal gets its environment from the core, not from this
 * process, so the scope variables ride on `env K=V … omp`.
 */
export function spaceArgs(
	argv: readonly string[],
	cwd: string,
	env: Readonly<Record<string, string | undefined>>,
	parentName?: string,
): { name?: string; folder: string; argv: string[]; focus: true } {
	const assignments = Object.entries(env)
		.filter((entry): entry is [string, string] => Boolean(entry[1]))
		.map(([key, value]) => `${key}=${value}`);
	return {
		...(parentName ? { name: forkName(parentName) } : {}),
		folder: cwd,
		argv: assignments.length > 0 ? ["/usr/bin/env", ...assignments, ...argv] : [...argv],
		focus: true,
	};
}

/** The parent's space name; undefined when it can't be read (the fork still opens, named by Herdr). */
async function parentSpaceName(pi: Pick<ExtensionAPI, "exec">): Promise<string | undefined> {
	const terminal = process.env.HC_TERMINAL_ID;
	if (!terminal) return undefined;
	const result = await pi.exec("herdr-app", ["ls"], { timeout: HERDR_APP_TIMEOUT_MS });
	if (result.code !== 0) return undefined;
	try {
		return spaceNameOf(JSON.parse(result.stdout), terminal);
	} catch {
		return undefined;
	}
}

/** Open a fork of the current session in a new Herdr space. */
export async function openForkSpace(
	pi: Pick<ExtensionAPI, "exec">,
	ctx: Pick<ExtensionContext, "cwd" | "sessionManager">,
): Promise<void> {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) {
		throw new Error("this session is not persisted, so it cannot be forked");
	}
	const source = resolve(sessionFile);
	await access(source);

	const profile = process.env.OMP_PROFILE || process.env.PI_PROFILE || undefined;
	const argv = [process.execPath];
	if (profile) argv.push("--profile", profile);
	argv.push("--fork", source);

	const args = spaceArgs(argv, ctx.cwd, scopeEnv(process.env), await parentSpaceName(pi));
	const result = await pi.exec("herdr-app", ["do", "space.new", JSON.stringify(args)], { timeout: HERDR_APP_TIMEOUT_MS });
	if (result.code !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || `herdr-app exited with code ${result.code}`);
	}
	// herdr-app answers with JSON; a refused command says `ok: false`.
	let answer: { ok?: boolean; error?: string } | undefined;
	try {
		answer = JSON.parse(result.stdout);
	} catch {
		answer = undefined;
	}
	if (answer?.ok === false) throw new Error(answer.error || "herdr-app refused space.new");
}

export default function herdrForkSpace(pi: ExtensionAPI): void {
	pi.setLabel("Herdr /fork space");

	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive" || ctx.mode !== "tui") return;
		if (event.text.trim() !== "/fork") return;
		if (!isHerdrCoreHost()) return;

		const modes = ctx.sessionModes?.getState();
		if (modes?.vibe === "active") {
			ctx.ui.notify("Leave vibe mode before forking.", "warning");
			return { handled: true };
		}

		if (!ctx.isIdle()) {
			const confirmed = await ctx.ui.confirm(
				"Fork while a response is running?",
				"The new space may miss the partial response. The current session keeps running here.",
			);
			if (!confirmed) return { handled: true };
		}

		try {
			await openForkSpace(pi, ctx);
			ctx.ui.notify("Forked into a new Herdr space.", "info");
		} catch (error) {
			pi.logger.error("herdr-fork-space: failed to open the fork", { error });
			ctx.ui.notify(`Could not open the fork in a new space: ${error instanceof Error ? error.message : String(error)}`, "error");
		}
		return { handled: true };
	});
}
