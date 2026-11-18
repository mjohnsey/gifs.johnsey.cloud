# gifs.johnsey.cloud

My favorite gifs, each at a link that won't change:
`https://gifs.johnsey.cloud/gifs/<name>.gif`.

> **Work in progress.** This repo is moving from a static GitHub Pages site to a
> Cloudflare Worker (Hono) plus a React app at `stash.johnsey.cloud`. The
> Pages build and its `Build and deploy` workflow have been removed; the last
> Pages deploy stays live until cutover. This README is rewritten in a later task.

## Development

```sh
npm install
npm run dev        # vite + the Worker locally
npm test           # Worker tests (Vitest, workers runtime)
npm run typecheck
npm run build
```

Never run authenticated `wrangler` commands from a laptop; remote operations run in GitHub Actions.

The existing gifs stay in `gifs/` until they're migrated.
