#!/usr/bin/env node
/* Fetch Dirk Hoffmann's vAmiga test suite (https://github.com/dirkwhoffmann/vAmigaTS) into
 * tests/.cache/vAmigaTS as a sparse checkout of a pinned commit, then write tests/browser/suite.json.
 *
 *   node tests/tools/fetch-vamigats.mjs                    the CPU tests from GitHub
 *   node tests/tools/fetch-vamigats.mjs --from <dir>       clone from an existing local clone instead
 *   node tests/tools/fetch-vamigats.mjs --paths "CPU Agnus" other sparse paths
 *
 * Only the disk images, the 68000 reference screenshots and the sources are checked out
 * (about 1 GB instead of 1.7 GB with the photos). Tests without a <name>_68000.raw
 * reference (most CIA tests only have photos) do not end up in suite.json. */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT = "bdbc379862f5a1de6f5e9c8c298597c0079a4942"; /* 2026-09-23 */
const URL = "https://github.com/dirkwhoffmann/vAmigaTS.git";

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(here, "../.cache/vAmigaTS");
function arg(name, def) {
	const i = process.argv.indexOf("--" + name);
	return i < 0 || process.argv[i + 1] === undefined ? def : process.argv[i + 1];
}
const from = arg("from", "");
const paths = arg("paths", "CPU").split(/\s+/).filter(Boolean);
const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: "inherit" });

if (!fs.existsSync(path.join(dest, ".git"))) {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	if (from) git(["clone", "--no-checkout", "--shared", path.resolve(from), dest]);
	else git(["clone", "--filter=blob:none", "--no-checkout", "--sparse", URL, dest]);
}
const patterns = paths.flatMap((p) => ["*.adf", "*_68000.raw", "*.s"].map((x) => "/" + p + "/**/" + x));
git(["sparse-checkout", "set", "--no-cone", ...patterns], dest);
let have = true;
try { execFileSync("git", ["cat-file", "-e", COMMIT + "^{commit}"], { cwd: dest, stdio: "ignore" }); } catch { have = false; }
if (!have) git(["fetch", "origin", COMMIT], dest);
git(["-c", "advice.detachedHead=false", "checkout", "--force", COMMIT], dest);
execFileSync(process.execPath, [path.join(here, "gen-suite.mjs")], { stdio: "inherit" });
