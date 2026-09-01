import { UploadIcon } from "@sanity/icons/Upload";
import { Box, Button, Flex, Stack } from "@sanity/ui";
import { useState } from "react";
import { type ObjectInputProps, set } from "sanity";
import { DialogUpload } from "./dialog-upload";
import { DropToUpload, useFileDrop } from "./file-drop";
import type { R2VideoAsset, R2VideoValue } from "./types";

/** Reads the folder a field files its uploads under, if it declares one. */
const readFolder = (options: unknown) => {
	if (typeof options !== "object" || options === null) {
		return "";
	}

	const folder = Reflect.get(options, "folder");
	return typeof folder === "string" ? folder : "";
};

/**
 * Sanity's own reference input, plus a way to add a video without leaving the
 * document. Picking an existing one is the default path - a video used twice
 * should be encoded once.
 *
 * The object holds one field, so its label is dropped: a "Video" field that
 * then labels its only control "Asset" reads as two fields rather than one.
 */
export const InputVideo = (props: ObjectInputProps<R2VideoValue>) => {
	const { onChange, readOnly, renderDefault, schemaType } = props;

	const [isUploadOpen, setIsUploadOpen] = useState(false);
	const [droppedFiles, setDroppedFiles] = useState<File[]>([]);

	const isDisabled = readOnly === true;

	const closeUpload = () => {
		setIsUploadOpen(false);
		setDroppedFiles([]);
	};

	const openUpload = () => {
		setDroppedFiles([]);
		setIsUploadOpen(true);
	};

	// Staged rather than started, the same as dropping onto the library. An
	// encode is minutes of GPU, so it stays behind the dialog's confirm step
	const dropped = (files: File[]) => {
		setDroppedFiles(files);
		setIsUploadOpen(true);
	};

	const { isDragging, isRejected, dropProps } = useFileDrop({
		onDrop: dropped,
		isEnabled: !isDisabled && !isUploadOpen,
	});

	const uploaded = (asset: R2VideoAsset) => {
		onChange(
			set({
				_type: "r2Video",
				asset: { _type: "reference", _ref: asset._id },
			}),
		);

		closeUpload();
	};

	return (
		<Stack gap={3} style={{ position: "relative" }} {...dropProps}>
			{isDragging && <DropToUpload isRejected={isRejected} />}

			<Flex gap={0}>
				<Box flex={1}>
					{/* Renders the members' inputs without their field chrome */}
					{renderDefault({
						...props,
						renderField: (field) => field.children,
					})}
				</Box>

				<Button
					disabled={isDisabled}
					icon={UploadIcon}
					mode="ghost"
					text="Upload"
					onClick={openUpload}
				/>
			</Flex>

			{isUploadOpen && (
				<DialogUpload
					folderId={readFolder(schemaType.options)}
					initialFiles={droppedFiles}
					onClose={closeUpload}
					onUploaded={uploaded}
				/>
			)}
		</Stack>
	);
};
