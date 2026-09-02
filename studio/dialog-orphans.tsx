import { Card, Dialog, Stack, Text } from "@sanity/ui";
import { useEffect, useState } from "react";
import { useR2VideoClient } from "./config-context";
import { pluralize, toMessage } from "./format";
import { findOrphans, type Orphans, removeOrphans } from "./orphans";
import { DialogActions, Loading, Notice } from "./ui";

type Props = {
	onCleaned: () => void;
	onClose: () => void;
};

/**
 * Finds and removes storage nothing points at.
 *
 * These accumulate when an upload dies without rolling back - a closed tab or a
 * crash. Everything listed is unreferenced by definition, so removing it can't
 * break a page, but it still shows the counts before doing anything.
 */
export const DialogOrphans = ({ onCleaned, onClose }: Props) => {
	const { config, client } = useR2VideoClient();

	const [orphans, setOrphans] = useState<Orphans | null>(null);
	const [isRemoving, setIsRemoving] = useState(false);
	const [isDone, setIsDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		findOrphans(client, config)
			.then(setOrphans)
			.catch((caught: unknown) => {
				setError(toMessage(caught));
			});
	}, [client, config]);

	const confirmed = async () => {
		if (!orphans) {
			return;
		}

		setIsRemoving(true);
		setError(null);

		try {
			await removeOrphans(client, config, orphans);
			setIsDone(true);
			onCleaned();
		} catch (caught) {
			setError(toMessage(caught));
		}

		setIsRemoving(false);
	};

	const total = orphans ? orphans.keys.length + orphans.posterIds.length : 0;

	return (
		<Dialog
			header="Sync storage"
			id="r2-video-orphans"
			width={1}
			onClose={isRemoving ? undefined : onClose}
			footer={
				<DialogActions
					cancel={{
						text: isDone ? "Done" : "Cancel",
						disabled: isRemoving,
						onClick: onClose,
					}}
					confirm={{
						text: isRemoving ? "Removing…" : "Remove",
						tone: "critical",
						disabled: isRemoving || isDone || total === 0,
						onClick: confirmed,
					}}
				/>
			}
		>
			<Card padding={4}>
				<Stack gap={4}>
					{!orphans && !error && (
						<Loading>Comparing storage against the library…</Loading>
					)}

					{isDone && <Notice tone="positive">Removed.</Notice>}

					{orphans && !isDone && total === 0 && (
						<Text muted size={1}>
							Nothing to clean up - every stored file belongs to a video.
						</Text>
					)}

					{orphans && !isDone && total > 0 && (
						<Stack gap={3}>
							<Text size={1}>
								Found {pluralize(orphans.keys.length, "orphaned file")} in R2
								and {pluralize(orphans.posterIds.length, "unused poster")} in
								Sanity.
							</Text>
							<Text muted size={1}>
								Nothing references any of them, so removing them can't affect
								the site. This can't be undone.
							</Text>
						</Stack>
					)}

					{error && <Notice tone="critical">{error}</Notice>}
				</Stack>
			</Card>
		</Dialog>
	);
};
