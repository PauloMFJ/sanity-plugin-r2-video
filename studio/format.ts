/**
 * A byte count in the unit that carries information.
 *
 * Fixed megabytes collapse a whole ladder to "0.1 MB / 0.1 MB / 0.0 MB" once
 * the clip is short, which reads as broken rather than small — so anything
 * under a megabyte is shown in kilobytes instead.
 */
export const formatSize = (bytes: number) => {
	if (bytes < 1_000_000) {
		return `${Math.round(bytes / 1000)} KB`;
	}

	return `${(bytes / 1_000_000).toFixed(1)} MB`;
};

/** A duration in seconds, at the precision a short clip needs. */
export const formatDuration = (seconds: number) => {
	return `${seconds.toFixed(1)}s`;
};

/** Average bitrate for a finished file. */
export const formatBitrate = (bytes: number, seconds: number) => {
	if (!seconds) {
		return "—";
	}

	return `${((bytes * 8) / seconds / 1_000_000).toFixed(2)} Mbps`;
};
