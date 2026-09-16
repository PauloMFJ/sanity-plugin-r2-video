import { TrashIcon } from "@sanity/icons/Trash";
import { Box, Button, Card, Flex, Select, Text } from "@sanity/ui";
import type { FolderPath } from "./folders";
import { pluralize } from "./format";

type Props = {
	count: number;
	folderPaths: FolderPath[];
	isMoving: boolean;

	/** Called with a folder id, or empty for no folder. */
	onMove: (folderId: string) => void;
	onClear: () => void;
	onDelete: () => void;
};

/** What a selection of videos can do: move to a folder, or delete. */
export const SelectionBar = ({
	count,
	folderPaths,
	isMoving,
	onMove,
	onClear,
	onDelete,
}: Props) => {
	return (
		<Card border padding={2} radius={2} tone="primary">
			<Flex align="center" gap={2}>
				<Box paddingX={2}>
					<Text size={1} weight="medium">
						{pluralize(count, "video")} selected
					</Text>
				</Box>

				<Box flex={1}>
					<Select
						aria-label="Move to folder"
						disabled={isMoving}
						value="move to"
						onChange={(event) => onMove(event.currentTarget.value)}
					>
						{/* A value no document id can have, so "No folder" (empty) still
						    registers as a change */}
						<option value="move to" disabled>
							Move to…
						</option>
						<option value="">No folder</option>
						{folderPaths.map((entry) => (
							<option key={entry.id} value={entry.id}>
								{entry.path}
							</option>
						))}
					</Select>
				</Box>

				<Button
					disabled={isMoving}
					mode="ghost"
					text="Clear"
					onClick={onClear}
				/>
				<Button
					disabled={isMoving}
					icon={TrashIcon}
					mode="ghost"
					text="Delete"
					tone="critical"
					onClick={onDelete}
				/>
			</Flex>
		</Card>
	);
};
