import { SearchIcon } from "@sanity/icons/Search";
import { SyncIcon } from "@sanity/icons/Sync";
import { UploadIcon } from "@sanity/icons/Upload";
import {
	Box,
	Button,
	Card,
	Flex,
	Grid,
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
import { fetchFolders, type MediaFolder, resolveFolderPaths } from "./folders";
import { toMessage } from "./format";
import { LibraryFilters, passesFilters, toggleFilter } from "./library-filters";
import { SelectionBar } from "./selection-bar";
import type { R2VideoAsset } from "./types";
import { Loading, Notice } from "./ui";
import { VideoCard } from "./video-card";

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
const QUERY_ASSETS = `*[_type == "r2Video.asset" && !(_id in path("drafts.**"))] | order(uploadedAt desc){
	_id,
	_type,
	"filename": coalesce(filename, ""),
	folder,
	poster,
	"duration": coalesce(duration, 0),
	frameRate,
	"hasAudio": coalesce(hasAudio, false),
	"renditions": coalesce(renditions, []),
	uploadedAt,
	"isUsed": defined(*[references(^._id)][0]._id),
	"posterUrl": poster.asset->url,
	"folderName": folder->name
}`;

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

/** Adds an entry to a list, or removes it if it's already there. */
const toggle = (list: string[], entry: string) => {
	return list.includes(entry)
		? list.filter((existing) => existing !== entry)
		: [...list, entry];
};

export const ToolVideoLibrary = () => {
	const { config, client } = useR2VideoClient();

	const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
	const [folders, setFolders] = useState<MediaFolder[]>([]);
	const [search, setSearch] = useState("");
	const [folderId, setFolderId] = useState("");
	const [isUploadOpen, setIsUploadOpen] = useState(false);
	const [isOrphansOpen, setIsOrphansOpen] = useState(false);
	const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
	const [detailingId, setDetailingId] = useState<string | null>(null);
	const [deleting, setDeleting] = useState<LibraryAsset[] | null>(null);
	const [replacing, setReplacing] = useState<LibraryAsset | null>(null);
	const [filterKeys, setFilterKeys] = useState<string[]>([]);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [isMoving, setIsMoving] = useState(false);
	const [error, setError] = useState<string | null>(null);

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

	// Every folder, as a selection is often moved somewhere new
	const allPaths = resolveFolderPaths(folders);

	// Only folders that actually hold video - the image library's full tree
	// would bury the handful that matter here
	const paths = allPaths.filter((entry) => counts.has(entry.id));

	// Looked up each render, so a save that reloads the library reaches it
	const detailing = assets?.find((asset) => asset._id === detailingId) ?? null;

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
		return (
			matches(asset, search) && inFolder && passesFilters(asset, filterKeys)
		);
	});

	const selected = visible.filter((asset) => selectedIds.includes(asset._id));

	/** Files the selection into a folder, or out of one when given no id. */
	const moveSelected = async (targetId: string) => {
		setIsMoving(true);
		setError(null);

		let transaction = client.transaction();

		for (const asset of selected) {
			transaction = targetId
				? transaction.patch(asset._id, (patch) =>
						patch.set({ folder: { _type: "reference", _ref: targetId } }),
					)
				: transaction.patch(asset._id, (patch) => patch.unset(["folder"]));
		}

		try {
			await transaction.commit();
			setSelectedIds([]);
			load();
		} catch (caught) {
			setError(toMessage(caught));
		}

		setIsMoving(false);
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

							<LibraryFilters
								activeKeys={filterKeys}
								onToggle={(key) => setFilterKeys(toggleFilter(filterKeys, key))}
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
							<SelectionBar
								count={selected.length}
								folderPaths={allPaths}
								isMoving={isMoving}
								onClear={() => setSelectedIds([])}
								onDelete={() => setDeleting(selected)}
								onMove={moveSelected}
							/>
						)}

						{error && <Notice tone="critical">{error}</Notice>}

						{assets === null && (
							<Box padding={4}>
								<Loading>Loading library…</Loading>
							</Box>
						)}

						{assets !== null && visible.length === 0 && (
							<Card padding={5} radius={2} tone="transparent">
								<Text align="center" muted size={1}>
									{search || folderId || filterKeys.length > 0
										? "No videos match."
										: "No videos here yet."}
								</Text>
							</Card>
						)}

						<Grid gridTemplateColumns={[1, 2, 3, 4]} gap={3}>
							{visible.map((asset) => (
								<VideoCard
									key={asset._id}
									asset={asset}
									isInFolderView={Boolean(folderId)}
									isSelected={selectedIds.includes(asset._id)}
									onOpen={() => setDetailingId(asset._id)}
									onToggle={() =>
										setSelectedIds((current) => toggle(current, asset._id))
									}
								/>
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
						setDetailingId(null);
					}}
					onReplace={() => {
						setReplacing(detailing);
						setDetailingId(null);
					}}
					onClose={() => setDetailingId(null)}
				/>
			)}

			{replacing && (
				<DialogUpload
					folderId={replacing.folder?._ref ?? ""}
					replacing={replacing}
					onClose={() => {
						setReplacing(null);
						load();
					}}
					onUploaded={load}
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
