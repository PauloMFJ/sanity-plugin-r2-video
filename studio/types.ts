import type { AudioCodec, VideoCodec } from "mediabunny";

/** A single encoded MP4 rendition, stored as one object in R2. */
export type R2VideoRendition = {
	width: number;
	height: number;
	key: string;
	size: number;
};

/** A reference to another document, as Sanity stores it. */
export type R2VideoReference = {
	_type: "reference";
	_ref: string;
};

/** A reference to a Sanity image asset, as stored on a document. */
export type R2VideoPoster = {
	_type: "image";
	asset: R2VideoReference;
};

/**
 * An `r2Video.asset` document. Metadata only — every MP4 lives in R2, and the
 * poster lives in Sanity's own image pipeline so it inherits the CDN, the
 * `srcset` helpers and the native preview branch.
 */
export type R2VideoAsset = {
	_id: string;
	_type: "r2Video.asset";

	/** Display name. Editable — nothing in storage depends on it. */
	filename: string;

	/**
	 * The media library folder this video belongs to — the same documents the
	 * image browser uses, so folders are shared rather than mirrored. Object
	 * keys keep the prefix they were uploaded under, so renaming a folder moves
	 * the video in the Studio without invalidating anything already in R2.
	 */
	folder?: R2VideoReference;
	poster: R2VideoPoster;
	duration: number;
	hasAudio: boolean;
	renditions: R2VideoRendition[];
	uploadedAt: string;
};

/** The value an `r2Video` field holds — a reference to an `r2Video.asset`. */
export type R2VideoValue = {
	_type?: "r2Video";
	asset?: R2VideoReference;
};

/** Field-level options for an `r2Video` field. */
export type R2VideoFieldOptions = {
	/** Id of the folder new uploads from this field are filed under. */
	folder?: string;
};

/**
 * Encoding options, applied to every rendition.
 *
 * Every field is optional; what each falls back to is in `defaults.ts`.
 */
export type R2VideoEncodingConfig = {
	/**
	 * Rendition heights to produce, in any order. A source shorter than a tier
	 * skips it — nothing is ever upscaled.
	 */
	heights?: number[];

	/**
	 * Video codec. `avc` (h264) is the only one every browser plays from a plain
	 * `<video src>`, so change it only if you know the audience.
	 */
	videoCodec?: VideoCodec;

	/** Audio codec, used only when an upload opts into keeping audio. */
	audioCodec?: AudioCodec;

	/**
	 * Compression level passed to both encoders, from 0 (worst) to 1 (best).
	 *
	 * For codecs that support it — h264 included — this maps to a **quantizer**,
	 * not a bitrate. That means constant quality and *variable file size*: the
	 * output is as large as the footage needs to hit that quality, so detailed
	 * or grainy material produces much bigger files than flat material.
	 *
	 * ```
	 * 0.5  QP 28  good        0.75  QP 22  transparent
	 * 0.85 QP 20  transparent 1     QP 16  near-lossless, size unbounded
	 * ```
	 *
	 * QP 22 is h264's practical transparency threshold, which is why 0.75 is the
	 * default. Going to 1 can produce a file **larger than the source** when the
	 * source was exported at a normal quantizer — you are asking for a
	 * higher-fidelity encode than the original, and encoding can't add back
	 * detail that was never captured.
	 */
	quality?: number;

	/**
	 * Encode to a target **bitrate** instead of a quantizer.
	 *
	 * Flips the trade-off `quality` makes. The quantizer default is constant
	 * quality with variable size — grainy footage produces far bigger files than
	 * flat footage. With this on, size becomes predictable and quality varies
	 * instead: a tier lands at roughly the same weight whatever you feed it.
	 *
	 * The target is derived from frame size and `quality`, using 3 Mbps at
	 * 1920×1080 as the reference and a multiplier from the quality curve — so
	 * `0.75` is about 6.1 Mbps at 1080p, and `0.5` about 3.2 Mbps.
	 *
	 * Worth turning on when knowing what lands in the bucket matters more than
	 * every clip hitting the same visual bar.
	 */
	preferBitrate?: boolean;

	/**
	 * Copy the top rendition straight from the source instead of re-encoding it,
	 * when its height and codec already match. Mediabunny then copies rather
	 * than transcodes: instant, and bit-identical to the upload.
	 *
	 * Off by default because it hands size control to whoever exported the file
	 * — a 60 Mbps master would be stored at 60 Mbps. That tier is rarely the one
	 * served, since playback picks by element size, but the bytes are real.
	 */
	nativeTopTier?: boolean;
};

/**
 * Options for `r2Video`.
 *
 * Only `endpoint`, `token` and `publicUrl` are required; what every other field
 * falls back to is in `defaults.ts`.
 */
export type R2VideoPluginConfig = {
	/**
	 * Origin of the deployed Worker that owns uploads and deletes. The Worker
	 * holds the R2 binding; the Studio never touches the bucket directly.
	 */
	endpoint: string;

	/**
	 * Shared secret the Worker checks. This ships inside the Studio bundle, so
	 * it gates casual access rather than providing real authentication — pair it
	 * with the Worker's origin allowlist.
	 */
	token: string;

	/**
	 * Public origin the renditions are served from. Source URLs are built from
	 * this plus each rendition's key, so no document stores an origin.
	 */
	publicUrl: string;

	/** Sanity API version the plugin's own queries and mutations run against. */
	apiVersion?: string;

	/** Optional tool configuration for the Studio plugin. */
	tool?: { name?: string; title?: string };

	/** Where videos and their posters are filed in the media library. */
	folders?: {
		/**
		 * Document type folders are read from. Defaults to
		 * `sanity-plugin-media`'s own, so the video library and the image browser
		 * share one set. Point it elsewhere to decouple them.
		 */
		type?: string;

		/** Folder generated posters are filed under, created on first upload. */
		poster?: string;
	};

	/** Encoding options. See `R2VideoEncodingConfig`. */
	encoding?: R2VideoEncodingConfig;
};
