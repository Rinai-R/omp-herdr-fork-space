# omp-herdr-fork-space

An [omp](https://omp.sh) extension for the [Herdr](https://herdr.dev) desktop app: typing a bare `/fork` opens a new Herdr space running `omp --fork <current session>`, switches to it, and leaves the parent session running where it was.

## Behavior

- `/fork` is intercepted only in a herdr-core terminal, the kind the Herdr desktop app runs (`HC_TERMINAL_ID` is set). Everywhere else omp's built-in `/fork` runs unchanged.
- The new space starts in the parent's folder, is named after the parent's space with ` (fork)` appended (for example `水印 (fork)`), and is shown at once. It is created with `herdr-app do space.new`, so the Herdr window must be running. If the parent's space can't be read, Herdr names the new space itself.
- Streaming sessions ask for confirmation first; in-memory sessions and vibe mode are rejected.
- `--profile` and the `PI_CONFIG_*`/XDG scope variables are passed to the child. A herdr-core terminal takes its environment from the core, so they are set with `env K=V` in front of the command.
- `/fork tab`, `/fork window` and `/fork pane` keep omp's built-in behavior.

## Install

From git:

```sh
omp plugin install github:Rinai-R/omp-herdr-fork-space
```

Or clone and link a local checkout:

```sh
git clone https://github.com/Rinai-R/omp-herdr-fork-space
omp plugin link ./omp-herdr-fork-space
```

Restart omp (or run `/restart`) after installing.

## Notes

- TypeScript extension module loaded directly by omp's Bun runtime; no build step.
- Needs `herdr-app` on `PATH` (the Herdr installer puts it in `~/.local/bin`).

## Release

Pushing a `v*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml): it checks the tag against `package.json`, smoke-tests the extension with Bun, publishes to npm with provenance, and creates the GitHub release.

```sh
git tag v0.1.0
git push origin v0.1.0
```

The workflow needs `NPM_TOKEN` as an Actions secret (or variable). Bump `package.json` before tagging; a mismatched tag fails the run.
