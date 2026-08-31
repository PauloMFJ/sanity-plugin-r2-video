/// <reference lib="webworker" />

import type { AudioCodec, VideoCodec } from "mediabunny";
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	CanvasSink,
	Conversion,
	Input,
	type InputVideoTrack,
	Mp4OutputFormat,
	Output,
	Quality,
} from "mediabunny";

/**
 * The heights worth encoding for a source of the given height, largest first.
 * Never upscales, so a 900p source stops at 720p. A source shorter than every
 * tier falls back to the shortest one, which does upscale — one rendition
 * beats none, and no realistic source is that small.
 */
const resolveHeights = (sourceHeight: number, heights: number[]) => {
	const ordered = [...heights].sort((a, b) => a - b);
	const fitting = ordered.filter((height) => height <= sourceHeight);
	const chosen = fitting.length > 0 ? fitting : ordered.slice(0, 1);
	return chosen.reverse();
};

/**
 * The width of a rendition at the given height. h264 requires even dimensions,
 * so the derived width rounds to the nearest even number.
 */
const resolveWidth = (height: number, aspectRatio: number): number => {
	return Math.round((height * aspectRatio) / 2) * 2;
};

/** Encoding settings, resolved by the caller so this file holds no defaults. */
export type TranscodeOptions = {
	heights: number[];
	videoCodec: VideoCodec;
	audioCodec: AudioCodec;
	quality: number;
	preferBitrate: boolean;
	nativeTopTier: boolean;
};

/** What the main thread sends in. */
export type TranscodeRequest = {
	file: File;
	keepAudio: boolean;
	options: TranscodeOptions;

	/**
	 * Encode only the tallest tier and stop. Used to show what the current
	 * settings actually produce before committing to the whole ladder — the top
	 * tier is the one that varies most, and the one most likely to surprise.
	 */
	topTierOnly?: boolean;
};

/** One finished rendition, still as raw bytes. */
export type TranscodedRendition = {
	width: number;
	height: number;
	data: ArrayBuffer;
};

/** What the worker sends back, one message at a time. */
export type TranscodeMessage =
	| { type: "progress"; progress: number; label: string }
	| {
			type: "result";
			duration: number;
			hasAudio: boolean;
			poster: Blob;
			posterWidth: number;
			posterHeight: number;
			renditions: TranscodedRendition[];
	  }
	| { type: "error"; message: string };

const post = (message: TranscodeMessage, transfer: Transferable[] = []) => {
	self.postMessage(message, transfer);
};

/**
 * The first frame, as a JPEG. Sanity re-encodes on delivery, so this only has
 * to survive one pass — the size saving over PNG is worth far more here.
 */
const extractPoster = async (track: InputVideoTrack) => {
	const frame = await new CanvasSink(track).getCanvas(0);
	if (!frame) {
		throw new Error("Could not read a first frame from that video.");
	}

	const { canvas } = frame;
	if (!(canvas instanceof OffscreenCanvas)) {
		throw new Error("Expected an OffscreenCanvas while running in a worker.");
	}

	return {
		poster: await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 }),
		posterWidth: canvas.width,
		posterHeight: canvas.height,
	};
};

/**
 * Encodes one rendition and returns the finished MP4 bytes.
 *
 * When `isNative`, no size or quality is requested at all. Mediabunny only
 * transcodes if something forces it to — a resize, a codec change, or a quality
 * setting — so omitting all three takes its packet-copy fast path: no
 * re-encode, no generation loss, and near-instant.
 */
const encodeRendition = async (
	source: Blob,
	width: number,
	height: number,
	hasAudio: boolean,
	isNative: boolean,
	options: TranscodeOptions,
	progressed: (progress: number) => void,
) => {
	// Object form rather than the numeric shorthand, so `preferBitrate` can pick
	// between quantizer-driven (constant quality) and bitrate-driven encoding
	const quality = new Quality({
		quality: options.quality,
		preferBitrate: options.preferBitrate,
	});

	const output = new Output({
		// Fast Start puts the metadata at the front so the browser can start
		// playing before the whole file has arrived
		format: new Mp4OutputFormat({ fastStart: "in-memory" }),
		target: new BufferTarget(),
	});

	const conversion = await Conversion.init({
		input: new Input({ formats: ALL_FORMATS, source: new BlobSource(source) }),
		output,
		video: isNative
			? {}
			: {
					width,
					height,
					fit: "contain",
					codec: options.videoCodec,
					quality,
				},
		audio: hasAudio
			? { codec: options.audioCodec, quality }
			: { discard: true },
	});

	conversion.onProgress = progressed;
	await conversion.execute();

	const { buffer } = output.target;
	if (!buffer) {
		throw new Error(`Encoding produced no data at ${height}p.`);
	}

	return buffer;
};

const transcode = async ({
	file,
	keepAudio,
	options,
	topTierOnly,
}: TranscodeRequest) => {
	const input = new Input({
		formats: ALL_FORMATS,
		source: new BlobSource(file),
	});

	const track = await input.getPrimaryVideoTrack();
	if (!track) {
		throw new Error("That file has no video track.");
	}

	const sourceWidth = await track.getDisplayWidth();
	const sourceHeight = await track.getDisplayHeight();
	const duration = await input.computeDuration();
	const audioTrack = await input.getPrimaryAudioTrack();
	const hasAudio = keepAudio && audioTrack !== null;
	const sourceCodec = await track.getCodec();

	const { poster, posterWidth, posterHeight } = await extractPoster(track);

	const full = resolveHeights(sourceHeight, options.heights);
	const heights = topTierOnly ? full.slice(0, 1) : full;
	const aspectRatio = sourceWidth / sourceHeight;
	const renditions: TranscodedRendition[] = [];

	// The largest tier encodes from the source; every smaller tier re-encodes
	// from that result instead, so the source is decoded once rather than once
	// per tier. Nothing ends up more than two generations deep
	let ladderSource: Blob = file;

	for (const [index, height] of heights.entries()) {
		const width = resolveWidth(height, aspectRatio);

		// Only the top tier can be copied, and only when it would have been an
		// identical re-encode anyway: same height, same codec
		const isNative =
			options.nativeTopTier &&
			index === 0 &&
			height === sourceHeight &&
			sourceCodec === options.videoCodec;

		const data = await encodeRendition(
			ladderSource,
			width,
			height,
			hasAudio,
			isNative,
			options,
			(progress) => {
				post({
					type: "progress",
					progress: (index + progress) / heights.length,
					label: `${height}p`,
				});
			},
		);

		renditions.push({ width, height, data });

		if (index === 0) {
			ladderSource = new Blob([data], { type: "video/mp4" });
		}
	}

	return {
		duration,
		hasAudio,
		poster,
		posterWidth,
		posterHeight,
		renditions,
	};
};

self.addEventListener("message", (event: MessageEvent<TranscodeRequest>) => {
	transcode(event.data)
		.then((result) => {
			post(
				{ type: "result", ...result },
				result.renditions.map((rendition) => rendition.data),
			);
		})
		.catch((error: unknown) => {
			post({
				type: "error",
				message: error instanceof Error ? error.message : String(error),
			});
		});
});
