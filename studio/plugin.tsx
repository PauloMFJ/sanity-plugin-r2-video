import { PlayIcon } from "@sanity/icons/Play";
import { definePlugin } from "sanity";
import { R2VideoConfigProvider } from "./config-context";
import { resolveConfig } from "./defaults";
import { createVideoAssetSchema, SCHEMA_R2_VIDEO } from "./schema-video";
import { ToolVideoLibrary } from "./tool-video-library";
import type { R2VideoPluginConfig } from "./types";

/**
 * The Sanity plugin for R2 Video. Provides a video asset type, a reference
 * field to it, and a tool for managing videos.
 */
export const r2Video = definePlugin<R2VideoPluginConfig>((options) => {
	const resolvedConfig = resolveConfig(options);

	return {
		// The plugin's own identity, not the tool's route - 'tool.name' below is
		// configurable and moves the tool's URL, this never changes
		name: "r2-video",

		schema: {
			types: [createVideoAssetSchema(resolvedConfig), SCHEMA_R2_VIDEO],
		},

		studio: {
			components: {
				layout: (props) => (
					<R2VideoConfigProvider config={resolvedConfig}>
						{props.renderDefault(props)}
					</R2VideoConfigProvider>
				),
			},
		},

		tools: [
			{
				name: resolvedConfig.tool.name,
				title: resolvedConfig.tool.title,
				icon: PlayIcon,
				component: ToolVideoLibrary,
			},
		],
	};
});
