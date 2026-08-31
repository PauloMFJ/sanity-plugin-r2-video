import { defineField, defineType } from "sanity";
import type { ResolvedR2VideoConfig } from "./defaults";
import { formatSize } from "./format";
import { InputVideo } from "./input-video";
import { InputVideoAsset } from "./input-video-asset";

/**
 * The library document. Everything but `filename` and `folder` is written by the
 * upload pipeline and read-only — there is nothing an editor can usefully
 * correct by hand, and a stale `renditions` entry would point at an object that
 * isn't in the bucket.
 */
export const createVideoAssetSchema = (config: ResolvedR2VideoConfig) => {
	return defineType({
		title: "Video",
		name: "r2Video.asset",
		type: "document",
		components: { input: InputVideoAsset },
		fields: [
			defineField({
				title: "Filename",
				name: "filename",
				type: "string",
				description:
					"The name shown everywhere in the Studio. Renaming is safe — object keys carry no name, so nothing in storage depends on it.",
				validation: (Rule) => Rule.required(),
			}),
			defineField({
				title: "Folder",
				name: "folder",
				type: "reference",
				to: [{ type: config.folders.type }],
				description:
					"The same folders the image library uses. Renaming one moves this video without touching anything already in the bucket.",
			}),
			defineField({
				title: "Poster",
				name: "poster",
				type: "image",
				readOnly: true,
				description: "First frame, stored as a normal Sanity image.",
				validation: (Rule) => Rule.required(),
			}),
			defineField({
				title: "Duration",
				name: "duration",
				type: "number",
				readOnly: true,
			}),
			defineField({
				title: "Has audio",
				name: "hasAudio",
				type: "boolean",
				readOnly: true,
				initialValue: false,
			}),
			defineField({
				title: "Renditions",
				name: "renditions",
				type: "array",
				readOnly: true,
				of: [
					{
						type: "object",
						name: "rendition",
						fields: [
							{ name: "width", type: "number" },
							{ name: "height", type: "number" },
							{ name: "key", type: "string" },
							{ name: "size", type: "number" },
						],
						preview: {
							select: { width: "width", height: "height", size: "size" },
							prepare({ width, height, size }) {
								return {
									title: `${width} × ${height}`,
									subtitle: formatSize(size ?? 0),
								};
							},
						},
					},
				],
			}),
			defineField({
				title: "Uploaded at",
				name: "uploadedAt",
				type: "datetime",
				readOnly: true,
			}),
		],
		preview: {
			select: {
				filename: "filename",
				folder: "folder.name",
				media: "poster",
			},
			prepare({ filename, folder, media }) {
				return {
					title: filename || "Untitled video",
					subtitle: folder || "No folder",
					media: media || (() => "▶"),
				};
			},
		},
	});
};

/**
 * The field an `asset` object composes. Stores nothing but a reference, so the
 * same video can be reused across documents without re-encoding it.
 */
export const SCHEMA_R2_VIDEO = defineType({
	title: "Video",
	name: "r2Video",
	type: "object",
	options: { collapsible: false },
	components: { input: InputVideo },
	fields: [
		defineField({
			title: "Asset",
			name: "asset",
			type: "reference",
			to: [{ type: "r2Video.asset" }],
		}),
	],
	preview: {
		select: {
			filename: "asset.filename",
			media: "asset.poster",
		},
		prepare({ filename, media }) {
			return {
				title: filename || "No video selected.",
				media: media || (() => "▶"),
			};
		},
	},
});
