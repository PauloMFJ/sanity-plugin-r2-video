/**
 * Get the R2 object key for one rendition:
 *
 * ```
 * k3m9p2xq7wvt/1080.mp4
 * └─── id ───┘ └height┘
 * ```
 *
 * One folder per video, one object per tier inside it. Deliberately flat - no
 * folder segment, because folders are a Sanity concern only, so moving or
 * renaming one never has to match anything stored.
 */
export const resolveRenditionPath = (id: string, height: number) => {
	return `${id}/${height}.mp4`;
};
