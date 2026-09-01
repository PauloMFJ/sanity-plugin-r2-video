import { ChevronDownIcon } from "@sanity/icons/ChevronDown";
import { ChevronRightIcon } from "@sanity/icons/ChevronRight";
import {
	Box,
	Button,
	Flex,
	Select,
	Stack,
	Switch,
	Text,
	TextInput,
} from "@sanity/ui";
import { type ReactNode, useId, useState } from "react";
import type { FolderPath } from "./folders";

type FieldProps = {
	id: string;
	label: string;
	description: string;
	children: ReactNode;
};

/** A label above its control, matching how the details dialog lays fields out. */
const Field = ({ id, label, description, children }: FieldProps) => {
	return (
		<Stack gap={3}>
			<Text as="label" htmlFor={id} size={1} weight="medium">
				{label}
			</Text>
			{children}
			<Text muted size={0}>
				{description}
			</Text>
		</Stack>
	);
};

/** A toggle keeps its label beside it - a switch under a label reads as adrift. */
const ToggleRow = ({ id, label, description, children }: FieldProps) => {
	return (
		<Flex align="center" gap={3}>
			<Box flex={1}>
				<Stack gap={2}>
					<Text as="label" htmlFor={id} size={1}>
						{label}
					</Text>
					<Text muted size={0}>
						{description}
					</Text>
				</Stack>
			</Box>
			{children}
		</Flex>
	);
};

type Props = {
	folderId: string;
	folderPaths: FolderPath[];
	keepAudio: boolean;
	quality: number;
	preferBitrate: boolean;
	isDisabled: boolean;
	onFolderChange: (folderId: string) => void;
	onKeepAudioChange: (keepAudio: boolean) => void;
	onQualityChange: (quality: number) => void;
	onPreferBitrateChange: (preferBitrate: boolean) => void;
	children: ReactNode;
};

/**
 * Everything an upload can be tuned with, behind a disclosure.
 *
 * Collapsed by default because the plugin's configured defaults are the right
 * answer almost every time - the panel is for the upload that needs to differ,
 * not a decision to be made on each one.
 */
export const UploadSettings = ({
	folderId,
	folderPaths,
	keepAudio,
	quality,
	preferBitrate,
	isDisabled,
	onFolderChange,
	onKeepAudioChange,
	onQualityChange,
	onPreferBitrateChange,
	children,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const panelId = useId();

	const folderInputId = `${panelId}-folder`;
	const audioInputId = `${panelId}-keep-audio`;
	const qualityInputId = `${panelId}-quality`;
	const bitrateInputId = `${panelId}-prefer-bitrate`;

	return (
		<Stack gap={4}>
			<Flex>
				<Button
					aria-controls={panelId}
					aria-expanded={isOpen}
					icon={isOpen ? ChevronDownIcon : ChevronRightIcon}
					mode="ghost"
					text="Settings"
					onClick={() => setIsOpen(!isOpen)}
				/>
			</Flex>

			{isOpen && (
				<Stack gap={4} id={panelId}>
					<Field
						description="Shared with the image library - create folders there and they appear here."
						id={folderInputId}
						label="Folder"
					>
						<Select
							disabled={isDisabled}
							id={folderInputId}
							value={folderId}
							onChange={(event) => onFolderChange(event.currentTarget.value)}
						>
							<option value="">No folder</option>
							{folderPaths.map((entry) => (
								<option key={entry.id} value={entry.id}>
									{entry.path}
								</option>
							))}
						</Select>
					</Field>

					<ToggleRow
						id={audioInputId}
						label="Keep audio"
						description="Loops still play muted - autoplay requires it."
					>
						<Switch
							checked={keepAudio}
							disabled={isDisabled}
							id={audioInputId}
							onChange={(event) =>
								onKeepAudioChange(event.currentTarget.checked)
							}
						/>
					</ToggleRow>

					<Field
						description="0 to 1. Around 0.75 is where h264 stops being distinguishable from the source; 1 is near-lossless and can exceed it."
						id={qualityInputId}
						label="Quality"
					>
						<TextInput
							disabled={isDisabled}
							id={qualityInputId}
							max={1}
							min={0}
							step={0.05}
							type="number"
							value={quality}
							onChange={(event) =>
								onQualityChange(Number(event.currentTarget.value))
							}
						/>
					</Field>

					<ToggleRow
						id={bitrateInputId}
						label="Predictable file size"
						description="Targets a bitrate instead of a quality level, so size stops depending on how detailed the footage is."
					>
						<Switch
							checked={preferBitrate}
							disabled={isDisabled}
							id={bitrateInputId}
							onChange={(event) =>
								onPreferBitrateChange(event.currentTarget.checked)
							}
						/>
					</ToggleRow>

					{children}
				</Stack>
			)}
		</Stack>
	);
};
