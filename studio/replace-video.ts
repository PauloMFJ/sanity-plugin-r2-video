import type { SanityClient } from "sanity";
import { deleteObjects } from "./client";
import type { ResolvedR2VideoConfig } from "./defaults";
import type { R2VideoAsset } from "./types";

/** What an upload produces, and what a replacement swaps in. */
export type VideoAssetFields = Pick<
	R2VideoAsset,
	"poster" | "duration" | "frameRate" | "hasAudio" | "renditions" | "uploadedAt"
>;

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null;
};

/**
 * Patch paths to every reference to `id` in a document, keyed by `_key` where
 * array items have one so a concurrent reorder can't retarget the patch.
 */
const findReferencePaths = (
	value: unknown,
	id: string,
	path: string,
): string[] => {
	if (Array.isArray(value)) {
		return value.flatMap((item, index) => {
			const segment =
				isRecord(item) && typeof item._key === "string"
					? `[_key=="${item._key}"]`
					: `[${index}]`;

			return findReferencePaths(item, id, `${path}${segment}`);
		});
	}

	if (!isRecord(value)) {
		return [];
	}

	if (value._ref === id) {
		return [`${path}._ref`];
	}

	return Object.entries(value).flatMap(([field, child]) => {
		return findReferencePaths(child, id, path ? `${path}.${field}` : field);
	});
};

const QUERY_POSTER_REFERENCES = `*[references($posterId) && !(_id in $ownIds)]`;

/**
 * Swaps a video's content for a new upload in one transaction. The document
 * keeps its id, so everything referencing the video shows the new one without
 * being touched. References to the old poster are repointed to the new poster.
 */
export const swapVideoAsset = async (
	client: SanityClient,
	asset: R2VideoAsset,
	fields: VideoAssetFields,
): Promise<R2VideoAsset> => {
	const draftId = `drafts.${asset._id}`;
	const oldPosterId = asset.poster?.asset?._ref;
	const newPosterId = fields.poster.asset._ref;

	const [draft, posterReferrers] = await Promise.all([
		client.getDocument(draftId),
		oldPosterId
			? client.fetch<Record<string, unknown>[]>(QUERY_POSTER_REFERENCES, {
					posterId: oldPosterId,
					ownIds: [asset._id, draftId],
				})
			: Promise.resolve([]),
	]);

	// A new video without a measurable frame rate mustn't inherit the old one's
	const stale = fields.frameRate === undefined ? ["frameRate"] : [];

	let transaction = client
		.transaction()
		.patch(asset._id, (patch) => patch.set(fields).unset(stale));

	// An unpublished edit would restore the old renditions when published
	if (draft) {
		transaction = transaction.patch(draftId, (patch) =>
			patch.set(fields).unset(stale),
		);
	}

	for (const document of posterReferrers) {
		const id = document._id;
		const paths =
			oldPosterId && typeof id === "string"
				? findReferencePaths(document, oldPosterId, "")
				: [];

		if (typeof id === "string" && paths.length > 0) {
			const changes = Object.fromEntries(
				paths.map((path) => [path, newPosterId]),
			);

			transaction = transaction.patch(id, (patch) => patch.set(changes));
		}
	}

	await transaction.commit();

	return { ...asset, ...fields };
};

/**
 * Removes what a replacement made redundant: the old poster and renditions.
 * Never throws - the swap has already happened, and anything left behind is
 * unreferenced, so Sync collects it.
 */
export const discardReplaced = async (
	client: SanityClient,
	config: ResolvedR2VideoConfig,
	asset: R2VideoAsset,
) => {
	const oldPosterId = asset.poster?.asset?._ref;
	const keys = (asset.renditions ?? []).map((rendition) => rendition.key);

	if (oldPosterId) {
		try {
			await client.delete(oldPosterId);
		} catch (error) {
			console.warn("Kept the replaced poster - still referenced.", error);
		}
	}

	if (keys.length > 0) {
		try {
			await deleteObjects(config, keys);
		} catch (error) {
			console.warn("Could not remove the replaced renditions.", error);
		}
	}
};
