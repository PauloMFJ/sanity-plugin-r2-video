#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const USAGE = `
  sanity-plugin-r2-video setup worker [directory]

  Writes a deployable Cloudflare Worker: A wrangler config filled in from your
  answers, and an entry point that re-exports this package's endpoint - so
  upgrading the package upgrades the Worker.

  directory   Where to write it. Defaults to ./r2-video-worker

  Options (prompted for when omitted, required when not a terminal):

    --name      Worker name                default r2-video
    --account   Cloudflare account id      required
    --bucket    R2 bucket name             required
    --origins   Allowed Studio origins     default http://localhost:3333
`;

/** Flags parsed as `--key value`, so the command works unattended in CI. */
const parseFlags = (argv) => {
	const flags = {};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg.startsWith("--")) {
			flags[arg.slice(2)] = argv[index + 1];
			index += 1;
		}
	}

	return flags;
};

/**
 * The Worker re-exports the package's handler rather than copying it, so
 * upgrading the package upgrades the deployed endpoint. Only identity -
 * name, account, bucket, origins - is generated.
 */
const ENTRY = `// The endpoint itself lives in the plugin, so upgrading the package upgrades
// this Worker. Only deployment identity belongs here, in \`wrangler.jsonc\`.
export { default } from "sanity-plugin-r2-video/worker";
`;

const TSCONFIG = `{
	"$schema": "https://json.schemastore.org/tsconfig.json",
	"extends": "sanity-plugin-r2-video/worker/tsconfig.json"
}
`;

const ask = async (rl, question, fallback) => {
	if (!rl) {
		return fallback ?? "";
	}

	const suffix = fallback ? ` (${fallback})` : "";
	const answer = (await rl.question(`  ${question}${suffix}: `)).trim();

	return answer || fallback || "";
};

/**
 * Only the values that differ per deployment. The binding name, the entry point
 * and the compatibility date are fixed - the Worker source expects them, so
 * asking would only create a way to get them wrong.
 */
const createConfig = ({ name, accountId, bucket, origins }) => {
	return `{
	"$schema": "./node_modules/wrangler/config-schema.json",
	"name": ${JSON.stringify(name)},
	"account_id": ${JSON.stringify(accountId)},
	"main": "src/index.ts",
	"compatibility_date": "2026-08-01",

	// The binding is what keeps R2 credentials out of your repo entirely - the
	// Worker reaches the bucket directly, so nothing has to be signed or stored
	"r2_buckets": [
		{
			"binding": "BUCKET",
			"bucket_name": ${JSON.stringify(bucket)}
		}
	],

	"vars": {
		// Studio origins allowed to call this Worker, comma separated
		"ALLOWED_ORIGINS": ${JSON.stringify(origins)}
	}

	// UPLOAD_TOKEN is set separately, with: wrangler secret put UPLOAD_TOKEN
	// Not because it's secret - the Studio ships the same value to browsers -
	// but so it stays out of this file, out of git, and out of deploy logs
}
`;
};

const setupWorker = async (target, flags) => {
	const directory = resolve(process.cwd(), target ?? "r2-video-worker");

	if (existsSync(directory)) {
		console.error(
			`\n  ${directory} already exists. Move it or pick another.\n`,
		);
		process.exitCode = 1;
		return;
	}

	// Prompt only for what wasn't passed, and only when there's someone to ask
	const rl =
		(!flags.account || !flags.bucket) && process.stdin.isTTY
			? createInterface({ input: process.stdin, output: process.stdout })
			: null;

	const answers = {
		name: flags.name ?? (await ask(rl, "Worker name", "r2-video")),
		accountId: flags.account ?? (await ask(rl, "Cloudflare account id")),
		bucket: flags.bucket ?? (await ask(rl, "R2 bucket name")),
		origins:
			flags.origins ??
			(await ask(rl, "Allowed Studio origins", "http://localhost:3333")),
	};

	if (rl) {
		rl.close();
	}

	if (!answers.accountId || !answers.bucket) {
		console.error(
			"\n  An account id and a bucket name are both required." +
				"\n  Pass --account and --bucket, or run this in a terminal.\n",
		);
		process.exitCode = 1;
		return;
	}

	await mkdir(join(directory, "src"), { recursive: true });
	await writeFile(join(directory, "src", "index.ts"), ENTRY);
	await writeFile(join(directory, "tsconfig.json"), TSCONFIG);
	await writeFile(join(directory, "wrangler.jsonc"), createConfig(answers));

	const config = `${target ?? "r2-video-worker"}/wrangler.jsonc`;

	console.info(`
  Written to ${directory}

  Next:

    1. Install its dependencies there:
         pnpm add sanity-plugin-r2-video
         pnpm add -D wrangler @cloudflare/workers-types
    2. wrangler secret put UPLOAD_TOKEN --config ${config}
    3. wrangler deploy --config ${config}
    4. Pass the deployed URL, the same token, and the bucket's public origin
       to r2Video() in sanity.config.ts.
`);
};

const argv = process.argv.slice(2);
const [command, subcommand] = argv;
const target = argv[2] && !argv[2].startsWith("--") ? argv[2] : undefined;

if (command === "setup" && subcommand === "worker") {
	await setupWorker(target, parseFlags(argv));
} else {
	console.info(USAGE);
	process.exitCode = command ? 1 : 0;
}
