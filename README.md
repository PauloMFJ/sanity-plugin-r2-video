# sanity-plugin-r2-video

[![NPM version][npm-image]][npm-url]
[![NPM downloads][npm-downloads-image]][npm-downloads-url]

A video plugin for Sanity Studio that encodes in the browser and stores plain MP4s in Cloudflare R2.

## Introduction

An editor drops in one file. Out come **renditions** — one MP4 per height you configured, plus the first frame as a poster:

```
j6w3wy2bd0jq/270.mp4     840 KB
j6w3wy2bd0jq/360.mp4     1.4 MB
j6w3wy2bd0jq/480.mp4     2.3 MB
j6w3wy2bd0jq/720.mp4     4.9 MB
j6w3wy2bd0jq/1080.mp4    9.7 MB
```

Your site picks whichever one fits: the 360 behind a thumbnail, the 1080 in a hero. Each document keeps the whole list, with the height, key and size of every file, so choosing one takes a line of code. Upload a 480p clip and you get three files instead of five, as nothing is ever upscaled.

Encoding runs on the editor's machine with [mediabunny](https://mediabunny.dev), using WebCodecs in a Web Worker. A Cloudflare Worker you own writes the MP4s to your bucket. The poster is saved as an ordinary Sanity image, so it gets the Sanity CDN, `srcset`, `auto=format` and LQIP for free.

That means no encoding service, no per-minute bill, and no R2 credentials outside Cloudflare.

**Note**: These are plain MP4s, not adaptive streams. A player picks one rendition when it loads and keeps it.

## Requirements

- Sanity Studio v6, React 19, `@sanity/ui` v4 or v5, `@sanity/icons` v5 and `styled-components` v6
- Node 20 or later
- A Cloudflare account with R2 enabled
- Chrome to upload. Encoding needs WebCodecs h264, which Safari doesn't reliably provide, so the Studio checks for it and says so before an editor picks a file. Playback works everywhere.

## Installation

Install this package with `npm`.

```bash
npm i sanity-plugin-r2-video
```

## Setup

Five steps, in order. The plugin needs a deployed Worker before it can be configured.

### 1. Create the bucket

```bash
wrangler r2 bucket create my-bucket
```

Then open the bucket's **Settings** in the Cloudflare dashboard and enable public access, either with the `r2.dev` development URL or a custom domain. That public origin is your `bucketUrl`, and without it nothing you upload is playable.

**Note**: Uploads go through the Worker rather than the browser, so the bucket needs no CORS policy.

### 2. Scaffold the Worker

The Worker owns the R2 binding. To generate one:

```bash
npx sanity-plugin-r2-video setup worker
```

It asks for a Worker name, your Cloudflare account id, the bucket name, and the Studio origins allowed to call it. Pass `--name`, `--account`, `--bucket` and `--origins` to skip the prompts.

This writes `r2-video-worker/`, containing a `wrangler.jsonc` and an entry point that re-exports this package's handler. Upgrading the package upgrades the deployed Worker.

### 3. Deploy the Worker

Install its dependencies, generate a shared secret, then deploy:

```bash
npm i sanity-plugin-r2-video
npm i -D wrangler @cloudflare/workers-types
openssl rand -base64 32
wrangler secret put UPLOAD_TOKEN --config r2-video-worker/wrangler.jsonc
wrangler deploy --config r2-video-worker/wrangler.jsonc
```

Keep the generated secret, as the Studio needs the same value in the next step.

**Note**: `--origins` defaults to `http://localhost:3333`. When you deploy the Studio, add its production origin to `ALLOWED_ORIGINS` in `wrangler.jsonc` and deploy the Worker again, or requests from it get a `403`.

### 4. Add the plugin

```ts
// sanity.config.ts
import { r2Video } from "sanity-plugin-r2-video/studio";

export default defineConfig({
  plugins: [
    r2Video({
      endpointUrl: "https://….workers.dev", // Worker you deployed
      token: "…",                           // UPLOAD_TOKEN you generated
      bucketUrl: "https://….r2.dev",        // bucket's public origin
    }),
  ],
});
```

This registers an `r2Video.asset` document type, an `r2Video` field type, and an **R2 Video** tool.

### 5. Add a field

```ts
defineField({ name: "video", title: "Video", type: "r2Video" })
```

To file uploads made from this field under a fixed media library folder, pass its document id:

```ts
defineField({
  name: "video",
  type: "r2Video",
  options: { folder: "<folder document id>" },
})
```

## Usage

Videos live in the **R2 Video** tool.

| Action       | Notes                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Upload**   | Drop files on the library, or press Upload. Files stage in a list first and nothing encodes until you confirm.                                        |
| **Settings** | Collapsed by default. Change the folder, keep audio, or adjust quality for one batch. **Preview** encodes only the tallest tier, so you can check size and quality before running the whole ladder. |
| **Details**  | Click a card to play the video and see every rendition with its size. Rename it, move it to another folder, or delete it from here.                   |
| **Sync**     | Lists objects in the bucket that no video document claims, and posters nothing references, then offers to delete them.                                |

Inside a document, an `r2Video` field picks from the library or uploads without leaving the page.

### Playing video on your site

A field stores a reference and nothing else, so the same video can be used on many documents without encoding it twice:

```json
{ "_type": "r2Video", "asset": { "_type": "reference", "_ref": "hK3n…" } }
```

Follow that reference for an `r2Video.asset` document. It holds metadata only, as the MP4s are in R2 and the poster is a normal Sanity image asset:

```ts
type R2VideoAsset = {
  _id: string;
  _type: "r2Video.asset";
  filename: string;                        // display name, safe to change
  folder?: { _type: "reference"; _ref: string };
  poster: { _type: "image"; asset: { _type: "reference"; _ref: string } };
  duration: number;                        // seconds
  hasAudio: boolean;
  uploadedAt: string;                      // ISO 8601
  renditions: {
    width: number;
    height: number;
    key: string;                           // R2 object key, "j6w3wy2bd0jq/720.mp4"
    size: number;                          // bytes
  }[];
};
```

A rendition's `key` joined to your `bucketUrl` is a playable URL:

```ts
const src = `${bucketUrl}/${rendition.key}`;
```

To store the video's id instead of a list of keys, take it off any key and rebuild the rest. Keys are `<id>/<height>.mp4`, so the id is the part before the slash:

```ts
import { resolveRenditionPath } from "sanity-plugin-r2-video/storage";

const src = `${bucketUrl}/${resolveRenditionPath(id, 720)}`;
```

**Note**: That id isn't the document's `_id`. It's generated at upload time for the R2 key, so a video keeps its objects even if the document is recreated.

`sanity-plugin-r2-video/storage` has no dependencies, so a web app can import it to build URLs without pulling the Studio, `sanity` or `react` into its bundle. Every type above is exported from `sanity-plugin-r2-video/studio`.

## API

### r2Video()

| Property           | Type      | Default              | Notes                                                                                          |
| ------------------ | --------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| **endpointUrl**    | `string`  | undefined            | **Required**. Origin of the deployed Worker. The Studio never touches the bucket directly.     |
| **token**          | `string`  | undefined            | **Required**. Shared secret, matching the Worker's `UPLOAD_TOKEN`.                             |
| **bucketUrl**      | `string`  | undefined            | **Required**. Public origin renditions are served from. No document stores an origin.          |
| **apiVersion**     | `string`  | `"2024-01-01"`       | Sanity API version the plugin's own queries and mutations run against.                          |
| **tool**           | `object`  | `{ name: "r2-video", title: "R2 Video" }` | Name and title of the Studio tool.                                         |
| **folders.type**   | `string`  | `"media.folder"`     | Document type folders are read from, defaulting to `sanity-plugin-media`'s. The plugin never imports that package, it reads a type by name, so this can point anywhere. |
| **folders.poster** | `string`  | `"_R2 Video Posters"` | Folder generated posters are filed under, created on first upload.                            |
| **encoding**       | `object`  | See below            | Encoding options, applied to every rendition.                                                  |

### encoding

| Property          | Type       | Default                       | Notes                                                                                       |
| ----------------- | ---------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| **heights**       | `number[]` | `[270, 360, 480, 720, 1080]`  | The tier ladder. A source shorter than a tier skips it, and every tier it does reach is another full encode, so this list is what upload time costs. |
| **videoCodec**    | `string`   | `"avc"`                       | `avc` (h264) is the only codec every browser plays from a plain `<video src>`.              |
| **audioCodec**    | `string`   | `"aac"`                       | Used only when an upload opts into keeping audio.                                            |
| **quality**       | `number`   | `0.75`                        | A quantizer for h264 rather than a bitrate, so quality stays constant and file size varies. `0.75` is QP 22, where h264 stops being distinguishable from the source. `1` is QP 16, near-lossless, and routinely produces files **larger than the source**. |
| **preferBitrate** | `boolean`  | `false`                       | Flips that trade for predictable size and variable quality. A 1080p tier lands near 6.1 Mbps at `0.75` whatever the footage. |
| **nativeTopTier** | `boolean`  | `false`                       | Copies the top rendition instead of re-encoding it, when its height and codec already match the source. Instant and bit-identical, but its size is whatever the source was exported at. |

## How it works

```
Studio ──encoded renditions──▶ Worker ──binding──▶ R2 bucket
   │                                                   │
   └──poster──▶ Sanity image assets        bucket URL ─┘
```

### Security

The Worker holds the only R2 binding, so **no R2 credentials exist outside Cloudflare**. Renditions are sent as plain request bodies, which means nothing is signed and the bucket needs no CORS policy.

`UPLOAD_TOKEN` ships inside the Studio bundle, because the browser is what uploads. **Anyone who can load the Studio can read it.** What actually restricts access is the Worker's origin allowlist. Put Cloudflare Access in front of the Worker if you need real authentication.

### Keys

One directory per video, one object per tier, and no folder segment, as in `<id>/<height>.mp4` above.

Documents store keys and heights rather than URLs, and both the Studio and your front end build sources from `bucketUrl`. Moving the bucket behind a custom domain is a config change rather than a migration. Keys carry no folder either, so renaming or moving a video in the Studio never touches the bucket.

### Deleting

Order matters here, and `delete-video.ts` documents it:

1. Preflight `*[references($id)]`. Anything found blocks the delete.
2. Delete the document, which releases the strong reference to the poster.
3. Delete the poster asset, now unreferenced, so no `409`.
4. Delete the R2 objects, batched.

Sanity goes before R2. An orphaned object is invisible and costs pennies, while a document pointing at deleted media breaks the site.

### When an upload fails

The document is written last, so a failure can't leave a video in the library pointing at files that aren't there. Anything created before that point is rolled back, and keys are recorded before each upload rather than after, since a request that times out may still have stored the object. Rollback never throws, so the failure that started it is what you see.

A closed tab or a crash skips rollback, and encoded renditions live only in memory, so there's no resume. Whatever either case leaves behind is unreferenced, and **Sync** in the tool finds and removes it.

### Entry points

Three, each with its own tsconfig and its own type universe:

| Import                                | Contains           | Depends on                        |
| ------------------------------------- | ------------------ | --------------------------------- |
| `sanity-plugin-r2-video/studio`       | The Sanity plugin  | `react`, `react-dom`, `@sanity/ui` |
| `sanity-plugin-r2-video/worker`       | The endpoint       | `@cloudflare/workers-types`       |
| `sanity-plugin-r2-video/storage`      | Where files live   | Nothing                           |

## Limitations

- **Uploading is Chrome-only today.** WebCodecs h264 encoding is the requirement, and the gate is a `canEncodeVideo('avc')` capability check rather than user-agent sniffing.
- **100 MB per rendition.** Each MP4 is uploaded as a single request body. The source file can be much larger, but any one tier over 100 MB is rejected with a `413`, so lower `quality` or drop the tallest tier.

## Contributing

Want to get involved, or found an issue? Please contribute using the GitHub Flow. Create a branch, add commits, and open a Pull Request or submit a new issue.

## Developing

```bash
pnpm install
pnpm run type-check
pnpm run build      # tsup: ESM + types into dist
```

`./worker` ships as TypeScript. Wrangler compiles it, and the generated Worker extends `worker/tsconfig.json` for the compiler options it was written against.

## License

MIT

[npm-image]: https://img.shields.io/npm/v/sanity-plugin-r2-video.svg?style=flat-square
[npm-url]: https://npmjs.org/package/sanity-plugin-r2-video
[npm-downloads-image]: https://img.shields.io/npm/dm/sanity-plugin-r2-video.svg
[npm-downloads-url]: https://npmcharts.com/compare/sanity-plugin-r2-video?minimal=true
