import { canEncodeVideo, type VideoCodec } from "mediabunny";
import type {
	TranscodedRendition,
	TranscodeMessage,
	TranscodeRequest,
} from "./transcode.worker";

export type { TranscodedRendition };
export type TranscodeResult = {
	duration: number;
	hasAudio: boolean;
	poster: Blob;
	posterWidth: number;
	posterHeight: number;
	renditions: TranscodedRendition[];
};

/**
 * Whether this browser can encode the configured codec. Chrome can encode the
 * h264 default; the gate exists so anything that can't gets told, rather than
 * failing halfway through an upload.
 */
export const canEncodeLadder = (codec: VideoCodec) => {
	return canEncodeVideo(codec);
};

/**
 * Runs the whole ladder in a worker. Mediabunny does not move off the main
 * thread on its own, and an encode there freezes the Studio for its duration.
 */
export const transcodeVideo = (
	request: TranscodeRequest,
	progressed: (progress: number, label: string) => void,
) => {
	return new Promise<TranscodeResult>((resolve, reject) => {
		const worker = new Worker(
			new URL("./transcode.worker.js", import.meta.url),
			{ type: "module" },
		);

		worker.addEventListener(
			"message",
			(event: MessageEvent<TranscodeMessage>) => {
				const message = event.data;

				if (message.type === "progress") {
					progressed(message.progress, message.label);
					return;
				}

				worker.terminate();

				if (message.type === "error") {
					reject(new Error(message.message));
					return;
				}

				resolve(message);
			},
		);

		worker.addEventListener("error", (event) => {
			worker.terminate();
			reject(new Error(event.message));
		});

		worker.postMessage(request);
	});
};
