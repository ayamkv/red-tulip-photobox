# Red Tulip Photobox

A browser-based photobox for Red Tulip by berdasteran.co. Visitors can open their camera, take a portrait with the Red Tulip frame, retake it, and download the result.

## Features

- Front and rear camera support
- Natural, warm, monochrome, and dreamy filters
- Landscape and portrait Red Tulip frames
- Adjustable brightness and mirror mode
- Optional 3 or 5 second countdown
- Custom signature text with position and color controls
- Signature, filter, and frame composited into the downloaded PNG
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
