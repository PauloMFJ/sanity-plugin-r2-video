import { Stack } from "@sanity/ui";
import type { ObjectInputProps, ObjectMember } from "sanity";
import type { R2VideoRendition } from "./types";
import { VideoPreview } from "./video-preview";
import { VideoSummary } from "./video-summary";

/**
 * The only fields an editor can usefully change. Everything else is written by
 * the upload pipeline, so it's shown by `VideoSummary` instead of rendered as a
 * form field nobody can fill in.
 */
const EDITABLE_FIELDS = new Set(["filename", "folder"]);

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

/** One value off a document, only when it's the type the summary can render. */
const read = <T,>(
	value: unknown,
	key: string,
	is: (raw: unknown) => raw is T,
) => {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}

	const raw = Reflect.get(value, key);

	return is(raw) ? raw : undefined;
};

/**
 * The field a member belongs to, whether the form built it or failed to. A
 * document written before a schema change arrives as an error member rather
 * than a field one, and those carry the name under `fieldName`.
 */
const memberField = (member: ObjectMember) => {
	if (member.kind === "field") {
		return member.name;
	}

	if (member.kind === "error") {
		return member.fieldName;
	}

	return undefined;
};

const isNumber = (value: unknown): value is number => typeof value === "number";
const isBoolean = (value: unknown): value is boolean =>
	typeof value === "boolean";
const isString = (value: unknown): value is string => typeof value === "string";

/**
 * Makes the asset document read like the details dialog: a working player, the
 * two fields worth editing, then the pipeline's own record of the upload.
 */
export const InputVideoAsset = (props: ObjectInputProps) => {
	const renditions = readRenditions(props.value);

	// Only the editable fields reach the default form. Filtering members rather
	// than hiding fields keeps patching, validation and presence intact for them
	const members = props.members.filter((member) => {
		const field = memberField(member);

		return field === undefined || EDITABLE_FIELDS.has(field);
	});

	return (
		<Stack gap={5}>
			{renditions.length > 0 && <VideoPreview renditions={renditions} />}

			{props.renderDefault({ ...props, members })}

			{renditions.length > 0 && (
				<VideoSummary
					duration={read(props.value, "duration", isNumber) ?? 0}
					hasAudio={read(props.value, "hasAudio", isBoolean) ?? false}
					renditions={renditions}
					uploadedAt={read(props.value, "uploadedAt", isString)}
				/>
			)}
		</Stack>
	);
};
