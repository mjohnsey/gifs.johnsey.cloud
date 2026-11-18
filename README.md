# gifs.johnsey.cloud

My favorite gifs, each at a link that won't change:
`https://gifs.johnsey.cloud/gifs/<name>.gif`.

## Adding a gif

1. Put it in `gifs/` with a short kebab-case name, e.g. `gifs/this-is-fine.gif`.
2. Open a pull request. CI builds the site to check it.
3. Merge. The `Build and deploy` workflow publishes it to GitHub Pages.

To give a gif a second name, add a symlink: `ln -s ./bunk-smh.gif gifs/smh.gif`.
Aliases are published as their own URL and shown under the original on the page.

Don't rename or delete a gif that's already published. Other places link to it.

## How it works

`scripts/build.mjs` builds `dist/`. It needs Node 22+ and no dependencies.

- `gifs/` is copied as-is, with symlinks resolved, so every URL stays the same.
- `inventory.json` lists every gif as `{"gifs": {"name": "gifs/name.gif"}}`.
- `index.html` is rendered with every gif already in the page. `src/main.js` adds search, play on hover or tap, and copy-link.
- If `ffmpeg` is installed, each gif gets a small still poster in `posters/`, so the page doesn't download every gif up front.

Preview locally:

```sh
npm run preview   # builds, then serves dist/ at http://localhost:8000
```
