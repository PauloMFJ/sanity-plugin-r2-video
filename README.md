# sanity-plugin-r2-video

Video for Sanity Studio, stored in Cloudflare R2 as a ladder of plain MP4s.

Encoding happens **in the browser** with [mediabunny](https://mediabunny.dev) —
WebCodecs, in a Web Worker. Each source becomes one MP4 per rendition tier, and
the first frame is uploaded to Sanity as a native image, so posters get the
Sanity CDN, `srcset`, `auto=format` and LQIP for free. A rendition is picked
once at load from the element's size, and never swapped.

## Installing

```bash
pnpm add sanity-plugin-r2-video
```

`sanity`, `react`, `react-dom`, `@sanity/ui`, `@sanity/icons` and
`styled-components` are peer dependencies. `mediabunny` is the only real
dependency.

Then add the plugin, and a Worker for it to talk to:

```ts
// sanity.config.ts
import { r2Video } from "sanity-plugin-r2-video/studio";

export default defineConfig({
  plugins: [
    r2Video({
      endpointUrl: "https://….workers.dev",  // deployed Worker
      token: "…",                            // matches the Worker's UPLOAD_TOKEN
      bucketUrl: "https://….r2.dev",         // origin renditions are served from
    }),
  ],
});
```

## Using it

Everything happens in the **R2 Video** tool in the Studio.

**Upload** — drop files onto the library, or press Upload. Files stage in a
list first; nothing encodes until you confirm.

**Settings** — collapsed by default. Open it to change the folder, keep audio,
or adjust quality for this batch only. **Preview** encodes just the tallest tier,
so you can see the size and quality those settings produce before committing.

**Details** — click a card. Plays the video, lists every rendition with its
size, and lets you rename it, move it to another folder, or delete it.

**Sync** — beside Upload. Compares the bucket against the library and offers to
remove anything no document points at.

In a document, add a video through any `asset` field: pick one from the library,
or upload without leaving the page.

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

**`heights`** is the tier ladder. A source shorter than a tier skips it; every
tier it does reach is another full encode.

**`quality`** maps to a **quantizer** for h264, not a bitrate: constant quality,
variable file size. `0.75` is QP 22, where h264 stops being distinguishable from
the source. `1` is QP 16, near-lossless, and routinely produces files **larger
than the source**.

**`preferBitrate`** flips that trade: predictable size, variable quality. A
1080p tier lands near 6.1 Mbps at `0.75` whatever the footage.

**`nativeTopTier`** copies the top rendition instead of re-encoding it, when its
height and codec already match the source — instant and bit-identical. Its size
is then whatever the source was exported at.

## Setting up a Worker

The Worker holds the R2 binding. Scaffold one — the binding name, entry point
and compatibility date are fixed, and the CLI fills in the rest:

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
package upgrades the deployed Worker. Only deployment identity — name, account,
bucket, origins — is written out.

## How it works

```
Studio ──encoded renditions──▶ Worker ──binding──▶ R2 bucket
   │                                                   │
   └──poster──▶ Sanity image assets        bucket URL ─┘
```

The Worker holds the only R2 binding, so **no R2 credentials exist outside
Cloudflare**. Uploads go through it as plain request bodies — nothing is signed,
and the bucket needs no CORS policy. A rendition has to fit in one request body,
which caps an upload at 100 MB.

`UPLOAD_TOKEN` ships inside the Studio bundle, since the browser is what sends
the upload — **anyone who can load the Studio can read it**. The Worker's origin
allowlist is what restricts access. Put Cloudflare Access in front of the Worker
if you need authentication.

### Entry points

Three, each with its own tsconfig and its own type universe:

```
./studio     the Sanity plugin      react, react-dom, @sanity/ui
./worker     the endpoint           @cloudflare/workers-types
./storage    where files live       nothing
```

`./storage` has no dependencies. A web app imports it to build source URLs
without pulling the Studio UI, or `sanity` and `react`, into its bundle.

```ts
import { resolveRenditionPath } from "sanity-plugin-r2-video/storage";

const src = `${bucketUrl}/${resolveRenditionPath(asset._id, 720)}`;
```

### Keys

One directory per video, one object per tier, no folder segment:

```
j6w3wy2bd0jq/270.mp4
j6w3wy2bd0jq/360.mp4
j6w3wy2bd0jq/480.mp4
j6w3wy2bd0jq/720.mp4
j6w3wy2bd0jq/1080.mp4
```

Documents store the id and the heights, not URLs — both the Studio and the web
build sources from `bucketUrl` plus the key. Moving the bucket behind a custom
domain is a config change, not a migration.

### Folders

Videos are filed in the **same folder documents the image library uses**, not a
parallel set. Create a folder in the Media tool and it appears in the video
picker; rename it there and every video moves with it.

The type is `folders.type`, defaulting to `sanity-plugin-media`'s
`media.folder`. The plugin never imports that package — it reads a document type
by name, so `folders.type` can point anywhere.

Keys carry no folder, so renaming or moving a video never touches the bucket.
The tool's filter lists only folders holding video; the upload dialog offers all
of them.

Generated posters go to their own folder (`folders.poster`), created on first
upload, so they stay out of the folders holding real images.

### Deleting

Order matters, and `delete-video.ts` documents it:

1. Preflight `*[references($id)]` — anything found blocks the delete.
2. Delete the document. This releases the strong reference to the poster.
3. Delete the poster asset. Now unreferenced, so no `409`.
4. Delete the R2 objects, batched.

Sanity goes before R2: an orphaned object is invisible and costs pennies, a
document pointing at deleted media breaks the site.

### When an upload fails

The document is written **last**, so a failure can never leave a video in the
library pointing at files that aren't there.

Anything created before that point is rolled back. Keys are recorded *before*
each upload, since a request that times out may still have stored the object.
Rollback never throws — the failure that started it is what surfaces.

**A closed tab or a crash skips rollback entirely**, and encoded renditions live
only in memory, so there's no resume. Whatever either case leaves behind is
unreferenced — **Sync** in the tool finds and removes it.

## Limitations

### Chrome only, for uploading

Uploading needs WebCodecs h264 encoding, which Safari doesn't reliably provide.
The gate is a capability check — mediabunny's own `canEncodeVideo('avc')`, not
user-agent sniffing — and unsupported browsers get told so before they pick a
file. **Playback is unaffected everywhere.**

### The encoder runs in a Web Worker

`transcode.worker.js` is loaded with `new URL(…, import.meta.url)`. Vite serves
that straight from the package, but if it ever pre-bundles the plugin the URL
goes stale — if uploads fail to start, exclude the package from dependency
optimisation:

```ts
// sanity.cli.ts
vite: (config) => ({
  ...config,
  optimizeDeps: { exclude: ["sanity-plugin-r2-video"] },
});
```

## Developing

```bash
pnpm install
pnpm run type-check
pnpm run build      # tsup: ESM + types into dist
```

`./worker` ships as TypeScript: wrangler compiles it, and the generated Worker
extends `worker/tsconfig.json` for the compiler options it was written against.

## License

MIT
