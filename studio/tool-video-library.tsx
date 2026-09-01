import { SearchIcon } from "@sanity/icons/Search";
import { SyncIcon } from "@sanity/icons/Sync";
import { UploadIcon } from "@sanity/icons/Upload";
import {
	Box,
	Button,
	Card,
	Flex,
	Grid,
	Spinner,
	Stack,
	Text,
	TextInput,
} from "@sanity/ui";
import { useCallback, useEffect, useState } from "react";
import { useClient } from "sanity";
import { useR2VideoConfig } from "./config-context";
import { DialogDelete } from "./dialog-delete";
import { DialogDetails } from "./dialog-details";
import { DialogOrphans } from "./dialog-orphans";
import { DialogUpload } from "./dialog-upload";
import { DragOverlay, useFileDrop } from "./file-drop";
import { FolderSidebar } from "./folder-sidebar";
import { fetchFolders, type MediaFolder, resolveFolderPaths } from "./folders";
import type { R2VideoAsset } from "./types";

const QUERY_ASSETS = `*[_type == "r2Video.asset"] | order(uploadedAt desc){
	_id,
	_type,
	filename,
	folder,
	poster,
	duration,
	hasAudio,
	renditions,
	uploadedAt,
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
	if (isFiltered || !asset.folderName) {
		return asset.filename;
	}

	return `${slugify(asset.folderName)}/${asset.filename}`;
};

export type LibraryAsset = R2VideoAsset & {
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
	const config = useR2VideoConfig();
	const client = useClient({ apiVersion: config.apiVersion });

	const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
	const [folders, setFolders] = useState<MediaFolder[]>([]);
	const [search, setSearch] = useState("");
	const [folderId, setFolderId] = useState("");
	const [isUploadOpen, setIsUploadOpen] = useState(false);
	const [isOrphansOpen, setIsOrphansOpen] = useState(false);
	const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
	const [detailing, setDetailing] = useState<LibraryAsset | null>(null);
	const [deleting, setDeleting] = useState<LibraryAsset | null>(null);

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
	const { isDragging, dropProps } = useFileDrop({
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
		return matches(asset, search) && inFolder;
	});

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

						{assets === null && (
							<Flex align="center" gap={3} padding={4}>
								<Spinner muted />
								<Text muted size={1}>
									Loading library…
								</Text>
							</Flex>
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
								<Card
									key={asset._id}
									as="button"
									border
									padding={2}
									radius={2}
									style={{ cursor: "pointer", textAlign: "left" }}
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
											</Text>
										</Stack>
									</Stack>
								</Card>
							))}
						</Grid>
					</Stack>
				</Box>
			</Box>

			{isDragging && <DragOverlay />}

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
						setDeleting(detailing);
						setDetailing(null);
					}}
					onClose={() => setDetailing(null)}
				/>
			)}

			{deleting && (
				<DialogDelete
					asset={deleting}
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
