import type { R2VideoPluginConfig } from "./types";

/** What the Worker returns after storing one object. */
export type UploadedObject = {
	key: string;
	size: number;
};

const isUploadedObject = (value: unknown): value is UploadedObject => {
	return (
		typeof value === "object" &&
		value !== null &&
		"key" in value &&
		"size" in value
	);
};

const authorize = (config: R2VideoPluginConfig) => {
	return { authorization: `Bearer ${config.token}` };
};

const failed = async (response: Response, action: string) => {
	const detail = await response.text();
	return new Error(`${action} failed (${response.status}). ${detail}`);
};

/**
 * Stores one rendition. Bytes go through the Worker rather than straight to
 * R2 — renditions are single-digit MB, well inside the request body limit, and
 * routing through the binding keeps credentials out of the Studio entirely.
 */
export const uploadObject = async (
	config: R2VideoPluginConfig,
	key: string,
	body: ArrayBuffer,
) => {
	const response = await fetch(`${config.endpoint}/upload`, {
		method: "POST",
		headers: {
			...authorize(config),
			"content-type": "video/mp4",
			"x-object-key": key,
		},
		body,
	});

	if (!response.ok) {
		throw await failed(response, `Uploading '${key}'`);
	}

	const payload: unknown = await response.json();
	if (!isUploadedObject(payload)) {
		throw new Error(`The Worker returned an unexpected response for '${key}'.`);
	}

	return payload;
};

const isKeyPage = (
	value: unknown,
): value is { keys: string[]; cursor: string | null } => {
	return (
		typeof value === "object" &&
		value !== null &&
		"keys" in value &&
		Array.isArray(value.keys)
	);
};

/** Every key in the bucket, following pagination to the end. */
export const listObjects = async (config: R2VideoPluginConfig) => {
	const keys: string[] = [];
	let cursor: string | null = null;

	do {
		const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";

		const response = await fetch(`${config.endpoint}/files${query}`, {
			headers: authorize(config),
		});

		if (!response.ok) {
			throw await failed(response, "Listing objects");
		}

		const payload: unknown = await response.json();
		if (!isKeyPage(payload)) {
			throw new Error("The Worker returned an unexpected listing response.");
		}

		keys.push(...payload.keys);
		cursor = payload.cursor;
	} while (cursor);

	return keys;
};

/** Removes stored objects. Batched — R2 deletes many keys in one call. */
export const deleteObjects = async (
	config: R2VideoPluginConfig,
	keys: string[],
) => {
	if (keys.length === 0) {
		return;
	}

	const response = await fetch(`${config.endpoint}/files`, {
		method: "DELETE",
		headers: { ...authorize(config), "content-type": "application/json" },
		body: JSON.stringify({ keys }),
	});

	if (!response.ok) {
		throw await failed(response, "Deleting objects");
	}
};
