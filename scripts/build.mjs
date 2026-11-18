// Builds the static site into dist/.
//
// Every gif keeps its URL: gifs/<name>.gif. Symlinks in gifs/ become aliases,
// published as real copies of the gif they point at. inventory.json keeps its
// original shape ({"gifs": {name: path}}) because other things may read it.
//
// If ffmpeg is on PATH, each gif also gets a small still poster so the page
// doesn't load every gif up front. Without ffmpeg the page falls back to
// lazy-loading the gifs themselves.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const GIFS = path.join(ROOT, 'gifs');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// GIF logical screen size lives in bytes 6–9, little-endian.
const gifSize = (file) => {
  const buf = Buffer.alloc(10);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, buf, 0, 10, 0);
  fs.closeSync(fd);
  if (!buf.subarray(0, 3).equals(Buffer.from('GIF'))) throw new Error(`${file} is not a GIF`);
  return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
};

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

const makePoster = (src, dest) => {
  const res = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-y', '-i', src, '-frames:v', '1', '-vf', 'scale=480:-2:flags=lanczos', '-q:v', '4', dest],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (res.status !== 0) throw new Error(`ffmpeg failed on ${src}: ${res.stderr}`);
};

// --- collect gifs ---------------------------------------------------------

const entries = fs
  .readdirSync(GIFS, { withFileTypes: true })
  .filter((d) => d.name.toLowerCase().endsWith('.gif'))
  .map((d) => {
    const file = path.join(GIFS, d.name);
    const name = path.basename(d.name, path.extname(d.name));
    const isAlias = fs.lstatSync(file).isSymbolicLink();
    const real = fs.realpathSync(file);
    if (path.dirname(real) !== fs.realpathSync(GIFS)) throw new Error(`${d.name} links outside gifs/`);
    return { name, file: d.name, isAlias, target: path.basename(real, path.extname(real)) };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const gifs = entries
  .filter((e) => !e.isAlias)
  .map((e) => ({
    ...e,
    ...gifSize(path.join(GIFS, e.file)),
    aliases: entries.filter((a) => a.isAlias && a.target === e.name).map((a) => a.name),
  }));

// --- write dist -----------------------------------------------------------

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'gifs'), { recursive: true });
if (hasFfmpeg) fs.mkdirSync(path.join(OUT, 'posters'));
else console.warn('ffmpeg not found: skipping posters, the page will load full gifs lazily');

for (const e of entries) fs.copyFileSync(fs.realpathSync(path.join(GIFS, e.file)), path.join(OUT, 'gifs', e.file));
if (hasFfmpeg) for (const g of gifs) makePoster(path.join(GIFS, g.file), path.join(OUT, 'posters', `${g.name}.jpg`));

const inventory = { gifs: Object.fromEntries(entries.map((e) => [e.name, `gifs/${e.file}`])) };
fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');

const tile = (g) => {
  const gifUrl = `gifs/${g.file}`;
  const still = hasFfmpeg ? `posters/${g.name}.jpg` : gifUrl;
  const search = [g.name, ...g.aliases].join(' ');
  const aka = g.aliases.length
    ? `<span class="aka">also ${g.aliases.map((a) => `<a href="gifs/${escapeHtml(a)}.gif">${escapeHtml(a)}</a>`).join(', ')}</span>`
    : '';
  return `
      <li class="tile" data-search="${escapeHtml(search)}">
        <button class="screen" type="button" aria-pressed="false" aria-label="Play ${escapeHtml(g.name)}" data-still="${escapeHtml(still)}" data-gif="${escapeHtml(gifUrl)}">
          <img src="${escapeHtml(still)}" width="${g.width}" height="${g.height}" loading="lazy" decoding="async" alt="">
        </button>
        <div class="caption">
          <a class="name" href="${escapeHtml(gifUrl)}">${escapeHtml(g.name)}</a>
          <button class="copy" type="button" data-href="${escapeHtml(gifUrl)}" data-name="${escapeHtml(g.name)}">Copy link</button>
          ${aka}
        </div>
      </li>`;
};

const html = fs
  .readFileSync(path.join(SRC, 'index.html'), 'utf8')
  .replace('{{COUNT}}', String(gifs.length))
  .replace('<!-- TILES -->', gifs.map(tile).join(''));
fs.writeFileSync(path.join(OUT, 'index.html'), html);

for (const f of ['main.css', 'main.js']) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
fs.copyFileSync(path.join(ROOT, 'CNAME'), path.join(OUT, 'CNAME'));

console.log(`Built ${gifs.length} gifs (+${entries.length - gifs.length} aliases) into dist/${hasFfmpeg ? ', with posters' : ''}`);
