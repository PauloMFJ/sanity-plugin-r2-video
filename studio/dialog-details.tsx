import { TrashIcon } from "@sanity/icons/Trash";
import {
	Box,
	Button,
	Card,
	Dialog,
	Flex,
	Select,
	Stack,
	TextInput,
} from "@sanity/ui";
import { useState } from "react";
import { useR2VideoClient } from "./config-context";
import { useFolders } from "./folders";
import { toMessage } from "./format";
import type { LibraryAsset } from "./tool-video-library";
import { DialogActions, Field, Notice } from "./ui";
import { VideoPreview } from "./video-preview";
import { VideoSummary } from "./video-summary";

type Props = {
	asset: LibraryAsset;
	onChanged: () => void;
	onDelete: () => void;
	onClose: () => void;
};

/** Everything the pipeline recorded about one video, including every rendition. */
export const DialogDetails = ({
	asset,
	onChanged,
	onDelete,
	onClose,
}: Props) => {
	const { client } = useR2VideoClient();

	// Every folder, not just the ones already holding video - the point of
	// changing folder is often to move something somewhere new
	const { paths } = useFolders();
	const [folderId, setFolderId] = useState(
		asset.folder ? asset.folder._ref : "",
	);
	const [filename, setFilename] = useState(asset.filename);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// A document the upload pipeline never finished writing. There is nothing to
	// play, nothing to rename that matters, and no objects behind it - the only
	// useful action is removing it
	const isBroken = asset.renditions.length === 0;

	const trimmed = filename.trim();
	const savedFolderId = asset.folder ? asset.folder._ref : "";

	const isRenamed = trimmed.length > 0 && trimmed !== asset.filename;
	const isMoved = folderId !== savedFolderId;
	const isDirty = isRenamed || isMoved;

	const reset = () => {
		setFilename(asset.filename);
		setFolderId(savedFolderId);
	};

	/**
	 * Commits both fields together. They used to save independently - folder on
	 * change, name on its own button - which made one silently persist while the
	 * other sat unsaved, with no way to tell which was which.
	 */
	const save = async () => {
		if (!isDirty) {
			return;
		}

		setIsSaving(true);
		setError(null);

		const changes: Record<string, unknown> = {};
		const removals: string[] = [];

		if (isRenamed) {
			changes.filename = trimmed;
		}

		if (isMoved) {
			if (folderId) {
				changes.folder = { _type: "reference", _ref: folderId };
			} else {
				removals.push("folder");
			}
		}

		try {
			let mutation = client.patch(asset._id);

			if (Object.keys(changes).length > 0) {
				mutation = mutation.set(changes);
			}

			if (removals.length > 0) {
				mutation = mutation.unset(removals);
			}

			await mutation.commit();
			onChanged();
		} catch (caught) {
			reset();
			setError(toMessage(caught));
		}

		setIsSaving(false);
	};

	return (
		<Dialog
			header={asset.filename || "Untitled video"}
			id="r2-video-details"
			width={1}
			onClose={isSaving ? undefined : onClose}
			footer={
				<DialogActions
					aside={
						<Button
							aria-label="Delete video"
							disabled={isSaving}
							icon={TrashIcon}
							mode="ghost"
							tone="critical"
							onClick={onDelete}
						/>
					}
					cancel={{
						text: isDirty ? "Discard" : "Close",
						disabled: isSaving,
						onClick: isDirty ? reset : onClose,
					}}
					confirm={
						isBroken
							? undefined
							: {
									text: isSaving ? "Saving…" : "Save changes",
									tone: "primary",
									disabled: isSaving || !isDirty,
									onClick: save,
								}
					}
				/>
			}
		>
			<Card padding={4}>
				{isBroken ? (
					<Notice tone="caution">
						This video was never finished uploading, so it has no renditions and
						nothing stored behind it. Delete it.
					</Notice>
				) : (
					<Stack gap={5}>
						<VideoPreview
							renditions={asset.renditions}
							posterUrl={asset.posterUrl}
						/>

						<Flex gap={3}>
							<Box flex={1}>
								<Field label="Filename">
									<TextInput
										aria-label="Filename"
										disabled={isSaving}
										value={filename}
										onChange={(event) => setFilename(event.currentTarget.value)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												save();
											}
										}}
									/>
								</Field>
							</Box>

							<Box flex={1}>
								<Field label="Folder">
									<Select
										aria-label="Folder"
										disabled={isSaving}
										value={folderId}
										onChange={(event) => setFolderId(event.currentTarget.value)}
									>
										<option value="">No folder</option>
										{paths.map((entry) => (
											<option key={entry.id} value={entry.id}>
												{entry.path}
											</option>
										))}
									</Select>
								</Field>
							</Box>
						</Flex>

						{error && <Notice tone="critical">{error}</Notice>}

						<VideoSummary
							duration={asset.duration}
							hasAudio={asset.hasAudio}
							renditions={asset.renditions}
							uploadedAt={asset.uploadedAt}
						/>
					</Stack>
				)}
			</Card>
		</Dialog>
	);
};
