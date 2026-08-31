import { TrashIcon } from "@sanity/icons/Trash";
import {
	Box,
	Button,
	Card,
	Dialog,
	Flex,
	Grid,
	Select,
	Stack,
	Text,
	TextInput,
} from "@sanity/ui";
import { useEffect, useState } from "react";
import { useClient } from "sanity";
import { useR2VideoConfig } from "./config-context";
import { fetchFolders, type MediaFolder, resolveFolderPaths } from "./folders";
import { formatDuration, formatSize } from "./format";
import type { LibraryAsset } from "./tool-video-library";
import { VideoPreview } from "./video-preview";

type FieldProps = {
	label: string;
	children: React.ReactNode;
};

/** A label above its control, so inputs of different heights still line up. */
const Field = ({ label, children }: FieldProps) => {
	return (
		<Stack gap={3}>
			<Text muted size={1} weight="medium">
				{label}
			</Text>
			{children}
		</Stack>
	);
};

type FactProps = {
	label: string;
	value: string;
};

/** One read-only detail. Uniform by construction — every value is a string. */
const Fact = ({ label, value }: FactProps) => {
	return (
		<Stack gap={2}>
			<Text muted size={0}>
				{label}
			</Text>
			<Text size={1}>{value}</Text>
		</Stack>
	);
};

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
	const config = useR2VideoConfig();
	const client = useClient({ apiVersion: config.apiVersion });

	const [folders, setFolders] = useState<MediaFolder[]>([]);
	const [folderId, setFolderId] = useState(
		asset.folder ? asset.folder._ref : "",
	);
	const [filename, setFilename] = useState(asset.filename);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchFolders(client, config.folders.type).then(setFolders);
	}, [client, config.folders.type]);

	const totalBytes = asset.renditions.reduce((total, rendition) => {
		return total + rendition.size;
	}, 0);

	// Stored in encode order, which happens to be largest first — sorted here so
	// the list is deliberately ordered rather than incidentally
	const ordered = [...asset.renditions].sort((a, b) => b.height - a.height);
	const largest = ordered[0];

	// Every folder, not just the ones already holding video — the point of
	// changing folder is often to move something somewhere new
	const paths = resolveFolderPaths(folders);

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
	 * Commits both fields together. They used to save independently — folder on
	 * change, name on its own button — which made one silently persist while the
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
			setError(caught instanceof Error ? caught.message : String(caught));
		}

		setIsSaving(false);
	};

	return (
		<Dialog
			header={asset.filename}
			id="r2-video-details"
			width={1}
			onClose={isSaving ? undefined : onClose}
			footer={
				<Card borderTop padding={2}>
					<Flex gap={2}>
						<Button
							aria-label="Delete video"
							disabled={isSaving}
							icon={TrashIcon}
							mode="ghost"
							tone="critical"
							onClick={onDelete}
						/>

						<Box flex={1}>
							<Button
								disabled={isSaving}
								mode="ghost"
								text={isDirty ? "Discard" : "Close"}
								width="fill"
								onClick={isDirty ? reset : onClose}
							/>
						</Box>
						<Box flex={1}>
							<Button
								disabled={isSaving || !isDirty}
								text={isSaving ? "Saving…" : "Save changes"}
								tone="primary"
								width="fill"
								onClick={save}
							/>
						</Box>
					</Flex>
				</Card>
			}
		>
			<Card padding={4}>
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

					{error && (
						<Card padding={3} radius={2} tone="critical">
							<Text size={1}>{error}</Text>
						</Card>
					)}

					<Card border padding={4} radius={2} tone="transparent">
						<Grid gap={4} gridTemplateColumns={[2, 4]}>
							<Fact
								label="Source"
								value={
									largest ? `${largest.width} × ${largest.height}` : "Unknown"
								}
							/>
							<Fact label="Duration" value={formatDuration(asset.duration)} />
							<Fact
								label="Audio"
								value={asset.hasAudio ? "Kept" : "Stripped"}
							/>
							<Fact label="Total" value={formatSize(totalBytes)} />
						</Grid>
					</Card>

					<Stack gap={3}>
						<Text muted size={1} weight="medium">
							Renditions
						</Text>

						<Card border radius={2}>
							{ordered.map((rendition, index) => (
								<Card
									key={rendition.key}
									borderTop={index > 0}
									padding={3}
									radius={0}
								>
									<Flex align="center" gap={3}>
										<Box flex={1}>
											<Text size={1}>
												{rendition.width} × {rendition.height}
											</Text>
										</Box>
										<Text muted size={1}>
											{formatSize(rendition.size)}
										</Text>
									</Flex>
								</Card>
							))}
						</Card>
					</Stack>

					<Text muted size={0}>
						Uploaded {new Date(asset.uploadedAt).toLocaleString()}
					</Text>
				</Stack>
			</Card>
		</Dialog>
	);
};
