import { WarningOutlineIcon } from "@sanity/icons/WarningOutline";
import { Notice } from "./ui";

/**
 * Shown wherever an upload would otherwise start in a browser that can't encode
 * h264. Chrome can; Safari's WebCodecs encoder support is the gap this covers.
 */
export const UnsupportedBrowser = () => {
	return (
		<Notice
			icon={<WarningOutlineIcon />}
			title="This browser can't encode video"
			tone="caution"
		>
			Uploading needs WebCodecs h264 encoding, which this browser doesn't
			provide. Open the Studio in Chrome to add videos. Everything already in
			the library still works here.
		</Notice>
	);
};
