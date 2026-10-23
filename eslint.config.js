/* ESLint setup for SAE.
 *
 * The emulator is a set of classic browser scripts (no modules). Every file declares its
 * SAEV_* / SAER_* / SAEC_* / SAEF_* names at top level and uses those of the other files.
 * To let no-undef find real mistakes (typos, implicit globals), the top-level declarations
 * of all emulator scripts are collected here and offered to every file as globals.
 *
 * Findings that were already in the code when linting was introduced are listed in
 * eslint-suppressions.json (see IMPROVEMENTS.md). They do not fail `npm run lint`, new ones do.
 * After fixing some of them: npx eslint . --prune-suppressions */
import fs from "node:fs";
import js from "@eslint/js";
import globals from "globals";
import * as espree from "espree";

const SCRIPTS = fs.readdirSync("sae").filter((f) => f.endsWith(".js")).map((f) => "sae/" + f);
const PAGES = ["index.js", "example.js", "disass.js"];

function topLevelNames(file) {
	const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script" });
	const names = [];
	for (const n of ast.body) {
		if (n.type === "VariableDeclaration") for (const d of n.declarations) { if (d.id.type === "Identifier") names.push(d.id.name); }
		else if ((n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id) names.push(n.id.name);
	}
	return names;
}
const declared = Object.fromEntries([...SCRIPTS, ...PAGES].map((f) => [f, topLevelNames(f)]));
/* the globals a file sees: everything the other files declare */
function othersOf(file) {
	const g = {};
	for (const [f, names] of Object.entries(declared)) if (f !== file) for (const n of names) g[n] = "writable";
	for (const n of declared[file] || []) delete g[n];
	return g;
}

export default [
	{ ignores: ["node_modules/", "scriptedamigaemulator.js", "tests/.cache/", "tests/results/"] },
	js.configs.recommended,
	{
		files: [...SCRIPTS, ...PAGES, "tests/browser/*.js"],
		languageOptions: {
			ecmaVersion: 2020,
			sourceType: "script",
			globals: globals.browser,
		},
		rules: {
			/* C idioms kept from the WinUAE port on purpose: `if (0 && ...)` to disable code,
			   Duff-style switch fallthrough, `var i` in several loops of one function */
			"no-constant-binary-expression": "off",
			"no-fallthrough": "off",
			"no-redeclare": "off",
			"no-octal": "warn",
			/* style-level findings in the original code base; reported, not enforced */
			"no-unused-vars": ["warn", { vars: "local", args: "none", caughtErrors: "none" }],
			"no-empty": ["warn", { allowEmptyCatch: true }],
			"no-useless-escape": "warn",
			"no-constant-condition": ["warn", { checkLoops: false }],
		},
	},
	...[...SCRIPTS, ...PAGES].map((f) => ({ files: [f], languageOptions: { globals: othersOf(f) } })),
	/* the test pages run inside the emulator page and use its globals */
	{ files: ["tests/browser/*.js"], languageOptions: { globals: othersOf("") } },
	{
		files: ["tests/**/*.mjs", "eslint.config.js"],
		languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.node },
	},
	/* page.evaluate() callbacks run in the browser */
	{ files: ["tests/run-suite.mjs", "tests/run-cputester.mjs"], languageOptions: { globals: { window: "readonly" } } },
];
