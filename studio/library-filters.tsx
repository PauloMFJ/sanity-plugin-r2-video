import { CheckmarkIcon } from "@sanity/icons/Checkmark";
import { FilterIcon } from "@sanity/icons/Filter";
import { Box, Button, Label } from "@sanity/ui";
import { Menu, MenuButton, MenuDivider, MenuItem } from "@sanity/ui/menu";
import { Fragment } from "react";
import type { LibraryAsset } from "./tool-video-library";

/** What the library can be narrowed by. One option per group at a time. */
const FILTER_GROUPS = [
	{
		label: "Folder",
		options: [
			{
				key: "foldered",
				label: "In a folder",
				test: (asset: LibraryAsset) => Boolean(asset.folder),
			},
			{
				key: "unfoldered",
				label: "No folder",
				test: (asset: LibraryAsset) => !asset.folder,
			},
		],
	},
	{
		label: "Usage",
		options: [
			{
				key: "used",
				label: "In use",
				test: (asset: LibraryAsset) => asset.isUsed,
			},
			{
				key: "unused",
				label: "Unused",
				test: (asset: LibraryAsset) => !asset.isUsed,
			},
		],
	},
];

const OPTIONS = FILTER_GROUPS.flatMap((group) => group.options);

export const passesFilters = (asset: LibraryAsset, keys: string[]) => {
	return OPTIONS.every((option) => {
		return !keys.includes(option.key) || option.test(asset);
	});
};

/**
 * Picks an option, replacing any other from its group, or clears it when it's
 * already picked.
 */
export const toggleFilter = (keys: string[], key: string) => {
	if (keys.includes(key)) {
		return keys.filter((entry) => entry !== key);
	}

	const group = FILTER_GROUPS.find((entry) => {
		return entry.options.some((option) => option.key === key);
	});
	const siblings = group?.options.map((option) => option.key) ?? [];

	return [...keys.filter((entry) => !siblings.includes(entry)), key];
};

type Props = {
	activeKeys: string[];
	onToggle: (key: string) => void;
};

/** The Filters button and its menu, counting what's active. */
export const LibraryFilters = ({ activeKeys, onToggle }: Props) => {
	const isActive = activeKeys.length > 0;

	return (
		<MenuButton
			button={
				<Button
					icon={FilterIcon}
					mode={isActive ? "default" : "ghost"}
					text={isActive ? `Filters (${activeKeys.length})` : "Filters"}
					tone={isActive ? "primary" : "default"}
				/>
			}
			id="r2-video-filters"
			menu={
				<Menu>
					{FILTER_GROUPS.map((group, index) => (
						<Fragment key={group.label}>
							{index > 0 && <MenuDivider />}

							<Box paddingX={3} paddingY={2}>
								<Label muted size={0}>
									{group.label}
								</Label>
							</Box>

							{group.options.map((option) => (
								<MenuItem
									key={option.key}
									iconRight={
										activeKeys.includes(option.key) ? CheckmarkIcon : undefined
									}
									pressed={activeKeys.includes(option.key)}
									text={option.label}
									onClick={() => onToggle(option.key)}
								/>
							))}
						</Fragment>
					))}
				</Menu>
			}
			popover={{ placement: "bottom-start" }}
		/>
	);
};
