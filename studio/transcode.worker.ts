/// <reference lib="webworker" />

import type { AudioCodec, VideoCodec } from "mediabunny";
import {
	ALL_FORMATS,
	BlobSource,
	BufferTarget,
	CanvasSink,
	Conversion,
	EncodedPacketSink,
	Input,
	type InputVideoTrack,
	Mp4OutputFormat,
	Output,
	Quality,
} from "mediabunny";

/**
 * The heights worth encoding for a source of the given height, largest first.
 * Never upscales, so a 900p source stops at 720p. A source shorter than every
 * tier falls back to the shortest one, which does upscale - one rendition
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
 * so the derived width rounds to the nearest even number. That rounding leaves
 * the box up to a pixel off the source's true aspect, which the encode covers
 * rather than pads - see the `fit` below.
 */
const resolveWidth = (height: number, aspectRatio: number): number => {
	return Math.round((height * aspectRatio) / 2) * 2;
};

/**
 * The rate frames arrive at while something moves: the most common gap between
 * frames, averaged so 29.97 stays 29.97. Not the average of every gap - a
 * screen recording holds frames while nothing changes, dragging that far below
 * its real cadence. Reads timestamps only, so nothing is decoded.
 */
const resolveFrameRate = async (track: InputVideoTrack) => {
	const timestamps: number[] = [];
	const packets = new EncodedPacketSink(track).packets(undefined, undefined, {
		metadataOnly: true,
	});

	for await (const packet of packets) {
		timestamps.push(packet.timestamp);
	}

	// Decode order, which B-frames put out of display order
	timestamps.sort((a, b) => a - b);

	// Grouped by nearest whole rate, which absorbs timestamp rounding without
	// merging genuinely different cadences
	const groups = new Map<number, number[]>();

	for (let index = 1; index < timestamps.length; index += 1) {
		const gap = timestamps[index] - timestamps[index - 1];
		const rate = gap > 0 ? Math.round(1 / gap) : 0;

		if (rate >= 1) {
			const group = groups.get(rate) ?? [];
			group.push(gap);
			groups.set(rate, group);
		}
	}

	let peak: number[] = [];

	for (const gaps of groups.values()) {
		if (gaps.length > peak.length) {
			peak = gaps;
		}
	}

	if (peak.length === 0) {
		return undefined;
	}

	const meanGap = peak.reduce((total, gap) => total + gap, 0) / peak.length;

	// Three decimals keep 29.97 and 23.976 while dropping float noise
	return Math.round((1 / meanGap) * 1000) / 1000;
};

/** Encoding settings, resolved by the caller so this file holds no defaults. */
export type TranscodeOptions = {
	heights: number[];
	videoCodec: VideoCodec;
	audioCodec: AudioCodec;
	quality: number;
	nativeTopTier: boolean;
};

/** What the main thread sends in. */
export type TranscodeRequest = {
	file: File;
	keepAudio: boolean;
	options: TranscodeOptions;

	/**
	 * Encode only the tallest tier and stop. Used to show what the current
	 * settings actually produce before committing to the whole ladder - the top
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
			frameRate?: number;
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

/** The first frame, as a full-quality JPEG. Optimised on delivery. */
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
		poster: await canvas.convertToBlob({ type: "image/jpeg", quality: 1 }),
		posterWidth: canvas.width,
		posterHeight: canvas.height,
	};
};

/**
 * Encodes one rendition and returns the finished MP4 bytes.
 *
 * When `isNative`, no size or quality is requested at all. Mediabunny only
 * transcodes if something forces it to - a resize, a codec change, or a quality
 * setting - so omitting all three takes its packet-copy fast path: no
 * re-encode, no generation loss, and near-instant.
 */
const encodeRendition = async (
	source: Blob,
	width: number,
	height: number,
	hasAudio: boolean,
	isNative: boolean,
	frameRate: number | undefined,
	options: TranscodeOptions,
	progressed: (progress: number) => void,
) => {
	const quality = new Quality(options.quality);

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
					// Cover, not contain: the even-width rounding above means the
					// box rarely matches the source aspect exactly, and contain
					// fills that sub-pixel gap with black bars that survive into
					// the file. Cover crops the under-a-pixel overflow instead
					fit: "cover",
					codec: options.videoCodec,
					quality,

					// Constant, repeating held frames - browsers pace playback off
					// the average rate, and variable timing stutters in them
					frameRate,
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
	const frameRate = await resolveFrameRate(track);

	const { poster, posterWidth, posterHeight } = await extractPoster(track);

	const full = resolveHeights(sourceHeight, options.heights);
	const heights = topTierOnly ? full.slice(0, 1) : full;
	const aspectRatio = sourceWidth / sourceHeight;
	const renditions: TranscodedRendition[] = [];

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
			file,
			width,
			height,
			hasAudio,
			isNative,
			frameRate,
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
	}

	return {
		duration,
		frameRate,
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
