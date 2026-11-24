# stash.johnsey.cloud

A personal stash of gifs and emoji, each at a link that won't change. Click
Copy link and paste it anywhere. The site is a Cloudflare Worker (Hono) with R2
for the files, D1 for the catalog, and a React app on top.

> **Cloudflare warning.** The Cloudflare login on this machine is the WORK
> account. Nothing in this repo ever uses it. Never run `wrangler` against
> Cloudflare from this machine (no `--remote`, no `wrangler login`, no
> `wrangler deploy`). Everything remote runs in GitHub Actions with repo
> secrets from the PERSONAL account. Check the account switcher in the
> Cloudflare dashboard before you create anything.

## What's here

- `/gifs/` and `/emoji/`: the public shelves. Copy a link, copy `:name:` for emoji, or download.
- `/admin`: add and delete items, and set aliases when adding. There is no rename: to change a name, delete the item and add it again. It sits behind Cloudflare Access.
- `worker/`: the API and file serving. `src/`: the React app. `migrations/`: D1 schema.
- `scripts/`: the one-off migration and the URL verifier.

## Adding items

1. Open `https://stash.johnsey.cloud/admin` and sign in through Cloudflare Access.
2. Add files first (choose several at once or drop them in), or use "Paste a link to a gif or image" (a direct file link, or a page link whose `og:image` is used, such as Tenor or Giphy). Each file becomes a row in the queue.
3. On each row, pick the shelf (Gifs or Emoji), check the suggested name (lowercase, hyphens, 64 characters max, unique on the shelf), add aliases if you want (comma separated), and Save, or Save all.
4. After saving, Copy link, or View on shelf. To delete anything later, use "Recently added" or search "All items" on the same page.

The gifs shelf takes real GIF bytes only; video is rejected. URL imports are
capped at 25 MB.

## How the URLs work

`https://stash.johnsey.cloud` is the canonical home. File URLs look like:

- `/gifs/<name>.gif`
- `/emoji/<name>.<gif|png|jpg>`
- `/posters/<name>.webp` (or `.jpg`, for gifs added from Safari, which can't encode WebP)
- `/inventory.json`

Every file URL on `gifs.johnsey.cloud` keeps working forever, with no redirect,
so old links never break. The bare `gifs.johnsey.cloud/` and any other page
there redirect (301) to the same path on `stash.johnsey.cloud`.

## Local development

```sh
cp .dev.vars.example .dev.vars   # local-only settings, gitignored
pnpm install
pnpm migrate:local               # apply D1 migrations to local state
pnpm dev                         # Vite plus the Worker, with a local R2 and D1
```

`.dev.vars` sets `DEV_BYPASS_ACCESS=1`, so `/admin` works locally without
Access, so you can add items locally through it. Everything here is local
(`--local`); no Cloudflare account is touched.

Checks (these stay hermetic with `.dev.vars` present):

```sh
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Deploys

CI (`.github/workflows/ci.yml`) runs the checks on every PR. Same-repo PRs also
deploy a preview to the separate `stash-preview` Worker, with its own R2 bucket
and D1 database, and comment the URL. A push to `main` applies migrations and
deploys production. Because a merge deploys, work reaches `main` only through a
PR.

Manual workflow: `Verify URLs` (`verify.yml`, inputs `base` and optional
`expect_redirect_root`) checks the original gif URLs against the stored hashes
in `scripts/snapshot/`. R2 and D1 are the source of truth; the repo no longer
holds the gif files.

The cutover from GitHub Pages is a one-time process: see
[docs/cutover.md](docs/cutover.md).

## Backup

Files live in the R2 bucket `stash-media`. R2 is durable, but a copy is cheap.
The rclone backup covers only the files: D1 (aliases, source URLs, the catalog
itself) is not covered by it, and there is no D1 backup yet.

```sh
rclone sync r2:stash-media ./stash-backup
```

To set this up, in the PERSONAL Cloudflare account go to R2, Manage API tokens,
and create a token with Object Read only on `stash-media`. Then run
`rclone config` and add a remote named `r2` with type `s3`, provider
`Cloudflare`, `region = auto`, `no_check_bucket = true`, the token's access key ID and secret, and endpoint
`https://<account-id>.r2.cloudflarestorage.com`.
