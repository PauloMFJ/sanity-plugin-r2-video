import { Card, Dialog, Stack, Text } from "@sanity/ui";
import { useEffect, useState } from "react";
import { useR2VideoClient } from "./config-context";
import {
	deleteVideoAsset,
	findReferencingDocuments,
	type ReferencingDocument,
} from "./delete-video";
import { formatSize, toMessage, totalSize } from "./format";
import type { R2VideoAsset } from "./types";
import { DialogActions, Loading, Notice } from "./ui";

type Props = {
	asset: R2VideoAsset;
	onDeleted: () => void;
	onClose: () => void;
};

/**
 * Confirms a delete that crosses two systems and can't be undone, so it shows
 * exactly what goes: every rendition, the bytes they add up to, and any
 * document that would break - which blocks the delete outright.
 */
export const DialogDelete = ({ asset, onDeleted, onClose }: Props) => {
	const { config, client } = useR2VideoClient();

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
			setError(toMessage(caught));
			setIsDeleting(false);
		}
	};

	const isBlocked = blockers !== null && blockers.length > 0;

	return (
		<Dialog
			header="Delete video"
			id="r2-video-delete"
			width={1}
			onClose={isDeleting ? undefined : onClose}
			footer={
				<DialogActions
					cancel={{ text: "Cancel", disabled: isDeleting, onClick: onClose }}
					confirm={{
						text: isDeleting ? "Deleting…" : "Delete",
						tone: "critical",
						disabled: isDeleting || isBlocked || blockers === null,
						onClick: confirmed,
					}}
				/>
			}
		>
			<Card padding={4}>
				<Stack gap={4}>
					<Text size={1}>
						{asset.filename} - {asset.renditions.length} renditions,{" "}
						{formatSize(totalSize(asset.renditions))}, plus its poster.
					</Text>

					{blockers === null && !error && (
						<Loading>Checking where it's used…</Loading>
					)}

					{isBlocked && (
						<Notice title="Still in use" tone="caution">
							<Stack gap={3}>
								<Text muted size={1}>
									Remove it from these documents first:
								</Text>
								{blockers.map((blocker) => (
									<Text key={blocker._id} muted size={1}>
										{blocker.title || blocker._id} ({blocker._type})
									</Text>
								))}
							</Stack>
						</Notice>
					)}

					{blockers !== null && blockers.length === 0 && (
						<Text muted size={1}>
							Nothing references it. This can't be undone.
						</Text>
					)}

					{error && <Notice tone="critical">{error}</Notice>}
				</Stack>
			</Card>
		</Dialog>
	);
};
