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
import { findOrphans, type Orphans, removeOrphans } from "./orphans";

const countLabel = (count: number, noun: string) => {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
};

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
	const config = useR2VideoConfig();
	const client = useClient({ apiVersion: config.apiVersion });

	const [orphans, setOrphans] = useState<Orphans | null>(null);
	const [isRemoving, setIsRemoving] = useState(false);
	const [isDone, setIsDone] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		findOrphans(client, config)
			.then(setOrphans)
			.catch((caught: unknown) => {
				setError(caught instanceof Error ? caught.message : String(caught));
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
			setError(caught instanceof Error ? caught.message : String(caught));
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
				<Card borderTop padding={2}>
					<Flex gap={2}>
						<Box flex={1}>
							<Button
								disabled={isRemoving}
								mode="ghost"
								text={isDone ? "Done" : "Cancel"}
								width="fill"
								onClick={onClose}
							/>
						</Box>
						<Box flex={1}>
							<Button
								disabled={isRemoving || isDone || total === 0}
								text={isRemoving ? "Removing…" : "Remove"}
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
					{!orphans && !error && (
						<Flex align="center" gap={3}>
							<Spinner muted />
							<Text muted size={1}>
								Comparing storage against the library…
							</Text>
						</Flex>
					)}

					{isDone && (
						<Card padding={3} radius={2} tone="positive">
							<Text size={1}>Removed.</Text>
						</Card>
					)}

					{orphans && !isDone && total === 0 && (
						<Text muted size={1}>
							Nothing to clean up - every stored file belongs to a video.
						</Text>
					)}

					{orphans && !isDone && total > 0 && (
						<Stack gap={3}>
							<Text size={1}>
								Found {countLabel(orphans.keys.length, "orphaned file")} in R2
								and {countLabel(orphans.posterIds.length, "unused poster")} in
								Sanity.
							</Text>
							<Text muted size={1}>
								Nothing references any of them, so removing them can't affect
								the site. This can't be undone.
							</Text>
						</Stack>
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
