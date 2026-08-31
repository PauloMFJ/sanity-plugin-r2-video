import { Box, Button, Card, Flex, Spinner, Stack, Text } from "@sanity/ui";
import { useEffect, useState } from "react";
import { formatBitrate, formatSize } from "./format";
import { transcodeVideo } from "./transcode";
import type { TranscodeOptions } from "./transcode.worker";

export type EncodePreview = {
	url: string;
	width: number;
	height: number;
	bytes: number;
	duration: number;
};

type Props = {
	file: File | null;
	keepAudio: boolean;
	encoding: TranscodeOptions;
};

/**
 * Encodes only the tallest tier, so the current settings can be judged before
 * committing to the whole ladder.
 *
 * The top tier is the one that varies most — quantizer-driven encoding means
 * its size depends on how detailed the footage is, not on anything configured,
 * so it is also the one most likely to surprise.
 */
export const PreviewEncode = ({ file, keepAudio, encoding }: Props) => {
	const [preview, setPreview] = useState<EncodePreview | null>(null);
	const [isEncoding, setIsEncoding] = useState(false);
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);

	// A preview is only valid for the settings that produced it, so drop it the
	// moment any of them change rather than showing a stale result. Relies on
	// `encoding` being memoised by the caller
	useEffect(() => {
		setPreview(null);
		setError(null);
	}, []);

	useEffect(() => {
		return () => {
			if (preview) {
				URL.revokeObjectURL(preview.url);
			}
		};
	}, [preview]);

	if (!file) {
		return null;
	}

	const encode = async () => {
		setIsEncoding(true);
		setProgress(0);
		setError(null);

		try {
			const result = await transcodeVideo(
				{ file, keepAudio, options: encoding, topTierOnly: true },
				(value) => setProgress(value),
			);

			const [rendition] = result.renditions;
			if (!rendition) {
				throw new Error("Nothing was encoded.");
			}

			const blob = new Blob([rendition.data], { type: "video/mp4" });

			setPreview({
				url: URL.createObjectURL(blob),
				width: rendition.width,
				height: rendition.height,
				bytes: blob.size,
				duration: result.duration,
			});
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
		}

		setIsEncoding(false);
	};

	return (
		<Card border padding={3} radius={2} tone="transparent">
			<Stack gap={3}>
				<Flex align="center" gap={3}>
					<Box flex={1}>
						<Text muted size={1}>
							Test these settings on {file.name}
						</Text>
					</Box>
					<Button
						disabled={isEncoding}
						mode="ghost"
						text={preview ? "Re-encode" : "Preview"}
						onClick={encode}
					/>
				</Flex>

				{isEncoding && (
					<Flex align="center" gap={3}>
						<Spinner muted />
						<Text muted size={1}>
							Encoding top tier — {Math.round(progress * 100)}%
						</Text>
					</Flex>
				)}

				{error && (
					<Card padding={3} radius={2} tone="critical">
						<Text size={1}>{error}</Text>
					</Card>
				)}

				{preview && !isEncoding && (
					<Stack gap={3}>
						<video
							controls
							loop
							muted
							playsInline
							src={preview.url}
							style={{
								display: "block",

								// Same reasoning as the details player: capped by height and
								// centred, so nothing is letterboxed
								maxHeight: 320,
								maxWidth: "100%",
								margin: "0 auto",
								aspectRatio: `${preview.width} / ${preview.height}`,
								borderRadius: 3,
							}}
						/>
						<Text muted size={1}>
							{preview.width} × {preview.height} · {formatSize(preview.bytes)} ·{" "}
							{formatBitrate(preview.bytes, preview.duration)}
						</Text>
						<Text muted size={0}>
							This is the largest rendition. Smaller tiers are a fraction of it.
						</Text>
					</Stack>
				)}
			</Stack>
		</Card>
	);
};
