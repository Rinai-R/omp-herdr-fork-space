// Smoke test: loads the extension with Bun and checks its pure helpers.
// Run by CI on every push and by the release workflow before publishing.
import * as mod from "../index.ts";

function check(ok: unknown, what: string): void {
	if (!ok) throw new Error(what);
}

check(typeof mod.default === "function", "missing default extension factory");

check(mod.isHerdrCoreHost({ HC_TERMINAL_ID: "t1" }), "herdr-core detection failed");
check(!mod.isHerdrCoreHost({ TERM_PROGRAM: "ghostty" }), "plain Ghostty must not count as herdr-core");

const args = mod.spaceArgs(["omp", "--fork", "/s.jsonl"], "/w", { XDG_DATA_HOME: "/x", OMP_PROFILE: undefined });
check(args.folder === "/w", `folder wrong: ${args.folder}`);
check(args.argv.join(" ") === "/usr/bin/env XDG_DATA_HOME=/x omp --fork /s.jsonl", `argv wrong: ${JSON.stringify(args.argv)}`);
check(!("name" in args), "a fork without a parent name must let Herdr name the space");

const named = mod.spaceArgs(["omp"], "/w", {}, "水印");
check(named.name === "水印 (fork)", `fork name wrong: ${named.name}`);
check(named.argv.join(" ") === "omp", `argv without scope vars wrong: ${JSON.stringify(named.argv)}`);

const ls = { spaces: [{ name: "水印", tabs: [{ terminals: [{ terminal: "t3" }] }] }] };
check(mod.spaceNameOf(ls, "t3") === "水印", "space lookup failed");
check(mod.spaceNameOf(ls, "t9") === undefined, "an unknown terminal must have no space");
check(mod.spaceNameOf({}, "t3") === undefined, "an empty listing must have no space");

console.log("smoke ok");
