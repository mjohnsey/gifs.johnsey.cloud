# Cutover runbook

Moves `gifs.johnsey.cloud` (GitHub Pages) to `stash.johnsey.cloud` (Cloudflare
Worker). Each step says who does it: **[Michael]** in a dashboard, or
**[Claude]** through `gh` or a script.

> **Never use Wrangler's login or the `default` `cf` profile on Michael's
> machine. Both are his WORK account.** Deploys and migrations run in GitHub
> Actions with the account-owned API token below, from the PERSONAL account.
> Local `cf` commands use the `personal` profile, which is bound to
> `~/dev/src/github.com/mjohnsey`; run `cf auth whoami` first and check that it
> shows the personal account.

**Status (2026-11-23):** steps 1 to 4 and 5b are done. Claude ran them with
`cf --profile personal`:

- Account-owned token "stash GitHub Actions deploy". Account: Workers Scripts
  Write, Workers R2 Storage Write, D1 Write, Account Settings Read, Workers Tail
  Read. Zone `johnsey.cloud`: Workers Routes Write, DNS Write, Zone Read, SSL and
  Certificates Write. It is stored as `CLOUDFLARE_API_TOKEN`, with
  `CLOUDFLARE_ACCOUNT_ID`, in the repo secrets.
- R2 `stash-media` and `stash-preview-media`; D1 `stash` and `stash-preview`.
  Their IDs are in `wrangler.jsonc`.
- Team domain `johnsey.cloudflareaccess.com`. Access apps:
  - "stash admin" covers `/admin`, `/admin/*` and `/api/admin/*` on
    `stash.johnsey.cloud`.
  - "stash preview" covers `stash-preview.mjohnsey.workers.dev` and
    `*-stash-preview.mjohnsey.workers.dev`.

  Both allow only Michael's email, with a 168h session. Their AUDs are in
  `wrangler.jsonc`.

Next is step 5, Michael's check of the preview.

Where things stand: PR #41 is already merged, and the live site is its last
GitHub Actions Pages deploy. But Pages is still configured with
`build_type: legacy` (source: `main`, `/`), not "GitHub Actions". This branch
deletes `pages.yml`, so merging it as-is would trigger a legacy build from
`main` (which has no built site and no `inventory.json`), and nothing would
republish the working deploy: the old domain's `inventory.json` would 404 and
its home page would break, and the step 8 rollback would land on that degraded
site. Step 5b switches Pages to `build_type: workflow` before the merge, which
keeps the existing deployment live and stops legacy builds. With that done,
merging leaves the live deploy unchanged until step 10 (step 8 only moves
traffic to the Worker; Pages keeps serving behind it). Merging is step 6 and
must wait for steps 1 to 5b.

## Before the merge

1. **[Michael]** In the personal account, create an API token (My Profile, API
   Tokens). Permissions:
   - Start from Cloudflare's "Edit Cloudflare Workers" template. Set account
     resources to the personal account and zone resources to `johnsey.cloud`.
   - Add Account > D1 > Edit and Zone > DNS > Edit.
   - The result should include Account: Workers Scripts Edit, Workers R2
     Storage Edit, D1 Edit; Zone `johnsey.cloud`: Workers Routes Edit, DNS Edit
     (for the custom domain), plus the template's other Workers permissions.

   Give Claude the token and the account ID.

2. **[Claude]** Set the repo secrets and rerun CI on the PR:

   ```sh
   gh secret set CLOUDFLARE_API_TOKEN
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

   It worked if the `check` job passes. The `preview` job needs only step 3
   (it creates the `stash-preview` Worker itself), so it fails until then.

3. **[Michael]** Create R2 buckets `stash-media` and `stash-preview-media`, and
   D1 databases `stash` and `stash-preview`. Paste each database ID into
   `wrangler.jsonc` (the zero UUIDs, in the top-level `d1_databases` and in
   `env.preview.d1_databases`), or share the IDs and Claude does it. Then push the ID commit and wait for
   the `preview` job to go green; that creates the `stash-preview` Worker, which
   step 4 needs.

   Gate: `grep -n 00000000-0000 wrangler.jsonc` prints nothing before merging.

4. **[Michael]** Zero Trust (free plan): set the team domain.
   - Create one self-hosted application covering `stash.johnsey.cloud/admin`
     and `stash.johnsey.cloud/api/admin/*`, with policy Allow, email equals
     his address. Copy its Application Audience (AUD) tag.
   - For preview: in the `stash-preview` Worker's settings, enable Cloudflare
     Access for workers.dev and Preview URLs. Copy that AUD too.
   - Share the team domain (`<team>.cloudflareaccess.com`) and both AUDs with
     Claude, or paste them yourself. They go in `wrangler.jsonc`: top-level
     `vars.ACCESS_TEAM_DOMAIN` and `vars.ACCESS_AUD` for production, and the same
     two keys under `env.preview.vars` for preview (each env has its own).

   Then push the config commit and wait for the `preview` job to go green, so
   the preview Worker carries the real Access vars before step 5.

   It worked if no `REPLACE-ME` is left in `wrangler.jsonc`
   (`grep REPLACE-ME wrangler.jsonc` prints nothing) and the `preview` job is
   green on that commit.

5. **[Michael]** Check the preview. Open the preview URL from the PR comment
   and sign in with the preview Access app (not the production one). It worked
   if:
   - You can add one gif through `/admin` by pasting a real Tenor share link
     (this is the only check of Tenor's `og:image` handling), and one by
     pasting a Giphy share link (Giphy can serve WebP; the import must still
     yield a gif), and one emoji by file upload.
   - Both appear on their shelves and Copy link works.
   - Add a gif of 10 MB or more through the preview admin. This is the check
     of CPU time and request limits on the Worker (the cap is 25 MB).
   - Save a gif from an iPhone (Safari) and confirm its poster exists: the
     shelf tile shows a still image, and `/posters/<name>.jpg` (Safari can't
     encode WebP, so its posters are JPEG) returns 200.
   - Delete one of the test items from the "All items" list.
   - `/admin` is reachable only after Access sign-in.

   (`migrate.yml` can't be dispatched before the merge, because
   `workflow_dispatch` needs the file on the default branch. Seeding preview is
   an optional step after the merge.)

5b. **[Claude, with Michael's OK]** Switch GitHub Pages from the legacy branch
build to workflow builds, so merging can't trigger a legacy build from
`main`:
`sh
    gh api -X PUT repos/mjohnsey/gifs.johnsey.cloud/pages -f build_type=workflow
    `
This keeps the existing deployment live and stops legacy builds. Do not
skip it: see "Where things stand".

    Gate: `gh api repos/mjohnsey/gifs.johnsey.cloud/pages --jq .build_type`
    prints `workflow`.

## Cutover

6. **[Michael]** Approve and merge the PR. CI deploys production, and
   `stash.johnsey.cloud` attaches as a Worker custom domain. It worked if the
   `deploy` job on `main` is green. `gifs.johnsey.cloud` still serves GitHub
   Pages, because its DNS record is DNS-only.

   **[Claude]** Check that Pages is still serving after the merge:

   ```sh
   curl -sI https://gifs.johnsey.cloud/inventory.json | head -n 1
   curl -sI https://gifs.johnsey.cloud/gifs/smh.gif | grep -iE '^(HTTP|content-type)'
   ```

   It worked if `inventory.json` returns 200 and `gifs/smh.gif` returns 200
   with `content-type: image/gif`. If either fails, stop before step 8: Pages
   isn't serving, and the rollback in step 8 would land on a broken site.

7. **[Claude]** (Optionally seed preview first: `gh workflow run migrate.yml -f environment=preview`.)
   Seed production, then verify the new origin:

   ```sh
   gh workflow run migrate.yml -f environment=production
   gh workflow run verify.yml -f base=https://stash.johnsey.cloud
   ```

   It worked if both runs pass. `verify.yml` checks every file URL against the
   hashes in `scripts/snapshot/live-hashes.json`. The migrate script refuses to
   run remotely outside GitHub Actions, so this only ever happens there.

   The migration only adds names that have no D1 row yet and logs each skip,
   so it is safe to re-run. Do not dispatch `migrate.yml` after admin edits
   except to fill gaps: it never overwrites or resurrects anything, but it
   won't repair an item either (to fix one, delete and re-add it in `/admin`).

8. **[Michael]** In Cloudflare DNS, switch the existing `gifs` CNAME from
   DNS-only to **Proxied**. The `gifs.johnsey.cloud/*` Worker route now catches
   traffic.

   **Rollback:** set the `gifs` record back to DNS-only. GitHub Pages is still
   serving (step 5b kept the existing deployment live and the post-merge check
   in step 6 confirmed it), so the old site is back within DNS propagation
   time.

9. **[Claude]** Verify the old domain:

   ```sh
   gh workflow run verify.yml \
     -f base=https://gifs.johnsey.cloud \
     -f expect_redirect_root=https://stash.johnsey.cloud/
   ```

   It worked if the run passes: every file URL returns identical bytes with no
   redirect, and `GET /` returns 301 to `https://stash.johnsey.cloud/`. If it
   fails, use the rollback in step 8.

10. **[Claude, with Michael's OK]** Retire GitHub Pages and clean up. The
    `repos/mjohnsey/gifs.johnsey.cloud` path is valid only before the rename, so
    delete Pages first:

    ```sh
    gh api -X DELETE repos/mjohnsey/gifs.johnsey.cloud/pages
    gh repo rename stash.johnsey.cloud
    ```

    Then open a cleanup PR that removes `gifs/` and `CNAME`. After it merges,
    `migrate.yml` can no longer re-seed production, since `gifs/` is gone; R2 is
    the source of truth from then on. Re-run
    `verify.yml` against both origins afterwards; nothing should change. Do this
    only after step 9 has passed, since disabling Pages removes the rollback.

11. **[Michael]** Bulk-add the 31 emoji from `~/Downloads/slackmojis/` through
    `https://stash.johnsey.cloud/admin`. Do NOT add the `cr-only/` subfolder. It
    worked if they appear on `/emoji`.
