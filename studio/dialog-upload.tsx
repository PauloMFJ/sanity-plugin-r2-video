import { UploadIcon } from "@sanity/icons/Upload";
import { Box, Button, Card, Dialog, Flex, Stack, Text } from "@sanity/ui";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useClient } from "sanity";
import { useR2VideoConfig } from "./config-context";
import { DragOverlay, useFileDrop } from "./file-drop";
import { fetchFolders, type MediaFolder, resolveFolderPaths } from "./folders";
import { formatSize } from "./format";
import { PreviewEncode } from "./preview-encode";
import { canEncodeLadder } from "./transcode";
import type { R2VideoAsset } from "./types";
import { UnsupportedBrowser } from "./unsupported-browser";
import { UploadSettings } from "./upload-settings";
import { type UploadProgress, uploadVideo } from "./upload-video";

/**
 * `pending` is before the confirm step; everything after it belongs to the run.
 * One list in five states, rather than two lists that have to be kept in step.
 */
type ItemStatus = "pending" | "waiting" | "working" | "done" | "failed";

type QueueItem = {
	id: string;
	file: File;
	status: ItemStatus;
	progress: UploadProgress | null;
	error: string | null;
};

const STAGE_LABELS: Record<UploadProgress["stage"], string> = {
	encoding: "Encoding",
	storing: "Storing",
	saving: "Saving",
};

/**
 * `transparent` rather than `default` - a default-toned card matches the
 * surface behind it, so the rows read as indentation instead of a list.
 */
const STATUS_TONES: Record<
	ItemStatus,
	"transparent" | "critical" | "positive"
> = {
	pending: "transparent",
	waiting: "transparent",
	working: "transparent",
	done: "positive",
	failed: "critical",
};

const describe = (item: QueueItem) => {
	if (item.status === "failed") {
		return item.error ?? "Failed.";
	}

	if (item.status === "done") {
		return "Done";
	}

	if (item.status === "pending") {
		return formatSize(item.file.size);
	}

	if (item.status === "waiting" || !item.progress) {
		return "Waiting";
	}

	const { stage, progress, label } = item.progress;
	return `${STAGE_LABELS[stage]} ${label} · ${Math.round(progress * 100)}%`;
};

const countLabel = (count: number) => {
	return count === 1 ? "1 video" : `${count} video(s)`;
};

const toItem = (file: File): QueueItem => ({
	id: crypto.randomUUID(),
	file,
	status: "pending",
	progress: null,
	error: null,
});

type Props = {
	folderId: string;

	/** Files dropped onto the library, staged rather than started. */
	initialFiles?: File[];
	onUploaded: (asset: R2VideoAsset) => void;
	onClose: () => void;
};

/**
 * Staged upload. Files land as `pending` so folder and audio can be set before
 * anything encodes - encoding is minutes of GPU per video, far too expensive to
 * start on a mis-click and throw away.
 *
 * Once running, files go one at a time on purpose: parallel WebCodecs encodes
 * thrash the GPU rather than finishing sooner.
 */
export const DialogUpload = ({
	folderId,
	initialFiles,
	onUploaded,
	onClose,
}: Props) => {
	const config = useR2VideoConfig();
	const client = useClient({ apiVersion: config.apiVersion });

	const [canEncode, setCanEncode] = useState<boolean | null>(null);
	const [folders, setFolders] = useState<MediaFolder[]>([]);
	const [targetFolder, setTargetFolder] = useState(folderId);
	const [keepAudio, setKeepAudio] = useState(false);
	const [quality, setQuality] = useState(config.encoding.quality);
	const [preferBitrate, setPreferBitrate] = useState(
		config.encoding.preferBitrate,
	);
	const [items, setItems] = useState<QueueItem[]>(
		(initialFiles ?? []).map(toItem),
	);

	const isRunning = useRef(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		canEncodeLadder(config.encoding.videoCodec).then(setCanEncode);
	}, [config.encoding.videoCodec]);

	useEffect(() => {
		fetchFolders(client, config.folders.type).then(setFolders);
	}, [client, config.folders.type]);

	// Config supplies the starting point; each upload can then diverge without
	// touching the Studio's own defaults.
	//
	// Memoised because `PreviewEncode` treats a change here as "these settings
	// are no longer the ones that produced the preview" and clears it. A fresh
	// object every render would clear the preview the moment it appeared.
	const encoding = useMemo(() => {
		return { ...config.encoding, quality, preferBitrate };
	}, [config.encoding, quality, preferBitrate]);

	const paths = resolveFolderPaths(folders);
	const pending = items.filter((item) => item.status === "pending");
	const isBusy = items.some((item) => item.status === "working");
	const canStart = pending.length > 0 && !isBusy && canEncode !== false;

	const update = (id: string, changes: Partial<QueueItem>) => {
		setItems((existing) => {
			return existing.map((item) => {
				return item.id === id ? { ...item, ...changes } : item;
			});
		});
	};

	const run = async (queued: QueueItem[]) => {
		if (isRunning.current) {
			return;
		}

		isRunning.current = true;

		for (const item of queued) {
			update(item.id, { status: "working", progress: null });

			try {
				const asset = await uploadVideo({
					client,
					config,
					file: item.file,
					folderId: targetFolder,
					keepAudio,
					encoding,
					progressed: (progress) => update(item.id, { progress }),
				});

				update(item.id, { status: "done", progress: null });
				onUploaded(asset);
			} catch (error) {
				update(item.id, {
					status: "failed",
					progress: null,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		isRunning.current = false;
	};

	const stage = (files: File[]) => {
		setItems((existing) => [...existing, ...files.map(toItem)]);
	};

	// The dialog is its own drop surface, so dragging onto it adds to the
	// pending list rather than reaching the library behind it
	const { isDragging, dropProps } = useFileDrop({
		isEnabled: !isBusy && canEncode !== false,
		onDrop: stage,
	});

	const browse = () => {
		const input = fileInputRef.current;
		if (input) {
			input.click();
		}
	};

	const chosen = (event: ChangeEvent<HTMLInputElement>) => {
		stage(Array.from(event.target.files ?? []));
		event.target.value = "";
	};

	const removed = (id: string) => {
		setItems((existing) => existing.filter((item) => item.id !== id));
	};

	const confirmed = () => {
		const queued = pending.map((item): QueueItem => {
			return { ...item, status: "waiting" };
		});

		const byId = new Map(queued.map((item) => [item.id, item]));
		setItems((existing) => existing.map((item) => byId.get(item.id) ?? item));

		run(queued);
	};

	return (
		<Dialog
			header="Upload videos"
			id="r2-video-upload"
			width={1}
			onClose={isBusy ? undefined : onClose}
			footer={
				<Card borderTop padding={2}>
					<Flex gap={2}>
						<Box flex={1}>
							<Button
								disabled={isBusy}
								mode="ghost"
								text={items.length > 0 && !canStart ? "Done" : "Cancel"}
								width="fill"
								onClick={onClose}
							/>
						</Box>
						<Box flex={1}>
							<Button
								disabled={!canStart}
								text={
									isBusy ? "Encoding…" : `Upload ${countLabel(pending.length)}`
								}
								tone="primary"
								width="fill"
								onClick={confirmed}
							/>
						</Box>
					</Flex>
				</Card>
			}
		>
			<Card padding={4}>
				<Stack gap={5}>
					{canEncode === false && <UnsupportedBrowser />}

					<input
						accept="video/*"
						multiple
						ref={fileInputRef}
						style={{ display: "none" }}
						type="file"
						onChange={chosen}
					/>

					{canEncode !== false && (
						<Card
							border
							padding={5}
							radius={2}
							style={{ borderStyle: "dashed", position: "relative" }}
							tone="transparent"
							{...dropProps}
						>
							{isDragging && <DragOverlay />}

							<Stack gap={4}>
								<Stack gap={3}>
									<Flex justify="center">
										<Text muted size={3}>
											<UploadIcon />
										</Text>
									</Flex>
									<Text align="center" muted size={1}>
										Drop videos here
									</Text>
									<Text align="center" muted size={0}>
										MP4, MOV or WebM - encoded to every size the site needs
									</Text>
								</Stack>
								<Flex justify="center">
									<Button
										disabled={isBusy || canEncode === null}
										mode="ghost"
										text="Choose videos"
										onClick={browse}
									/>
								</Flex>
							</Stack>
						</Card>
					)}

					{items.length > 0 && (
						<Stack gap={3}>
							<Text muted size={1} weight="medium">
								{countLabel(items.length)}
							</Text>
							<Stack gap={2}>
								{items.map((item) => (
									<Card
										key={item.id}
										border
										padding={3}
										radius={2}
										tone={STATUS_TONES[item.status]}
									>
										<Flex align="center" gap={3}>
											<Box flex={1}>
												<Text size={1} textOverflow="ellipsis">
													{item.file.name}
												</Text>
											</Box>
											<Text muted size={1}>
												{describe(item)}
											</Text>
											{item.status === "pending" && (
												<Button
													aria-label={`Remove ${item.file.name}`}
													disabled={isBusy}
													mode="ghost"
													padding={2}
													text="✕"
													onClick={() => removed(item.id)}
												/>
											)}
										</Flex>
									</Card>
								))}
							</Stack>
						</Stack>
					)}

					<UploadSettings
						folderId={targetFolder}
						folderPaths={paths}
						isDisabled={isBusy}
						keepAudio={keepAudio}
						preferBitrate={preferBitrate}
						quality={quality}
						onFolderChange={setTargetFolder}
						onKeepAudioChange={setKeepAudio}
						onPreferBitrateChange={setPreferBitrate}
						onQualityChange={setQuality}
					>
						<PreviewEncode
							encoding={encoding}
							file={pending.length > 0 ? pending[0].file : null}
							keepAudio={keepAudio}
						/>
					</UploadSettings>
				</Stack>
			</Card>
		</Dialog>
	);
};
