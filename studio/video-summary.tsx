import { Box, Card, Flex, Grid, Stack, Text } from "@sanity/ui";
import { formatDuration, formatSize } from "./format";
import type { R2VideoRendition } from "./types";

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
	renditions: R2VideoRendition[];
	duration: number;
	hasAudio: boolean;
	uploadedAt?: string;
};

/**
 * Everything the upload pipeline recorded, shown rather than edited. Used by
 * the details dialog and by the asset document, so both read the same.
 */
export const VideoSummary = ({
	renditions,
	duration,
	hasAudio,
	uploadedAt,
}: Props) => {
	const totalBytes = renditions.reduce((total, rendition) => {
		return total + rendition.size;
	}, 0);

	// Stored in encode order, which happens to be largest first — sorted here so
	// the list is deliberately ordered rather than incidentally
	const ordered = [...renditions].sort((a, b) => b.height - a.height);
	const largest = ordered[0];

	return (
		<Stack gap={5}>
			<Card border padding={4} radius={2} tone="transparent">
				<Grid gap={4} gridTemplateColumns={[2, 4]}>
					<Fact
						label="Source"
						value={largest ? `${largest.width} × ${largest.height}` : "Unknown"}
					/>
					<Fact label="Duration" value={formatDuration(duration)} />
					<Fact label="Audio" value={hasAudio ? "Kept" : "Stripped"} />
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

			{uploadedAt && (
				<Text muted size={0}>
					Uploaded {new Date(uploadedAt).toLocaleString()}
				</Text>
			)}
		</Stack>
	);
};
