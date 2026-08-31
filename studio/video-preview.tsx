import { Card, Text } from "@sanity/ui";
import { useR2VideoConfig } from "./config-context";
import type { R2VideoRendition } from "./types";

/** Tallest the player may render, whatever the source's shape. */
const MAX_PLAYER_HEIGHT = 420;

/**
 * The rendition to play in the Studio: the second-tallest available. The top
 * tier is several times the bytes for a player a few hundred pixels wide, and
 * taking one step down works whatever ladder a project configures rather than
 * pinning a tier this file has no business knowing about.
 */
export const resolvePreviewRendition = (renditions: R2VideoRendition[]) => {
	const ordered = [...renditions].sort((a, b) => a.height - b.height);
	if (ordered.length === 0) {
		return undefined;
	}

	return ordered[Math.max(0, ordered.length - 2)];
};

type Props = {
	renditions: R2VideoRendition[];
	posterUrl?: string;
};

/**
 * Plays the video rather than showing its first frame. Muted and looping to
 * match how these are used on the site, but with controls — in the Studio the
 * point is to check the footage, so scrubbing has to be possible.
 */
export const VideoPreview = ({ renditions, posterUrl }: Props) => {
	const config = useR2VideoConfig();
	const rendition = resolvePreviewRendition(renditions);

	if (!rendition) {
		return (
			<Card padding={4} radius={2} tone="caution">
				<Text muted size={1}>
					This video has no renditions to play.
				</Text>
			</Card>
		);
	}

	return (
		<video
			autoPlay
			controls
			loop
			muted
			playsInline
			poster={posterUrl}
			preload="metadata"
			src={`${config.bucketUrl}/${rendition.key}`}
			style={{
				display: "block",

				// Sized by height, not width, so the element is exactly the shape
				// of the video — a width-driven box capped by max-height would
				// letterbox instead, painting bars around anything tall
				maxHeight: MAX_PLAYER_HEIGHT,
				maxWidth: "100%",
				margin: "0 auto",
				aspectRatio: `${rendition.width} / ${rendition.height}`,
				borderRadius: 3,
			}}
		/>
	);
};
