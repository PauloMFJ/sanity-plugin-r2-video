import { AccessDeniedIcon } from "@sanity/icons/AccessDenied";
import { UploadIcon } from "@sanity/icons/Upload";
import { Card, Flex, Text } from "@sanity/ui";
import { type DragEvent, useEffect, useRef, useState } from "react";

/** Whether a drag is carrying something this field can actually take. */
const hasVideoFile = (transfer: DataTransfer) => {
	return Array.from(transfer.items).some((item) => {
		if (item.kind !== "file") {
			return false;
		}

		// A drag reports the type but never the name, and some sources report no
		// type at all. Those are let through rather than rejected on a guess
		return item.type === "" || item.type.startsWith("video/");
	});
};

type DropToUploadProps = {
	isRejected: boolean;
};

/**
 * The drop state Sanity's own image field uses: the input stays visible and
 * ghosts through a tinted wash, rather than being hidden behind a scrim. It
 * bleeds a few pixels past the input it covers, the way the native one does,
 * and is transparent to the pointer so the drop lands on the handlers under it.
 */
export const DropToUpload = ({ isRejected }: DropToUploadProps) => {
	return (
		<Card
			radius={2}
			tone={isRejected ? "critical" : "primary"}
			style={{
				position: "absolute",
				inset: -4,
				zIndex: 3,
				opacity: 0.9,
				pointerEvents: "none",
			}}
		>
			<Flex align="center" gap={2} justify="center" style={{ height: "100%" }}>
				<Text size={2}>
					{isRejected ? <AccessDeniedIcon /> : <UploadIcon />}
				</Text>
				<Text size={2}>
					{isRejected ? "Can't upload this file here" : "Drop to upload"}
				</Text>
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
	const [isRejected, setIsRejected] = useState(false);
	const depth = useRef(0);

	const reset = () => {
		depth.current = 0;
		setIsDragging(false);
		setIsRejected(false);
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
		setIsRejected(!hasVideoFile(event.dataTransfer));
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
		isRejected,
		dropProps: {
			onDragEnter: dragEntered,
			onDragLeave: dragLeft,
			onDragOver: dragOver,
			onDrop: dropped,
		},
	};
};
