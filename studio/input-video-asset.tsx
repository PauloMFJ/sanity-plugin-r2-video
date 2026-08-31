import { Stack } from "@sanity/ui";
import type { ObjectInputProps } from "sanity";
import type { R2VideoRendition } from "./types";
import { VideoPreview } from "./video-preview";

const isRendition = (value: unknown): value is R2VideoRendition => {
	return (
		typeof value === "object" &&
		value !== null &&
		"key" in value &&
		"width" in value &&
		"height" in value
	);
};

/** Renditions off a document value, without assuming the shape is complete. */
const readRenditions = (value: unknown) => {
	if (typeof value !== "object" || value === null) {
		return [];
	}

	const renditions = Reflect.get(value, "renditions");
	if (!Array.isArray(renditions)) {
		return [];
	}

	return renditions.filter(isRendition);
};

/**
 * Puts a working player at the top of the asset document. Every field below is
 * written by the upload pipeline, so opening one of these is almost always
 * about watching the footage rather than editing it.
 */
export const InputVideoAsset = (props: ObjectInputProps) => {
	const renditions = readRenditions(props.value);

	return (
		<Stack gap={4}>
			{renditions.length > 0 && <VideoPreview renditions={renditions} />}
			{props.renderDefault(props)}
		</Stack>
	);
};
