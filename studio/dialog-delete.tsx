import {
	Box,
	Button,
	Card,
	Dialog,
	Flex,
	Spinner,
	Stack,
	Text,
} from "@sanity/ui";
import { useEffect, useState } from "react";
import { useClient } from "sanity";
import { useR2VideoConfig } from "./config-context";
import {
	deleteVideoAsset,
	findReferencingDocuments,
	type ReferencingDocument,
} from "./delete-video";
import { formatSize } from "./format";
import type { R2VideoAsset } from "./types";

type Props = {
	asset: R2VideoAsset;
	onDeleted: () => void;
	onClose: () => void;
};

/**
 * Confirms a delete that crosses two systems and can't be undone, so it shows
 * exactly what goes: every rendition, the bytes they add up to, and any
 * document that would break — which blocks the delete outright.
 */
export const DialogDelete = ({ asset, onDeleted, onClose }: Props) => {
	const config = useR2VideoConfig();
	const client = useClient({ apiVersion: config.apiVersion });

	const [blockers, setBlockers] = useState<ReferencingDocument[] | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		findReferencingDocuments(client, asset._id)
			.then(setBlockers)
			.catch(() => {
				setError("Could not check which documents use this video.");
			});
	}, [client, asset._id]);

	const confirmed = async () => {
		setIsDeleting(true);
		setError(null);

		try {
			await deleteVideoAsset(client, config, asset);
			onDeleted();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : String(caught));
			setIsDeleting(false);
		}
	};

	const totalBytes = asset.renditions.reduce((total, rendition) => {
		return total + rendition.size;
	}, 0);

	const isBlocked = blockers !== null && blockers.length > 0;

	return (
		<Dialog
			header="Delete video"
			id="r2-video-delete"
			width={1}
			onClose={isDeleting ? undefined : onClose}
			footer={
				<Card borderTop padding={2}>
					<Flex gap={2}>
						<Box flex={1}>
							<Button
								disabled={isDeleting}
								mode="ghost"
								text="Cancel"
								width="fill"
								onClick={onClose}
							/>
						</Box>
						<Box flex={1}>
							<Button
								disabled={isDeleting || isBlocked || blockers === null}
								text={isDeleting ? "Deleting…" : "Delete"}
								tone="critical"
								width="fill"
								onClick={confirmed}
							/>
						</Box>
					</Flex>
				</Card>
			}
		>
			<Card padding={4}>
				<Stack gap={4}>
					<Text size={1}>
						{asset.filename} — {asset.renditions.length} renditions,{" "}
						{formatSize(totalBytes)}, plus its poster.
					</Text>

					{blockers === null && !error && (
						<Flex align="center" gap={3}>
							<Spinner muted />
							<Text muted size={1}>
								Checking where it's used…
							</Text>
						</Flex>
					)}

					{isBlocked && (
						<Card padding={3} radius={2} tone="caution">
							<Stack gap={3}>
								<Text size={1} weight="semibold">
									Still in use
								</Text>
								<Text muted size={1}>
									Remove it from these documents first:
								</Text>
								{blockers.map((blocker) => (
									<Text key={blocker._id} muted size={1}>
										{blocker.title || blocker._id} ({blocker._type})
									</Text>
								))}
							</Stack>
						</Card>
					)}

					{blockers !== null && blockers.length === 0 && (
						<Text muted size={1}>
							Nothing references it. This can't be undone.
						</Text>
					)}

					{error && (
						<Card padding={3} radius={2} tone="critical">
							<Text size={1}>{error}</Text>
						</Card>
					)}
				</Stack>
			</Card>
		</Dialog>
	);
};
