# stash.johnsey.cloud: a personal gif and emoji stash

Status: **approved** by Michael (2026-11-18)

## Intent

Michael keeps favorite reaction gifs at `gifs.johnsey.cloud`, each at a link that never changes. He wants the same for Slack emoji, in the spirit of slackmojis.com but only his own collection, under one broader site: **stash**.

**The real problem is saving.** He comes across gifs while browsing on his phone or computer. Today, saving one means downloading it, committing it to git and opening a PR. That's so clunky that he files a GitHub issue to do it later, or just doesn't. **Success:** he sees a gif or emoji while browsing, and seconds later it's in the stash with a permanent link, from phone or desktop, with no git involved. He is the only person who ever adds anything.

## Goals

- `stash.johnsey.cloud` with two public shelves, `/gifs/` and `/emoji/`, plus a private **admin page** for adding items.
- Add an item in seconds, by **pasting a URL** or **picking or dropping a file**, on phone or desktop. The link works the moment it's saved.
- Keep every existing gif URL working **byte-for-byte, with no redirect**, on the old domain: `https://gifs.johnsey.cloud/gifs/<name>.gif` and `https://gifs.johnsey.cloud/inventory.json`.
- Emoji shelf: a dense grid, search, **Download** (Slack needs a file upload) and **Copy `:name:`**.
- Gifs shelf: what PR #41 built (poster grid, play on hover or tap, search, Copy link), rebuilt in React.
- PR previews for code changes. Deploys go from GitHub Actions to Michael's **personal** Cloudflare account.

## Non-goals (v1)

- Anyone but Michael adding items. No accounts, voting, comments or categories.
- Pushing emoji into a Slack workspace automatically.
- A phone share-sheet shortcut (an iOS Shortcut posting to the admin API). It's a good v2, so keep the add-item API usable by a non-browser client later.
- Renaming items. A rename breaks links; delete and re-add instead.
- Automated backups beyond R2's own durability (see Backups).

## Anti-goals (failure even if it "works")

- Any existing `gifs.johnsey.cloud/...` gif URL returns a 404 or a non-gif, redirects, or changes bytes.
- Anything uses the Cloudflare CLI credentials on Michael's machine. **That is his work account.** Never run authenticated `wrangler`/`cf` commands locally for this project. Anything that touches Cloudflare runs in GitHub Actions with personal-account secrets, or Michael does it in his dashboard. Local dev uses Wrangler/Miniflare's local simulation only: `vite dev`, `wrangler dev` with local bindings and no `--remote`, and tests.
- Adding an item still takes many steps on a phone.
- A public shelf downloads every full gif on open.
- Anyone but Michael can write, including through a PR preview deployment.

## Constraints and facts

- **Current state:** GitHub Pages (legacy build from `main`) serves 52 gifs from `gifs/` in the repo: 50 files plus 2 symlink aliases, `smh` → `bunk-smh` and `frustrated` → `denzel-table-slap`. `inventory.json` is `{"gifs": {name: "gifs/<file>"}}`. PR #41 (branch `modernize`, unmerged) contains the vanilla-JS redesign. This work supersedes it: #41 gets closed, and its design is ported.
- **DNS:** the `johnsey.cloud` zone is in Michael's personal Cloudflare account. `gifs.johnsey.cloud` is a DNS-only CNAME to `mjohnsey.github.io`.
- **Cloudflare Images (hosted storage) was rejected.** It has a 10 MB upload cap (3 existing gifs are bigger, up to 19.5 MB) and serves through its own URL and variant scheme rather than the original bytes.
- **Image Transformations** (resizing on the fly, from R2-backed URLs on the zone) is used for posters and thumbnails. The free plan includes 5,000 unique transformations a month, and cached results don't count again. `anim=false` gives a gif's first frame as a still. Animations over about 50 megapixels of total frames may come back untransformed, so posters need a fallback (see below). It works only on hostnames in the zone, not `*.workers.dev`. Michael enables it on the zone in his dashboard.
- **Palette** (approved): page Baby Blue `#dceaf4`, text deep emerald `#1f3b2d`, muted text `#476b58`, screens `#3e6550`, accent `#2c6e4b`. Honeysuckle `#da7da0` is used **only** for "copied" and "saved" confirmations; Michael asked not to use much rose. Dark mode: the tokens from PR #41's `src/main.css`. Typeface: Bricolage Grotesque. The visual reference is PR #41's page.

## Approaches considered

1. **Admin page that commits to git through GitHub's API.** It keeps git as the source, but links wait 1–2 minutes for a deploy, the repo bloats faster, and a write token for the repo lives in the backend. *Rejected by Michael: "a non-starter".*
2. **Files in R2, an admin page writing straight to it, and Cloudflare Access for login.** Links work instantly, there's no file-size or repo-size pressure, and no auth code to write. *Chosen.*
3. **GitHub issue → bot PR.** The cheapest change, but saving is still multi-step and links wait for a merge. Rejected: it doesn't fix the friction.

Work branches from `main`, not from PR #41's commits. #41's page is ported, not merged.

Also considered and dropped: **Cloudflare Images** for storage (see Constraints), and staying on GitHub Pages with a redirect (no previews, no backend).

## Decisions

### Stack (Michael's call: React and TypeScript)
- **TypeScript everywhere.** Strict mode.
- **Frontend:** React single-page app built with Vite. It's served as static assets by the same Worker.
- **Backend:** one Cloudflare Worker in TypeScript, handling the API, serving files from R2, and serving the SPA's assets. It uses the Cloudflare Vite plugin so `vite dev` runs the Worker and the app together locally. A small router like Hono is fine (builder's call).
- **Metadata in D1**, *my call*. It holds one row per item: shelf, name, file key, content type, byte size, width, height, alias target, created at, and source URL if any. Listing, search, aliases and uniqueness checks are simple SQL, and R2 holds only bytes.
- **Tests:** Vitest with the Workers test pool for the Worker; component tests where they pay off. The builder chooses the depth, but the URL-preservation check (below) is mandatory.

### Domains
- `stash.johnsey.cloud` is canonical (Michael's decision). Every "Copy link" gives out `https://stash.johnsey.cloud/...`, whichever host serves the page. On PR previews it copies the preview's own URL.
- `gifs.johnsey.cloud` is a **permanent alias** for files: every file URL (`/gifs/<name>.gif`, `/inventory.json`, and any other file path) is served directly, byte-for-byte, forever. The README says so.
- **The bare old domain redirects** (Michael's decision): `https://gifs.johnsey.cloud/` returns a **301 to `https://stash.johnsey.cloud/`**. *My call:* every other page (non-file) route on the old domain, such as `/gifs/`, `/emoji/` or `/admin`, also 301s to the same path on `stash`. Only file URLs are served on the old domain.
- Rename the GitHub repo to `mjohnsey/stash.johnsey.cloud`. GitHub redirects the old repo URL.

### URLs

```
/                      home: "stash" wordmark, both shelves with counts and a few samples
/gifs/                 gif shelf (SPA route)
/gifs/<name>.gif       original bytes from R2, unchanged forever
/emoji/                emoji shelf (SPA route)
/emoji/<name>.<ext>    original bytes from R2 (png, gif, jpg; webp only if Slack accepts it)
/admin                 admin page (behind Cloudflare Access)
/api/items             public JSON listing for the SPA
/api/admin/*           write API (behind Access, and checked again in the Worker)
/inventory.json        unchanged shape {"gifs": {name: "gifs/<file>"}}, generated from D1
```

- File routes set the right `Content-Type`, `ETag` and `Content-Length`, support `HEAD`, and cache well at the edge. Items can be deleted, so don't mark files immutable forever; the builder picks the TTLs.
- `/gifs/` and `/emoji/` (trailing slash) are SPA routes. Anything with a file extension under them is a file.
- Aliases: an alias is its own D1 row pointing at a target. Its URL serves the target's bytes, and the shelf shows it as "also <alias>" under the original, as PR #41 does.

### Posters and thumbnails
- The gifs shelf shows a still poster: `/cdn-cgi/image/anim=false,width=480,format=auto/gifs/<name>.gif`, or the Worker equivalent. The full gif loads on hover or tap.
- **Fallback:** when you save a gif, the admin page also makes a first-frame poster in the browser (canvas or `ImageDecoder`) and uploads it to R2 at `posters/<name>.webp`. The shelf uses the stored poster whenever one exists. For the 52 migrated gifs, the migration generates posters with ffmpeg in CI. The builder can drop the transformation path entirely if stored posters cover everything. **Spike first:** run the transformation on the largest existing gifs to see which fail.
- On hosts without transformations (previews, local dev), fall back to stored posters, then to the original file with `loading="lazy"`.
- Emoji tiles show the original file at Slack-like size; emoji are small enough not to need transforming.

### Admin page
- **Mobile-first.** It must be quick one-handed on a phone.
- **Inputs:** paste a URL; pick a file (the phone photo library works through `<input type=file accept=image/*>`); drag and drop or paste from the clipboard on desktop.
- **Video sources are rejected** (Michael's decision). Many "gifs" online are really MP4 or animated WebP (X/Twitter, Imgur `.gifv`, Reddit, Giphy's default rendition). The gifs shelf accepts **real GIF bytes only**. For Giphy and Tenor, URL import picks their `.gif` rendition. Anything else that turns out to be a video gets a clear message: "That's a video, not a gif. Try the Giphy or Tenor version, or upload a gif." Converting in the browser (ffmpeg.wasm) is a possible v2.
- **Bulk add:** the file picker and drop zone accept **many files at once**. Each file gets its own row: preview, shelf, name and Slack-limit warnings, with problems flagged per row. One "Save all" saves the valid rows, and per-row errors don't block the others.
- **URL import:** the Worker fetches the URL server-side. If it's an HTML page, it resolves the image from `og:image` or the page's direct media, with a known-good path for Giphy and Tenor share URLs. It accepts only image types (gif, png, jpg, webp) and checks the actual bytes, not just the extension. It caps download size (25 MB, *my call*) and caps redirects. It refuses private and loopback addresses (SSRF), even though only Michael can reach the endpoint.
- **Form:** a preview of the image, the shelf (gif or emoji; guessed from size and dimensions, editable), and the name (a slug suggested from the URL or file name, editable, `[a-z0-9-]`, unique per shelf, never overwrites). Optional aliases.
- **Emoji checks:** warn, without blocking, when an emoji exceeds Slack's custom-emoji limits. The builder looks up Slack's current limits.
- **After saving:** show the canonical link with Copy (Honeysuckle "Copied") and a link to view it on its shelf.
- **Delete:** available, with a confirmation that says plainly that the link will stop working. *My call: no rename* (see Non-goals).
- **Recently added:** a short list on the admin page.

### Auth
- **Cloudflare Access** protects `stash.johnsey.cloud/admin*` and `/api/admin/*` with an allow policy for Michael's email only. He sets this up in his dashboard (Zero Trust free plan); the README gives the exact steps.
- The Worker **also** checks the `Cf-Access-Jwt-Assertion` header against the Access team domain and application AUD before any write, so a route or policy mistake can't open writes.
- **`gifs.johnsey.cloud` refuses all admin writes.** The Worker allows writes only when the request host is exactly `stash.johnsey.cloud`, plus a valid Access JWT.
- **PR previews never get production bindings** (*my call*, from the builder check). A same-repo branch could otherwise remove the host check in its own code and write to production. Previews deploy to a **separate preview Worker** (a wrangler environment) bound to its own `stash-preview` R2 bucket and D1 database. It's seeded with a handful of sample gifs and emoji, and its admin can be tried freely. Schema migrations run against the preview database on PRs, so they're tested before merge.

### Hosting and deploy
- A `wrangler.jsonc` in the repo declares the Worker, the static assets (Vite output), the R2 bucket binding, the D1 binding, `stash.johnsey.cloud` as a custom domain, and a `gifs.johnsey.cloud/*` route (see Cutover).
- **GitHub Actions:**
  - PRs: typecheck, test, build, apply D1 migrations to the **preview** database, upload a version of the **preview** Worker with alias `pr-<n>`, and post a single PR comment with the preview URL, updated on later pushes.
  - Push to `main`: the same checks, then apply D1 migrations, then `wrangler deploy`.
  - Fork and Dependabot PRs have no secrets: they build and test but skip the preview.
- Secrets: `CLOUDFLARE_API_TOKEN` (personal account, minimum permissions for Workers, R2, D1 and routes on the `johnsey.cloud` zone) and `CLOUDFLARE_ACCOUNT_ID`. Michael creates the token; Claude can set the secrets with `gh secret set`.
- Pin wrangler and action versions. Look up current ones; don't recall them.

### Initial emoji
Michael's existing emoji are in `~/Downloads/slackmojis/`: 31 files outside `cr-only/` (15 gif, 16 png, 2.7 MB). **Nothing under `cr-only/` is imported** (Michael's instruction). They're imported after launch through the admin page's bulk add; no separate import job is needed. File names, minus the extension, are the `:name:`s. They're already slugs.

### Plan limits
Design for **Workers Free** (*my call*): 10 ms CPU per request, with I/O wait not counted. URL import streams the response into R2 (`FixedLengthStream` when the length is known, otherwise buffering up to the cap). It parses HTML only for small pages. Posters and dimensions are computed in the browser. If something hits the CPU limit in practice, upgrading to Workers Paid is the escape hatch, not a redesign.

### inventory.json
It's generated from D1 on request. It keeps the `{"gifs": {name: "gifs/<file>"}}` shape, with sorted keys, including every gif and alias, new ones too. Its bytes are not frozen; only the shape and the existing entries are.

### Migration of the existing gifs
- A one-off GitHub Actions workflow (`workflow_dispatch`, run once by Michael) does three things:
  1. Uploads every file in `gifs/` to R2 at the same key, dereferencing symlinks into alias rows.
  2. Generates ffmpeg posters.
  3. Inserts the D1 rows.
- It must be safe to re-run: skip existing keys and verify hashes.
- Before cutover, **verify every URL from a snapshot of the live `inventory.json`**. The bytes from `stash.johnsey.cloud` must hash-match the bytes from the live GitHub Pages site.
- After a successful cutover, delete `gifs/`, the old build files and `CNAME` from the repo in a follow-up PR. Git history keeps the originals.

### Cutover (order matters)
1. Merge and deploy, with `stash.johnsey.cloud` as a custom domain and the `gifs.johnsey.cloud/*` route both declared. The route is inert while the gifs record is DNS-only, so GitHub Pages keeps serving the old domain. The builder confirms that a Worker route serves the full app, including file routes and static assets.
2. Run the migration and verify every snapshot URL on `stash.johnsey.cloud` by hash.
3. Michael switches the `gifs` CNAME to **Proxied** in his dashboard. The route takes over within seconds.
4. Verify every snapshot URL on `gifs.johnsey.cloud`: 200, `image/gif`, no redirect, matching hash.
5. Then disable GitHub Pages and clean up the repo (see Migration).

Rollback before step 5: switch the record back to DNS-only. GitHub Pages is still serving.

The old domain's home page breaks between step 1 and step 3, because `main` no longer has a root `index.html` for GitHub Pages. The gif files are still served. Keep that window short. After step 3 the bare domain 301s to `stash.johnsey.cloud`, and step 4 also checks that redirect.

### Backups
*My call for v1:* rely on R2's durability, plus git history for the original 52 gifs. The README documents a one-line manual export with an S3-compatible tool such as rclone, using an R2 token from the personal account. Scheduled backups are a possible v2.

## Left to the builder
- Component structure, routing library, state and data fetching (e.g. TanStack Query or plain `fetch`), and CSS approach (port PR #41's CSS tokens).
- Emoji tile size and grid density, the home page's samples, the 404 page, and empty states. An empty shelf tells Michael how to add something.
- Cache TTLs, how the PR comment is posted, and D1 schema details beyond the fields listed.
- Whether to keep the transformation path for posters after the spike.
