import { Card, Dialog, Stack, Text } from "@sanity/ui";
import { useEffect, useState } from "react";
import { useR2VideoClient } from "./config-context";
import {
	deleteVideoAsset,
	findReferencingDocuments,
	type ReferencingDocument,
} from "./delete-video";
import { formatSize, pluralize, toMessage, totalSize } from "./format";
import type { R2VideoAsset } from "./types";
import { DialogActions, Loading, Notice } from "./ui";

/** One video that can't go, and what still points at it. */
type Blocked = {
	asset: R2VideoAsset;
	documents: ReferencingDocument[];
};

type Props = {
	assets: R2VideoAsset[];
	onDeleted: () => void;
	onClose: () => void;
};

/**
 * Confirms a delete that crosses two systems and can't be undone, so it shows
 * exactly what goes: every rendition, the bytes they add up to, and any
 * document that would break - which blocks the delete outright.
 */
export const DialogDelete = ({ assets, onDeleted, onClose }: Props) => {
	const { config, client } = useR2VideoClient();

	const [blocked, setBlocked] = useState<Blocked[] | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		Promise.all(
			assets.map(async (asset) => ({
				asset,
				documents: await findReferencingDocuments(client, asset._id),
			})),
		)
			.then((checked) => {
				setBlocked(checked.filter((entry) => entry.documents.length > 0));
			})
			.catch(() => {
				setError("Could not check which documents use these videos.");
			});
	}, [client, assets]);

	const confirmed = async () => {
		setIsDeleting(true);
		setError(null);

		try {
			// One at a time: each delete is four ordered steps across Sanity and
			// R2, and a failure part-way should stop the rest
			for (const asset of assets) {
				await deleteVideoAsset(client, config, asset);
			}

			onDeleted();
		} catch (caught) {
			setError(toMessage(caught));
			setIsDeleting(false);
		}
	};

	const isBlocked = blocked !== null && blocked.length > 0;
	const renditions = assets.flatMap((asset) => asset.renditions);
	const isOne = assets.length === 1;

	return (
		<Dialog
			header={isOne ? "Delete video" : `Delete ${assets.length} videos`}
			id="r2-video-delete"
			width={1}
			onClose={isDeleting ? undefined : onClose}
			footer={
				<DialogActions
					cancel={{ text: "Cancel", disabled: isDeleting, onClick: onClose }}
					confirm={{
						text: isDeleting ? "Deleting…" : "Delete",
						tone: "critical",
						disabled: isDeleting || isBlocked || blocked === null,
						onClick: confirmed,
					}}
				/>
			}
		>
			<Card padding={4}>
				<Stack gap={4}>
					<Text size={1}>
						{isOne ? assets[0].filename : pluralize(assets.length, "video")} -{" "}
						{pluralize(renditions.length, "rendition")},{" "}
						{formatSize(totalSize(renditions))}, plus{" "}
						{isOne ? "its poster" : "their posters"}.
					</Text>

					{blocked === null && !error && (
						<Loading>Checking where they're used…</Loading>
					)}

					{isBlocked && (
						<Notice title="Still in use" tone="caution">
							<Stack gap={3}>
								<Text muted size={1}>
									Remove {isOne ? "it" : "these"} from these documents first:
								</Text>

								{blocked.map((entry) => (
									<Text key={entry.asset._id} muted size={1}>
										{!isOne && `${entry.asset.filename}: `}
										{entry.documents
											.map((document) => document.title || document._id)
											.join(", ")}
									</Text>
								))}
							</Stack>
						</Notice>
					)}

					{blocked !== null && blocked.length === 0 && (
						<Text muted size={1}>
							Nothing references {isOne ? "it" : "them"}. This can't be undone.
						</Text>
					)}

					{error && <Notice tone="critical">{error}</Notice>}
				</Stack>
			</Card>
		</Dialog>
	);
};
