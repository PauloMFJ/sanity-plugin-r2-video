import { SearchIcon } from "@sanity/icons/Search";
import { SyncIcon } from "@sanity/icons/Sync";
import { TrashIcon } from "@sanity/icons/Trash";
import { UploadIcon } from "@sanity/icons/Upload";
import {
	Box,
	Button,
	Card,
	Checkbox,
	Flex,
	Grid,
	Select,
	Stack,
	Text,
	TextInput,
} from "@sanity/ui";
import { useCallback, useEffect, useState } from "react";
import { useR2VideoClient } from "./config-context";
import { DialogDelete } from "./dialog-delete";
import { DialogDetails } from "./dialog-details";
import { DialogOrphans } from "./dialog-orphans";
import { DialogUpload } from "./dialog-upload";
import { DropToUpload, useFileDrop } from "./file-drop";
import { FolderSidebar } from "./folder-sidebar";
import {
	fetchFolders,
	type MediaFolder,
	resolveFolderPaths,
	useFolders,
} from "./folders";
import { pluralize } from "./format";
import type { R2VideoAsset } from "./types";
import { Loading } from "./ui";

/**
 * Every field the upload pipeline writes is coalesced, because a document it
 * never finished - Sanity's own create button made these, before the reference
 * field disabled it - has none of them, and one of those in the dataset used to
 * take the whole tool down. Showing it as an empty card is what makes it
 * deletable.
 *
 * `poster` and `uploadedAt` are left alone: both already read as optional
 * everywhere they're used.
 */
const QUERY_ASSETS = `*[_type == "r2Video.asset"] | order(uploadedAt desc){
	_id,
	_type,
	"filename": coalesce(filename, ""),
	folder,
	poster,
	"duration": coalesce(duration, 0),
	"hasAudio": coalesce(hasAudio, false),
	"renditions": coalesce(renditions, []),
	uploadedAt,
	"isUsed": count(*[references(^._id)]) > 0,
	"posterUrl": poster.asset->url,
	"folderName": folder->name
}`;

/**
 * Folder name in the same shape as an object key - lowercased, punctuation
 * collapsed to hyphens - so a card reads like the path it came from.
 */
const slugify = (name: string) => {
	return (
		name
			.toLowerCase()
			// Dropped rather than hyphenated, so a possessive reads as one word
			// - "Hannon's" becomes `hannons`, not `hannon-s`
			.replace(/['\u2019]/g, "")
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
	);
};

/**
 * `folder/name`, or just the name when there's no folder to show - either
 * because the video has none, or because the grid is already filtered to one
 * and repeating it on every card says nothing.
 */
const toTitle = (asset: LibraryAsset, isFiltered: boolean) => {
	const filename = asset.filename || "Untitled video";

	if (isFiltered || !asset.folderName) {
		return filename;
	}

	return `${slugify(asset.folderName)}/${filename}`;
};

export type LibraryAsset = R2VideoAsset & {
	isUsed: boolean;
	posterUrl?: string;
	folderName?: string;
};

const matches = (asset: LibraryAsset, search: string) => {
	if (!search) {
		return true;
	}

	const term = search.toLowerCase();
	const folderName = asset.folderName ?? "";

	return (
		asset.filename.toLowerCase().includes(term) ||
		folderName.toLowerCase().includes(term)
	);
};

export const ToolVideoLibrary = () => {
	const { config, client } = useR2VideoClient();

	// Every folder, not only those already holding video - a selection is often
	// moved somewhere new
	const { paths: allPaths } = useFolders();

	const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
	const [folders, setFolders] = useState<MediaFolder[]>([]);
	const [search, setSearch] = useState("");
	const [folderId, setFolderId] = useState("");
	const [isUploadOpen, setIsUploadOpen] = useState(false);
	const [isOrphansOpen, setIsOrphansOpen] = useState(false);
	const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
	const [detailing, setDetailing] = useState<LibraryAsset | null>(null);
	const [deleting, setDeleting] = useState<LibraryAsset[] | null>(null);
	const [isUnusedOnly, setIsUnusedOnly] = useState(false);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [isMoving, setIsMoving] = useState(false);

	const load = useCallback(() => {
		client.fetch<LibraryAsset[]>(QUERY_ASSETS).then(setAssets);
		fetchFolders(client, config.folders.type).then(setFolders);
	}, [client, config.folders.type]);

	useEffect(load, [load]);

	// Videos per folder, so the sidebar can show counts the way the media
	// library does
	const counts = new Map<string, number>();

	for (const asset of assets ?? []) {
		if (asset.folder) {
			const id = asset.folder._ref;
			counts.set(id, (counts.get(id) ?? 0) + 1);
		}
	}

	// Only folders that actually hold video - the image library's full tree
	// would bury the handful that matter here
	const paths = resolveFolderPaths(folders).filter((entry) => {
		return counts.has(entry.id);
	});

	// Disabled while the upload dialog is open - that dialog owns drops from
	// then on, and a surface underneath must not also react to them
	const { isDragging, isRejected, dropProps } = useFileDrop({
		isEnabled: !isUploadOpen,
		onDrop: (files) => {
			// Staged, not started - the dialog opens so folder and audio can be
			// set before minutes of encoding begin
			setDroppedFiles(files);
			setIsUploadOpen(true);
		},
	});

	const closeUpload = () => {
		setIsUploadOpen(false);
		setDroppedFiles([]);
		load();
	};

	const visible = (assets ?? []).filter((asset) => {
		const inFolder =
			!folderId || (asset.folder && asset.folder._ref === folderId);
		const isShown = !isUnusedOnly || !asset.isUsed;

		return matches(asset, search) && inFolder && isShown;
	});

	const selected = visible.filter((asset) => selectedIds.includes(asset._id));

	const toggleSelected = (id: string) => {
		setSelectedIds((current) => {
			return current.includes(id)
				? current.filter((entry) => entry !== id)
				: [...current, id];
		});
	};

	/** Files the selection into a folder, or out of one when given no id. */
	const moveSelected = async (targetId: string) => {
		setIsMoving(true);

		let transaction = client.transaction();

		for (const asset of selected) {
			transaction = targetId
				? transaction.patch(asset._id, (patch) =>
						patch.set({ folder: { _type: "reference", _ref: targetId } }),
					)
				: transaction.patch(asset._id, (patch) => patch.unset(["folder"]));
		}

		await transaction.commit();

		setIsMoving(false);
		setSelectedIds([]);
		load();
	};

	return (
		<Flex
			style={{ position: "relative", height: "100%", minHeight: "100%" }}
			{...dropProps}
		>
			<FolderSidebar
				counts={counts}
				folders={paths}
				selectedId={folderId}
				total={(assets ?? []).length}
				onSelect={setFolderId}
			/>

			<Box flex={1} style={{ overflowY: "auto" }}>
				<Box padding={4}>
					<Stack gap={4}>
						<Flex align="center" gap={3}>
							<Box flex={1}>
								<TextInput
									icon={SearchIcon}
									placeholder="Search videos"
									value={search}
									onChange={(event) => setSearch(event.currentTarget.value)}
								/>
							</Box>
							<Button
								mode={isUnusedOnly ? "default" : "ghost"}
								text="Unused"
								tone={isUnusedOnly ? "primary" : "default"}
								onClick={() => setIsUnusedOnly(!isUnusedOnly)}
							/>

							<Button
								icon={SyncIcon}
								mode="ghost"
								text="Sync"
								onClick={() => setIsOrphansOpen(true)}
							/>

							<Button
								icon={UploadIcon}
								text="Upload"
								tone="primary"
								onClick={() => setIsUploadOpen(true)}
							/>
						</Flex>

						{selected.length > 0 && (
							<Card border padding={2} radius={2} tone="primary">
								<Flex align="center" gap={2}>
									<Box paddingX={2}>
										<Text size={1} weight="medium">
											{pluralize(selected.length, "video")} selected
										</Text>
									</Box>

									<Box flex={1}>
										<Select
											aria-label="Move to folder"
											disabled={isMoving}
											value=""
											onChange={(event) =>
												moveSelected(event.currentTarget.value)
											}
										>
											<option value="" disabled>
												Move to…
											</option>
											<option value="">No folder</option>
											{allPaths.map((entry) => (
												<option key={entry.id} value={entry.id}>
													{entry.path}
												</option>
											))}
										</Select>
									</Box>

									<Button
										disabled={isMoving}
										mode="ghost"
										text="Clear"
										onClick={() => setSelectedIds([])}
									/>
									<Button
										disabled={isMoving}
										icon={TrashIcon}
										mode="ghost"
										text="Delete"
										tone="critical"
										onClick={() => setDeleting(selected)}
									/>
								</Flex>
							</Card>
						)}

						{assets === null && (
							<Box padding={4}>
								<Loading>Loading library…</Loading>
							</Box>
						)}

						{assets !== null && visible.length === 0 && (
							<Card padding={5} radius={2} tone="transparent">
								<Text align="center" muted size={1}>
									No videos here yet.
								</Text>
							</Card>
						)}

						<Grid gridTemplateColumns={[1, 2, 3, 4]} gap={3}>
							{visible.map((asset) => (
								<Box key={asset._id} style={{ position: "relative" }}>
									{/* Beside the card rather than inside it - a checkbox
									    within a button is neither valid nor clickable */}
									<Box
										style={{
											position: "absolute",
											top: 14,
											left: 14,
											zIndex: 1,
										}}
									>
										<Checkbox
											aria-label={`Select ${asset.filename}`}
											checked={selectedIds.includes(asset._id)}
											onChange={() => toggleSelected(asset._id)}
										/>
									</Box>

									<Card
										as="button"
										border
										padding={2}
										radius={2}
										style={{
											cursor: "pointer",
											textAlign: "left",
											width: "100%",
										}}
										onClick={() => setDetailing(asset)}
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
													{toTitle(asset, Boolean(folderId))}
												</Text>
												<Text muted size={1}>
													{asset.renditions.length} sizes
													{asset.hasAudio ? " · audio" : ""}
													{asset.isUsed ? "" : " · unused"}
												</Text>
											</Stack>
										</Stack>
									</Card>
								</Box>
							))}
						</Grid>
					</Stack>
				</Box>
			</Box>

			{isDragging && <DropToUpload isRejected={isRejected} />}

			{isUploadOpen && (
				<DialogUpload
					folderId={folderId}
					initialFiles={droppedFiles}
					onClose={closeUpload}
					onUploaded={load}
				/>
			)}

			{isOrphansOpen && (
				<DialogOrphans
					onCleaned={load}
					onClose={() => setIsOrphansOpen(false)}
				/>
			)}

			{detailing && (
				<DialogDetails
					asset={detailing}
					onChanged={load}
					onDelete={() => {
						// Hand off rather than stacking dialogs - the delete needs the
						// whole surface for its usage list
						setDeleting([detailing]);
						setDetailing(null);
					}}
					onClose={() => setDetailing(null)}
				/>
			)}

			{deleting && (
				<DialogDelete
					assets={deleting}
					onClose={() => setDeleting(null)}
					onDeleted={() => {
						setDeleting(null);
						load();
					}}
				/>
			)}
		</Flex>
	);
};
