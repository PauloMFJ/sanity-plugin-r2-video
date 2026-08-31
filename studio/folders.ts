import type { SanityClient } from "sanity";

/**
 * A folder from the media library. These are the *same* documents the image
 * browser uses, not a parallel set — a folder made in either place shows up in
 * both, so there is one place folders are defined.
 */
export type MediaFolder = {
	_id: string;
	name: string;
	parentId: string | null;
};

const QUERY_FOLDERS = `*[_type == $folderType]{
	_id,
	name,
	"parentId": parent._ref
}`;

export const fetchFolders = (client: SanityClient, folderType: string) => {
	return client.fetch<MediaFolder[]>(QUERY_FOLDERS, { folderType });
};

/**
 * Slash-joined path for a folder, walking up the parent chain. Guards against
 * a cycle, which a hand-edited `parent` reference could otherwise create.
 */
export const resolveFolderPath = (folders: MediaFolder[], id: string) => {
	const byId = new Map(folders.map((folder) => [folder._id, folder]));
	const segments: string[] = [];
	const seen = new Set<string>();

	let current = byId.get(id);

	while (current && !seen.has(current._id)) {
		seen.add(current._id);
		segments.unshift(current.name);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}

	return segments.join("/");
};

/** A folder as a picker lists it: its id and its full slash-joined path. */
export type FolderPath = {
	id: string;
	path: string;
};

/** Folder paths, sorted, for listing in a picker. */
export const resolveFolderPaths = (folders: MediaFolder[]): FolderPath[] => {
	return folders
		.map((folder) => ({
			id: folder._id,
			path: resolveFolderPath(folders, folder._id),
		}))
		.sort((a, b) => a.path.localeCompare(b.path));
};

const QUERY_FOLDER_BY_NAME = `*[_type == $folderType && name == $name][0]._id`;

/** A folder's id by name, or `null`. Never creates — see `resolvePosterFolder`. */
export const findFolderByName = (
	client: SanityClient,
	folderType: string,
	name: string,
) => {
	return client.fetch<string | null>(QUERY_FOLDER_BY_NAME, {
		folderType,
		name,
	});
};

/**
 * The folder posters are filed under, created on first use. Posters are a
 * by-product rather than content, so they get their own folder instead of
 * cluttering the ones holding real images.
 */
export const resolvePosterFolder = async (
	client: SanityClient,
	folderType: string,
	name: string,
) => {
	const existing = await findFolderByName(client, folderType, name);

	if (existing) {
		return existing;
	}

	const created = await client.create({ _type: folderType, name });
	return created._id;
};
