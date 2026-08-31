import { resolveRenditionPath } from "../storage";
import type { SanityClient } from "sanity";
import { deleteObjects, uploadObject } from "./client";
import type { ResolvedR2VideoConfig } from "./defaults";
import { resolvePosterFolder } from "./folders";
import { transcodeVideo } from "./transcode";
import type { TranscodeOptions } from "./transcode.worker";
import type { R2VideoAsset, R2VideoRendition } from "./types";

export type UploadStage = "encoding" | "storing" | "saving";

export type UploadProgress = {
	stage: UploadStage;
	progress: number;
	label: string;
};

export type UploadRequest = {
	client: SanityClient;
	config: ResolvedR2VideoConfig;
	file: File;

	/** Media library folder id, or empty for none. */
	folderId: string;
	keepAudio: boolean;

	/** Encoding settings for this upload, defaulting to the plugin's config. */
	encoding: TranscodeOptions;
	progressed: (progress: UploadProgress) => void;
};

/**
 * A filename without its extension. The container is an implementation detail
 * — a source may arrive as .mov and leave as .mp4 — so the name shouldn't claim
 * one. Leaves an extensionless name alone.
 */
const dropExtension = (name: string) => name.replace(/\.[^./\\]+$/, "");

/**
 * Alphabet for upload ids. 32 characters, so a random byte masked to 5 bits
 * maps to one with no modulo bias — and no `i`, `l`, `o` or `u`, which keeps a
 * key readable aloud and unmistakable in a bucket listing.
 */
const ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const ID_LENGTH = 12;

/**
 * A short id for one upload's objects.
 *
 * Twelve characters of this alphabet is 32^12 — around 1.2 x 10^18 values, so
 * even a library of a million videos has a collision chance under 1 in 10^6.
 * A full UUID is three times the length for headroom nothing here needs.
 */
const createId = () => {
	const bytes = crypto.getRandomValues(new Uint8Array(ID_LENGTH));
	return Array.from(bytes, (byte) => ID_ALPHABET[byte & 31]).join("");
};

/** What an interrupted upload has already written, so it can be undone. */
type Written = {
	posterId: string | null;
	keys: string[];
};

/**
 * Removes what a failed upload got as far as creating.
 *
 * Never throws. Whatever broke the upload — usually the network — is likely to
 * break these deletes too, and "upload failed, and so did the cleanup" buries
 * the message that actually matters. Anything left behind is unreferenced, so
 * the orphan sweep can collect it later.
 */
const rollback = async (
	client: SanityClient,
	config: ResolvedR2VideoConfig,
	written: Written,
) => {
	try {
		await deleteObjects(config, written.keys);
	} catch (error) {
		console.warn("Could not remove stored renditions after a failure.", error);
	}

	if (!written.posterId) {
		return;
	}

	try {
		await client.delete(written.posterId);
	} catch (error) {
		console.warn("Could not remove the poster after a failure.", error);
	}
};

/**
 * Encodes a source into the full ladder, stores every rendition in R2, puts the
 * poster through Sanity's own image pipeline, and writes the document that ties
 * them together. Resolves with the created asset.
 *
 * The document is written last on purpose, so a failure can never leave a video
 * in the library pointing at files that aren't there. Everything created before
 * that point is rolled back if any step throws.
 */
export const uploadVideo = async ({
	client,
	config,
	file,
	folderId,
	keepAudio,
	encoding,
	progressed,
}: UploadRequest): Promise<R2VideoAsset> => {
	const name = dropExtension(file.name);

	const encoded = await transcodeVideo(
		{ file, keepAudio, options: encoding },
		(progress, label) => progressed({ stage: "encoding", progress, label }),
	);

	// Tracked from here on, because from here on there is something to undo
	const written: Written = { posterId: null, keys: [] };

	try {
		progressed({ stage: "storing", progress: 0, label: "poster" });

		const poster = await client.assets.upload("image", encoded.poster, {
			filename: `${name}.jpg`,
		});

		written.posterId = poster._id;

		// File the poster in the media library so it doesn't sit loose among real
		// images. `opt.media.folder` is where sanity-plugin-media looks
		const posterFolderId = await resolvePosterFolder(
			client,
			config.folders.type,
			config.folders.poster,
		);

		await client
			.patch(poster._id)
			.set({
				"opt.media.folder": {
					_type: "reference",
					_ref: posterFolderId,
					_weak: true,
				},
			})
			.commit();

		const id = createId();
		const renditions: R2VideoRendition[] = [];

		for (const [index, rendition] of encoded.renditions.entries()) {
			const key = resolveRenditionPath(id, rendition.height);

			// Recorded before the upload, not after — a request that times out may
			// still have stored the object, and an untracked key is unreachable
			written.keys.push(key);

			const stored = await uploadObject(config, key, rendition.data);

			renditions.push({
				width: rendition.width,
				height: rendition.height,
				key: stored.key,
				size: stored.size,
			});

			progressed({
				stage: "storing",
				progress: (index + 1) / encoded.renditions.length,
				label: `${rendition.height}p`,
			});
		}

		progressed({ stage: "saving", progress: 1, label: name });

		return await client.create<Omit<R2VideoAsset, "_id">>({
			_type: "r2Video.asset",
			filename: name,
			...(folderId && {
				folder: { _type: "reference", _ref: folderId },
			}),
			poster: {
				_type: "image",
				asset: { _type: "reference", _ref: poster._id },
			},
			duration: encoded.duration,
			hasAudio: encoded.hasAudio,
			renditions,
			uploadedAt: new Date().toISOString(),
		});
	} catch (error) {
		await rollback(client, config, written);
		throw error;
	}
};
