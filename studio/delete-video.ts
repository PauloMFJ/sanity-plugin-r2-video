import type { SanityClient } from "sanity";
import { deleteObjects } from "./client";
import type { R2VideoAsset, R2VideoPluginConfig } from "./types";

/** A document still pointing at an asset, and therefore blocking its delete. */
export type ReferencingDocument = {
	_id: string;
	_type: string;
	title?: string;
};

const QUERY_REFERENCES = `*[references($id)]{ _id, _type, title }`;

/** Documents that would break if the asset went away. */
export const findReferencingDocuments = (client: SanityClient, id: string) => {
	return client.fetch<ReferencingDocument[]>(QUERY_REFERENCES, { id });
};

/**
 * Removes an asset from Sanity and R2. The order is forced twice over.
 *
 * The document goes before the poster, because it holds the strong reference
 * that would otherwise 409. And Sanity goes before R2, because the two failure
 * modes are not symmetric - an orphaned object is invisible and costs pennies,
 * whereas a document pointing at deleted media breaks the site.
 */
export const deleteVideoAsset = async (
	client: SanityClient,
	config: R2VideoPluginConfig,
	asset: R2VideoAsset,
) => {
	await client.delete(asset._id);

	// Both are missing on a document the pipeline never finished writing, and
	// deleting one of those has to work - it's the only way to be rid of it
	const posterId = asset.poster?.asset?._ref;
	const renditions = asset.renditions ?? [];

	// A poster shared with another document stays put. That rejection is an
	// expected outcome of this sequence, not a failure of it
	if (posterId) {
		try {
			await client.delete(posterId);
		} catch (error) {
			console.info(
				`Kept poster for '${asset.filename}' - still in use.`,
				error,
			);
		}
	}

	await deleteObjects(
		config,
		renditions.map((rendition) => rendition.key),
	);
};
