import { UploadIcon } from "@sanity/icons/Upload";
import { Card, Flex, Text } from "@sanity/ui";
import { type DragEvent, useEffect, useRef, useState } from "react";

/**
 * Lifted verbatim from `sanity-plugin-media`'s own `DragActiveContainer`, so
 * dragging into the video library looks identical to dragging into the image
 * one. White on a fixed black scrim, so it takes no theme token.
 */
const OVERLAY_STYLE = {
	alignItems: "center",
	background: "rgba(0, 0, 0, 0.75)",
	color: "#fff",
	display: "flex",
	height: "100%",
	justifyContent: "center",
	position: "absolute",
	right: 0,
	top: 0,
	width: "100%",
	zIndex: 3,
} as const;
export const DragOverlay = () => {
	return (
		<Flex style={OVERLAY_STYLE}>
			<Text size={3} style={{ color: "inherit" }}>
				Drop files to upload
			</Text>
		</Flex>
	);
};

/**
 * The drop state Sanity's own image field uses: the input stays visible and
 * ghosts through a primary-toned wash, rather than being hidden behind a scrim.
 * Fixed to the surface it covers, and transparent to the pointer so the drop
 * lands on the handlers underneath.
 */
export const DropToUpload = () => {
	return (
		<Card
			radius={2}
			tone="primary"
			style={{
				position: "absolute",
				inset: 0,
				zIndex: 3,
				opacity: 0.9,
				pointerEvents: "none",
			}}
		>
			<Flex align="center" gap={2} justify="center" style={{ height: "100%" }}>
				<Text size={2}>
					<UploadIcon />
				</Text>
				<Text size={2}>Drop to upload</Text>
			</Flex>
		</Card>
	);
};

type FileDropConfig = {
	/** Called with the video files from a drop. Never called with an empty list. */
	onDrop: (files: File[]) => void;

	/**
	 * Whether this surface accepts drops. A surface behind an open dialog must
	 * turn itself off, or it reacts to drags meant for what's on top of it.
	 */
	isEnabled: boolean;
};

/**
 * Depth-counted drag tracking plus the props to spread onto the drop surface.
 *
 * The counter matters because `dragenter` and `dragleave` fire for every child
 * element crossed - trusting a single `dragleave` makes the overlay flicker as
 * the pointer moves over a grid.
 */
export const useFileDrop = ({ onDrop, isEnabled }: FileDropConfig) => {
	const [isDragging, setIsDragging] = useState(false);
	const depth = useRef(0);

	const reset = () => {
		depth.current = 0;
		setIsDragging(false);
	};

	// A surface can be disabled mid-drag by a dialog opening over it, which
	// would otherwise strand the overlay on screen with no leave event coming.
	// In an effect rather than during render, so the ref isn't mutated mid-render
	useEffect(() => {
		if (!isEnabled) {
			depth.current = 0;
			setIsDragging(false);
		}
	}, [isEnabled]);

	const dragEntered = (event: DragEvent) => {
		if (!isEnabled) {
			return;
		}

		event.preventDefault();
		depth.current += 1;
		setIsDragging(true);
	};

	const dragLeft = (event: DragEvent) => {
		if (!isEnabled) {
			return;
		}

		event.preventDefault();
		depth.current -= 1;

		if (depth.current <= 0) {
			reset();
		}
	};

	const dragOver = (event: DragEvent) => {
		if (isEnabled) {
			event.preventDefault();
		}
	};

	const dropped = (event: DragEvent) => {
		if (!isEnabled) {
			return;
		}

		event.preventDefault();
		reset();

		const files = Array.from(event.dataTransfer.files).filter((file) => {
			return file.type.startsWith("video/");
		});

		if (files.length > 0) {
			onDrop(files);
		}
	};

	return {
		isDragging: isDragging && isEnabled,
		dropProps: {
			onDragEnter: dragEntered,
			onDragLeave: dragLeft,
			onDragOver: dragOver,
			onDrop: dropped,
		},
	};
};
