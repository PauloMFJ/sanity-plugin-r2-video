import { WarningOutlineIcon } from "@sanity/icons/WarningOutline";
import { Card, Flex, Stack, Text } from "@sanity/ui";

/**
 * Shown wherever an upload would otherwise start in a browser that can't encode
 * h264. Chrome can; Safari's WebCodecs encoder support is the gap this covers.
 */
export const UnsupportedBrowser = () => {
	return (
		<Card padding={4} radius={2} tone="caution">
			<Flex align="flex-start" gap={3}>
				<Text size={2}>
					<WarningOutlineIcon />
				</Text>
				<Stack gap={3}>
					<Text size={1} weight="semibold">
						This browser can't encode video
					</Text>
					<Text muted size={1}>
						Uploading needs WebCodecs h264 encoding, which this browser doesn't
						provide. Open the Studio in Chrome to add videos. Everything already
						in the library still works here.
					</Text>
				</Stack>
			</Flex>
		</Card>
	);
};
