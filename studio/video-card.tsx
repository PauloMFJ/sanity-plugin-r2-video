import { Box, Card, Checkbox, Stack, Text } from "@sanity/ui";
import type { MouseEvent } from "react";
import styled from "styled-components";
import type { LibraryAsset } from "./tool-video-library";

/**
 * Folder name in the same shape as an object key - lowercased, punctuation
 * collapsed to hyphens - so a card reads like the path it came from.
 */
const slugify = (name: string) => {
	return (
		name
			.toLowerCase()
			// Dropped rather than hyphenated, so "Hannon's" becomes `hannons`
			.replace(/['’]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
	);
};

/**
 * `folder/name`, or just the name when there's no folder to show - the video
 * has none, or the grid is already showing one folder.
 */
const toTitle = (asset: LibraryAsset, isInFolderView: boolean) => {
	const filename = asset.filename || "Untitled video";

	if (isInFolderView || !asset.folderName) {
		return filename;
	}

	return `${slugify(asset.folderName)}/${filename}`;
};

/**
 * Its checkbox stays hidden until the card is hovered, focused, or picked. In
 * CSS rather than hover state, which would re-render the grid on every move.
 */
const SelectableCard = styled(Box)`
	position: relative;

	& [data-checkbox] {
		opacity: 0;
	}

	&:hover [data-checkbox],
	& [data-checkbox]:focus-within,
	& [data-checkbox][data-selected="true"] {
		opacity: 1;
	}
`;

type Props = {
	asset: LibraryAsset;
	isSelected: boolean;
	isInFolderView: boolean;
	onToggle: () => void;
	onOpen: () => void;
};

/** One video in the library grid: poster, title, and a checkbox to pick it. */
export const VideoCard = ({
	asset,
	isSelected,
	isInFolderView,
	onToggle,
	onOpen,
}: Props) => {
	const clicked = (event: MouseEvent) => {
		// Shift picks a card without opening it
		if (event.shiftKey) {
			onToggle();
			return;
		}

		onOpen();
	};

	return (
		<SelectableCard>
			{/* Beside the card rather than inside it - a checkbox within a button is
			    neither valid nor clickable */}
			<Box
				data-checkbox
				data-selected={isSelected}
				style={{ position: "absolute", top: 14, left: 14, zIndex: 1 }}
			>
				<Checkbox
					aria-label={`Select ${asset.filename}`}
					checked={isSelected}
					onChange={onToggle}
				/>
			</Box>

			<Card
				as="button"
				border
				padding={2}
				radius={2}
				style={{ cursor: "pointer", textAlign: "left", width: "100%" }}
				onClick={clicked}
			>
				<Stack gap={3}>
					<Box
						style={{
							aspectRatio: "16 / 9",
							backgroundImage: asset.posterUrl
								? `url(${asset.posterUrl}?w=480&fit=crop&auto=format)`
								: undefined,
							backgroundPosition: "center",
							backgroundSize: "cover",
							borderRadius: 2,
						}}
					/>

					<Stack gap={2}>
						<Text size={1} textOverflow="ellipsis" weight="medium">
							{toTitle(asset, isInFolderView)}
						</Text>
						<Text muted size={1}>
							{asset.renditions.length} sizes
							{asset.hasAudio ? " · audio" : ""}
							{asset.isUsed ? "" : " · unused"}
						</Text>
					</Stack>
				</Stack>
			</Card>
		</SelectableCard>
	);
};
