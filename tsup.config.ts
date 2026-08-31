import { defineConfig } from "tsup";

export default defineConfig({
	// `studio/transcode.worker` is its own entry so it lands beside
	// `studio/index.js` in `dist` — that's what `new URL("./transcode.worker.js",
	// import.meta.url)` resolves against at runtime.
	entry: {
		"studio/index": "studio/index.ts",
		"studio/transcode.worker": "studio/transcode.worker.ts",
		storage: "storage.ts",
	},
	format: ["esm"],
	dts: true,
	clean: true,
	treeshake: true,
	target: "es2022",
});
