# Red Tulip Photobox

A browser-based photobox for Red Tulip by berdasteran.co. Visitors can open their camera, take a portrait with the Red Tulip frame, retake it, and download the result.

## Features

- Front and rear camera support
- Natural, warm, monochrome, and dreamy filters
- Landscape and portrait Red Tulip frames
- Step-by-step three-shot vertical photobox frames with per-shot retake
- Adjustable brightness and mirror mode
- Optional 3 or 5 second countdown
- `Berdasteran with ...` signature text with position and color controls
- Signature, filter, and frame composited into the downloaded PNG
- Temporary QR sharing through Cloudflare R2 and D1
- Responsive controls for desktop and mobile

## Stack

- SvelteKit
- Svelte 5
- Tailwind CSS 4
- GSAP
- TypeScript

## Development

Install dependencies and start the local server:

```sh
pnpm install
pnpm dev
```

Then open the local URL shown by Vite.

## Checks

```sh
pnpm check
pnpm build
```

## Camera Access

Camera access works on `localhost` during development. A deployed version must use HTTPS and the visitor must grant camera permission in their browser.

## Cloudflare Photo Sharing

The QR sharing flow expects these Cloudflare bindings:

- `PHOTOS`: a private R2 bucket
- `DB`: a D1 database

Create the resources, copy `wrangler.example.jsonc` to `wrangler.jsonc`, and replace the D1 database ID:

```sh
pnpm wrangler r2 bucket create red-tulip-photobox
pnpm wrangler d1 create red-tulip-photobox
pnpm wrangler d1 migrations apply red-tulip-photobox --remote
```

Add an R2 lifecycle rule that deletes objects under `photos/` after one day. Photo links are rejected by the application after 24 hours even if lifecycle deletion is still pending.
