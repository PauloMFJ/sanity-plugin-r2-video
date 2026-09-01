import type { TranscodeOptions } from "./transcode.worker";
import type { R2VideoPluginConfig } from "./types";

type WithNested = {
	tool: Required<NonNullable<R2VideoPluginConfig["tool"]>>;
	folders: Required<NonNullable<R2VideoPluginConfig["folders"]>>;
	encoding: TranscodeOptions;
};

export type ResolvedR2VideoConfig = R2VideoPluginConfig &
	Required<Pick<R2VideoPluginConfig, "apiVersion">> &
	WithNested;

/** What the plugin uses when the Studio doesn't pass its own config. */
const DEFAULTS = {
	apiVersion: "2024-01-01",
	tool: {
		name: "r2-video",
		title: "R2 Video",
	},
	folders: {
		type: "media.folder",
		poster: "_R2 Video Posters",
	},
	encoding: {
		heights: [270, 360, 480, 720, 1080],
		videoCodec: "avc",
		audioCodec: "aac",
		quality: 0.75,
		preferBitrate: false,
		nativeTopTier: false,
	},
} as const satisfies Partial<R2VideoPluginConfig> & WithNested;

/**
 * Fills in every optional field once, so nothing downstream carries its own
 * fallback - a default in two places is a default that eventually disagrees.
 */
export const resolveConfig = (
	config: R2VideoPluginConfig,
): ResolvedR2VideoConfig => {
	return {
		...DEFAULTS,
		...config,
		tool: { ...DEFAULTS.tool, ...config.tool },
		folders: { ...DEFAULTS.folders, ...config.folders },
		encoding: { ...DEFAULTS.encoding, ...config.encoding },
	};
};
