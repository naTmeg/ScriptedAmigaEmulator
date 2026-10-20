# Tests

Three kinds of checks, all runnable locally and in CI (`.github/workflows/tests.yml`).
Downloaded test data goes to `tests/.cache/`, results to `tests/results/`; both are ignored by git.

## Lint

`npm run lint` runs ESLint over the emulator scripts, the pages and the test tools.
The emulator files are classic scripts that share their top-level names, so
`eslint.config.js` collects those names from all files and offers them to each file as globals.
That way `no-undef` finds typos and accidental globals across files.

Findings that existed when linting was introduced are recorded in `eslint-suppressions.json`
and do not fail the run; a new finding does. After fixing some of them, shrink the list with
`npx eslint . --prune-suppressions`.

## CPU single-step tests (Node)

`tests/cpu/run-sst.mjs` runs the [SingleStepTests 68000 corpus](https://github.com/SingleStepTests/680x0)
against SAE's real CPU core. `tests/cpu/sae-cpu-node.mjs` loads the emulator scripts into a
Node `vm` context with a flat 16 MB memory and stubs for the rest of the machine. Each test sets
registers, SR, PC, prefetch queue and RAM, executes one instruction and compares registers,
SR, PC and RAM. Bus cycles and timing are not compared.

    npm run test:cpu                        # first 200 tests of each of the 125 files
    npm run test:cpu:full                   # all ~1 M tests
    node tests/cpu/run-sst.mjs --only ROXL --show 5
    npm run test:cpu:check                  # exit 1 if a file fails more tests than in sst-baseline.json

The first run downloads the corpus (about 193 MB). `tests/cpu/sst-baseline.json` holds the
failure count per file. When a fix makes tests pass, update it with
`node tests/cpu/run-sst.mjs --write-baseline`.

Address errors need care. For the cases that vAmigaTS checks against photos of a real A500
(`CPU/Exceptions/StackFrame/addrerr1-10`), the corpus expects a different stacked PC (2 or 4
less) and, for MOVE to -(An), a different IR word than the hardware shows; SAE follows the
hardware. Most address-error failures are therefore not SAE bugs. To look at the rest:

    node tests/cpu/run-sst.mjs --ae-ignore-pc                     # leave the stacked PC out
    node tests/cpu/run-sst.mjs --ae-ignore-pc --show 5 --kind ae  # print expected and actual frames
    node tests/cpu/run-sst.mjs --limit 0 --ae-report              # stacked PC per instruction and mode

## vAmigaTS screenshot tests (browser)

[vAmigaTS](https://github.com/dirkwhoffmann/vAmigaTS) contains small Amiga programs with a
reference screenshot from vAmiga (`<name>_68000.raw`, which matches photos of a real A500).

- `npm run fetch:vamigats` clones the test disks at a pinned commit into `tests/.cache/vAmigaTS`
  and writes `tests/browser/suite.json`.
- `tests/browser/run.htm?adf=<path>` boots one disk with the AROS ROM (`harness.js`).
- `tests/browser/suite.htm` runs a list of tests in an iframe and compares SAE's picture with the
  reference pixel by pixel, searching for the best offset.
- `npm run test:browser` (`tests/run-suite.mjs`) serves the repository, opens `suite.htm` in
  headless Chromium via Playwright in several pages at once, and compares the scores with
  `tests/browser-baseline.json`. `--check` exits 1 if a score drops by more than 0.5 points.

Runs are reproducible: `turbo=1` switches off frame pacing and the host-clock TOD hack
(`cfg.debug.turbo`), `det=1` (`determinism.js`) seeds `Math.random` and fixes the clock, and
`stopframe=N` pauses the emulator after exactly N frames (and skips drawing the frames
before). Two runs give the same scores, also with a different number of parallel pages.

    node tests/run-suite.mjs --filter "CPU/Misc|CPU/Prefetch" --jobs 4
    node tests/run-suite.mjs --write-baseline       # after an intended change
    node tests/run-suite.mjs --headed               # watch it

Defaults: compatible CPU core (only that core raises address errors), A500, 1200 frames,
2D canvas output (`video=canvas`). With WebGL, all headless pages wait on Chromium's single
software-rendering GPU process; the canvas gives the same pixels and scales with the cores.
Each page gets its own browser context, so it runs in its own renderer process. The full
suite (507 tests) takes about 6 minutes with 16 pages, a single test about 8 seconds.

Most tests score between 85 and 98 %, rarely 99.5 % or more: SAE is not cycle-exact, so
timing tests show slightly different bars. The baseline is there to catch changes, not to
grade the emulator.
Scores are only a rough measure. The StackFrame tests color the whole screen green or red
depending on one value, so a single wrong word gives a score near 0. The reference also
expects Kickstart 1.3 with 512 KB chip RAM, so values derived from the stack pointer differ
under AROS. Open `run.htm` directly and read the screen for those.

For manual runs, open `suite.htm` from any static web server rooted at the repository, e.g.
`suite.htm?filter=CPU/Misc&frames=1200&turbo=1&det=1&compat=1`.
