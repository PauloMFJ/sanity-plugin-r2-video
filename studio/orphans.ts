import type { SanityClient } from "sanity";
import { deleteObjects, listObjects } from "./client";
import type { ResolvedR2VideoConfig } from "./defaults";
import { findFolderByName } from "./folders";

export type Orphans = {
	/** Objects in the bucket that no document points at. */
	keys: string[];

	/** Poster images in the poster folder that nothing references. */
	posterIds: string[];
};

/** Every rendition key any video document currently claims. */
const QUERY_LIVE_KEYS = `array::unique(*[_type == "r2Video.asset"].renditions[].key)`;

/**
 * Posters in the poster folder that nothing references at all.
 *
 * The `references` check is the authoritative one rather than a diff against
 * video documents: a poster someone reused in a page is still in use, and
 * Sanity would reject the delete anyway.
 */
const QUERY_ORPHAN_POSTERS = `*[
	_type == "sanity.imageAsset"
	&& opt.media.folder._ref == $folderId
	&& count(*[references(^._id)]) == 0
]._id`;

/**
 * What storage holds that nothing in the dataset points at.
 *
 * These accumulate when an upload dies without rolling back — a closed tab or a
 * crash, since rollback can't run then. Everything found here is unreferenced
 * by definition, so removing it can't break a page.
 */
export const findOrphans = async (
	client: SanityClient,
	config: ResolvedR2VideoConfig,
): Promise<Orphans> => {
	const folderId = await findFolderByName(
		client,
		config.folders.type,
		config.folders.poster,
	);

	const [stored, liveKeys, posterIds] = await Promise.all([
		listObjects(config),
		client.fetch<string[]>(QUERY_LIVE_KEYS),
		folderId
			? client.fetch<string[]>(QUERY_ORPHAN_POSTERS, { folderId })
			: Promise.resolve([]),
	]);

	const live = new Set(liveKeys);

	return {
		keys: stored.filter((key) => !live.has(key)),
		posterIds,
	};
};

/**
 * Deletes what `findOrphans` turned up. Posters go one at a time so a single
 * rejection — a reference created between the scan and the delete — doesn't
 * abandon the rest.
 */
export const removeOrphans = async (
	client: SanityClient,
	config: ResolvedR2VideoConfig,
	orphans: Orphans,
) => {
	await deleteObjects(config, orphans.keys);

	for (const posterId of orphans.posterIds) {
		try {
			await client.delete(posterId);
		} catch (error) {
			console.warn(`Kept poster '${posterId}' — still referenced.`, error);
		}
	}
};
