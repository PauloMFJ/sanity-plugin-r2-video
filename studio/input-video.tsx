import { UploadIcon } from "@sanity/icons/Upload";
import { Button, Stack } from "@sanity/ui";
import { useState } from "react";
import { type ObjectInputProps, set } from "sanity";
import { DialogUpload } from "./dialog-upload";
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
 * document. Picking an existing one is the default path — a video used twice
 * should be encoded once.
 */
export const InputVideo = (props: ObjectInputProps<R2VideoValue>) => {
	const { onChange, readOnly, renderDefault, schemaType } = props;

	const [isUploadOpen, setIsUploadOpen] = useState(false);

	const closeUpload = () => setIsUploadOpen(false);

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
		<Stack gap={3}>
			{renderDefault(props)}

			<Button
				disabled={readOnly === true}
				icon={UploadIcon}
				mode="ghost"
				text="Upload video"
				onClick={() => setIsUploadOpen(true)}
			/>

			{isUploadOpen && (
				<DialogUpload
					folderId={readFolder(schemaType.options)}
					onClose={closeUpload}
					onUploaded={uploaded}
				/>
			)}
		</Stack>
	);
};
