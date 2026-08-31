# sanity-plugin-r2-video

Video for Sanity Studio. Encodes in the browser, stores plain MP4s in Cloudflare
R2.

Encoding runs on the editor's machine through [mediabunny](https://mediabunny.dev),
using WebCodecs in a Web Worker. One MP4 comes out per height you ask for. The
first frame is uploaded to Sanity as an ordinary image, so posters get the Sanity
CDN, `srcset`, `auto=format` and LQIP without any extra work. Players pick one
rendition when they load and keep it.

## Installing

```bash
pnpm add sanity-plugin-r2-video
```

`sanity`, `react`, `react-dom`, `@sanity/ui`, `@sanity/icons` and
`styled-components` are peer dependencies. `mediabunny` is the only real
dependency.

Add the plugin, pointing it at a Worker you've deployed (see [Setting up a
Worker](#setting-up-a-worker)):

```ts
// sanity.config.ts
import { r2Video } from "sanity-plugin-r2-video/studio";

export default defineConfig({
  plugins: [
    r2Video({
      endpointUrl: "https://….workers.dev",  // deployed Worker
      token: "…",                            // matches the Worker's UPLOAD_TOKEN
      bucketUrl: "https://….r2.dev",         // where renditions are served from
    }),
  ],
});
```

That registers two schema types and a tool. Add video to a document with the
`r2Video` type:

```ts
defineField({ name: "video", title: "Video", type: "r2Video" })
```

## Using it

Videos live in the **R2 Video** tool.

**Upload** — drop files onto the library, or press Upload. Files stage in a list
first and nothing encodes until you confirm.

**Settings** — collapsed by default. Open it to change the folder, keep audio, or
adjust quality for one batch. **Preview** encodes only the tallest tier, so you
can check size and quality before running the whole ladder.

**Details** — click a card to play the video and see every rendition with its
size. Rename it, move it to another folder, or delete it from here.

**Sync** — next to Upload. Compares the bucket against the library and offers to
remove anything no document points at.

Inside a document, an `r2Video` field lets you pick from the library or upload
without leaving the page.

## What you get back

An `r2Video` field stores a reference and nothing else, so the same video can be
used on many documents without encoding it twice:

```json
{ "_type": "r2Video", "asset": { "_type": "reference", "_ref": "hK3n…" } }
```

Follow the reference and you get an `r2Video.asset` document. It holds metadata
only. The MP4s are in R2 and the poster is a normal Sanity image asset:

```ts
type R2VideoAsset = {
  _id: string;
  _type: "r2Video.asset";
  filename: string;                       // display name, safe to change
  folder?: { _type: "reference"; _ref: string };
  poster: { _type: "image"; asset: { _type: "reference"; _ref: string } };
  duration: number;                        // seconds
  hasAudio: boolean;
  uploadedAt: string;                      // ISO 8601
  renditions: {
    width: number;
    height: number;
    key: string;                           // R2 object key, e.g. "j6w3wy2bd0jq/720.mp4"
    size: number;                          // bytes
  }[];
};
```

Every type here is exported from `sanity-plugin-r2-video/studio`.

A rendition's `key` is the whole story for playback. Join it to your `bucketUrl`
and you have a source URL:

```ts
const src = `${bucketUrl}/${rendition.key}`;
```

`renditions` only ever contains heights that were actually encoded. A 480p source
never produces a 1080p entry, so you can pick from this array without checking
whether a tier exists.

A query that gives a front end everything it needs:

```groq
video {
  asset -> {
    duration,
    hasAudio,
    "heights": renditions[].height,
    "aspectRatio": poster.asset -> metadata.dimensions.aspectRatio,
    poster { asset -> { url, metadata { lqip } } }
  }
}
```

If you'd rather store the video's id than a list of keys, take it off any key and
rebuild the rest with `resolveRenditionPath`. Keys are `<id>/<height>.mp4`, so the
id is the part before the slash:

```ts
import { resolveRenditionPath } from "sanity-plugin-r2-video/storage";

const src = `${bucketUrl}/${resolveRenditionPath(id, 720)}`;
```

```groq
"id": string::split(renditions[0].key, "/")[0]
```

Note that the id is not the document's `_id`. It's generated at upload time for
the R2 key, so a video keeps its objects even if the document is recreated.

## Configuring

Only `endpointUrl`, `token` and `bucketUrl` are required. Everything else falls
back to [`studio/defaults.ts`](studio/defaults.ts), shown here with its defaults.

```ts
r2Video({
  endpointUrl: "https://….workers.dev",
  token: "…",
  bucketUrl: "https://….r2.dev",
  apiVersion: "2024-01-01",
  tool: { name: "r2-video", title: "R2 Video" },
  folders: {
    type: "media.folder",             // document type folders are read from
    poster: "_R2 Video Posters",      // where generated posters are filed
  },
  encoding: {
    heights: [270, 360, 480, 720, 1080],
    videoCodec: "avc",
    audioCodec: "aac",
    quality: 0.75,
    preferBitrate: false,
    nativeTopTier: false,
  },
});
```

### Encoding

**`heights`** is the tier ladder. A source shorter than a tier skips it. Every
tier it does reach is another full encode, so the list is what upload time costs.

**`quality`** sets a quantizer for h264 rather than a bitrate, so quality stays
constant and file size varies. `0.75` is QP 22, where h264 stops being
distinguishable from the source. `1` is QP 16, near-lossless, and routinely
produces files **larger than the source**.

**`preferBitrate`** flips that trade for predictable size and variable quality. A
1080p tier lands near 6.1 Mbps at `0.75` whatever the footage.

**`nativeTopTier`** copies the top rendition instead of re-encoding it, when its
height and codec already match the source. That's instant and bit-identical, and
its size is whatever the source was exported at.

## Setting up a Worker

The Worker holds the R2 binding. Scaffold one and the binding name, entry point
and compatibility date come out right:

```bash
pnpx sanity-plugin-r2-video setup worker
```

Pass `--account`, `--bucket`, `--name` and `--origins` to skip the prompts.

Then install its dependencies, create the bucket, set the shared secret, and
deploy:

```bash
pnpm add sanity-plugin-r2-video
pnpm add -D wrangler @cloudflare/workers-types
wrangler r2 bucket create my-bucket
openssl rand -base64 32
wrangler secret put UPLOAD_TOKEN --config r2-video-worker/wrangler.jsonc
wrangler deploy --config r2-video-worker/wrangler.jsonc
```

Give `r2Video()` the deployed URL as `endpointUrl`, the same secret as `token`,
and the bucket's public URL as `bucketUrl`.

The generated entry point re-exports this package's handler, so upgrading the
package upgrades the deployed Worker. Only deployment identity gets written out:
name, account, bucket and origins.

## How it works

```
Studio ──encoded renditions──▶ Worker ──binding──▶ R2 bucket
   │                                                   │
   └──poster──▶ Sanity image assets        bucket URL ─┘
```

The Worker holds the only R2 binding, so **no R2 credentials exist outside
Cloudflare**. Uploads go through it as plain request bodies, which means nothing
is signed and the bucket needs no CORS policy. A rendition has to fit in one
request body, capping an upload at 100 MB.

`UPLOAD_TOKEN` ships inside the Studio bundle, because the browser is what sends
the upload. **Anyone who can load the Studio can read it.** What actually
restricts access is the Worker's origin allowlist. Put Cloudflare Access in front
of the Worker if you need real authentication.

### Entry points

Three, each with its own tsconfig and its own type universe:

```
./studio     the Sanity plugin      react, react-dom, @sanity/ui
./worker     the endpoint           @cloudflare/workers-types
./storage    where files live       nothing
```

`./storage` has no dependencies. A web app can import it to build source URLs
without pulling the Studio UI, `sanity` or `react` into its bundle.

### Keys

One directory per video, one object per tier, and no folder segment:

```
j6w3wy2bd0jq/270.mp4
j6w3wy2bd0jq/360.mp4
j6w3wy2bd0jq/480.mp4
j6w3wy2bd0jq/720.mp4
j6w3wy2bd0jq/1080.mp4
```

Documents store keys and heights rather than URLs, and both the Studio and your
front end build sources from `bucketUrl`. Moving the bucket behind a custom
domain is a config change rather than a migration.

### Folders

Videos are filed in the same folder documents your image library uses, rather
than a parallel set. Create a folder in the Media tool and it shows up in the
video picker. Rename it there and every video moves with it.

The type is `folders.type`, which defaults to `sanity-plugin-media`'s
`media.folder`. The plugin never imports that package. It reads a document type
by name, so `folders.type` can point anywhere.

Keys carry no folder, so renaming or moving a video never touches the bucket. The
tool's filter lists only folders holding video, while the upload dialog offers
all of them.

Generated posters go to their own folder, set by `folders.poster` and created on
first upload, so they stay out of the folders holding real images.

### Deleting

Order matters here, and `delete-video.ts` documents it:

1. Preflight `*[references($id)]`. Anything found blocks the delete.
2. Delete the document, which releases the strong reference to the poster.
3. Delete the poster asset, now unreferenced, so no `409`.
4. Delete the R2 objects, batched.

Sanity goes before R2. An orphaned object is invisible and costs pennies, while a
document pointing at deleted media breaks the site.

### When an upload fails

The document is written last, so a failure can't leave a video in the library
pointing at files that aren't there.

Anything created before that point is rolled back. Keys are recorded before each
upload rather than after, since a request that times out may still have stored
the object. Rollback never throws, so the failure that started it is what you
see.

A closed tab or a crash skips rollback, and encoded renditions live only in
memory, so there's no resume. Whatever either case leaves behind is unreferenced,
and **Sync** in the tool finds and removes it.

## Limitations

Uploading needs WebCodecs h264 encoding, which Safari doesn't reliably provide,
so uploads are effectively Chrome-only today. The gate is a capability check
using mediabunny's `canEncodeVideo('avc')` rather than user-agent sniffing, and
unsupported browsers are told before they pick a file. Playback works everywhere.

## Developing

```bash
pnpm install
pnpm run type-check
pnpm run build      # tsup: ESM + types into dist
```

`./worker` ships as TypeScript. Wrangler compiles it, and the generated Worker
extends `worker/tsconfig.json` for the compiler options it was written against.

## License

MIT
