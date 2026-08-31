import { FolderIcon } from "@sanity/icons/Folder";
import { Box, Card, Flex, Stack, Text } from "@sanity/ui";
import type { FolderPath } from "./folders";

const SIDEBAR_WIDTH = 260;

type RowProps = {
	label: string;
	count: number;
	isSelected: boolean;
	hasIcon?: boolean;
	onSelect: () => void;
};

const Row = ({ label, count, isSelected, hasIcon, onSelect }: RowProps) => {
	return (
		<Card
			as="button"
			padding={3}
			radius={2}
			tone={isSelected ? "primary" : "default"}
			onClick={onSelect}
			style={{ cursor: "pointer", textAlign: "left", width: "100%" }}
		>
			<Flex align="center" gap={3}>
				{hasIcon && (
					<Text muted size={1}>
						<FolderIcon />
					</Text>
				)}

				<Box flex={1}>
					<Text
						size={1}
						textOverflow="ellipsis"
						weight={isSelected ? "medium" : undefined}
					>
						{label}
					</Text>
				</Box>

				<Text muted size={1}>
					{count}
				</Text>
			</Flex>
		</Card>
	);
};

type Props = {
	folders: FolderPath[];
	counts: Map<string, number>;
	total: number;
	selectedId: string;
	onSelect: (folderId: string) => void;
};

/**
 * Folder list, shaped like the media library's own so the two tools read the
 * same way. Selecting one filters the grid; "All assets" clears the filter.
 */
export const FolderSidebar = ({
	folders,
	counts,
	total,
	selectedId,
	onSelect,
}: Props) => {
	return (
		<Card
			borderRight
			height="fill"
			style={{ width: SIDEBAR_WIDTH, flex: "none", overflowY: "auto" }}
		>
			<Card borderBottom padding={4}>
				<Text muted size={0} weight="semibold">
					FOLDERS
				</Text>
			</Card>

			<Box padding={2}>
				<Stack gap={1}>
					<Row
						count={total}
						isSelected={!selectedId}
						label="All assets"
						onSelect={() => onSelect("")}
					/>

					{folders.map((folder) => (
						<Row
							key={folder.id}
							count={counts.get(folder.id) ?? 0}
							hasIcon
							isSelected={selectedId === folder.id}
							label={folder.path}
							onSelect={() => onSelect(folder.id)}
						/>
					))}
				</Stack>
			</Box>
		</Card>
	);
};
