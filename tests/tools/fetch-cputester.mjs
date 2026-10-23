#!/usr/bin/env node
/* Fetch the cputester disks (Toni Wilen's CPU tests, checked on real 68000s; collected as
 * ADFs by Dirk Hoffmann in the Moira repository) into tests/.cache/cputester-src as a sparse
 * checkout of a pinned commit.
 *
 *   node tests/tools/fetch-cputester.mjs                 the "address" set from GitHub
 *   node tests/tools/fetch-cputester.mjs --sets "address basic"
 *   node tests/tools/fetch-cputester.mjs --from <dir>    clone from a local Moira clone */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT = "ce28239b0507ebfe1bf2ad2b9c9252dc2f2cc031"; /* 2026-09-23 */
const URL = "https://github.com/dirkwhoffmann/Moira.git";
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.resolve(here, "../.cache/cputester-src");
const arg = (n, d) => { const i = process.argv.indexOf("--" + n); return i < 0 || process.argv[i + 1] === undefined ? d : process.argv[i + 1]; };
const from = arg("from", "");
const sets = arg("sets", "address").split(/\s+/).filter(Boolean);
const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: "inherit" });

if (!fs.existsSync(path.join(dest, ".git"))) {
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	if (from) git(["clone", "--no-checkout", "--shared", path.resolve(from), dest]);
	else git(["clone", "--filter=blob:none", "--no-checkout", "--sparse", URL, dest]);
}
git(["sparse-checkout", "set", "--no-cone", ...sets.map((s) => "/Cputester/ADF/" + s + "/")], dest);
let have = true;
try { execFileSync("git", ["cat-file", "-e", COMMIT + "^{commit}"], { cwd: dest, stdio: "ignore" }); } catch { have = false; }
if (!have) git(["fetch", "--depth", "1", "origin", COMMIT], dest);
git(["-c", "advice.detachedHead=false", "checkout", "--force", COMMIT], dest);
console.log("cputester disks in " + path.relative(process.cwd(), path.join(dest, "Cputester/ADF")));
