const shelf = document.getElementById('shelf');
const tiles = [...shelf.querySelectorAll('.tile')];
const q = document.getElementById('q');
const status = document.getElementById('status');
const empty = document.getElementById('empty');
const toast = document.getElementById('toast');
const defaultStatus = status.textContent;

const canHover = matchMedia('(hover: hover) and (pointer: fine)');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// --- play / pause ---------------------------------------------------------

const setPlaying = (screen, on) => {
  const { still, gif } = screen.dataset;
  if (still === gif) return; // no poster: the img already is the gif
  screen.querySelector('img').src = on ? gif : still;
  screen.setAttribute('aria-pressed', String(on));
  screen.setAttribute('aria-label', `${on ? 'Stop' : 'Play'} ${screen.closest('.tile').querySelector('.name').textContent}`);
};

shelf.addEventListener('click', (e) => {
  const screen = e.target.closest('.screen');
  if (screen) setPlaying(screen, screen.getAttribute('aria-pressed') !== 'true');
});

shelf.addEventListener('pointerover', (e) => {
  const screen = e.target.closest('.screen');
  if (screen && canHover.matches && !reduceMotion.matches && !screen.contains(e.relatedTarget)) setPlaying(screen, true);
});
shelf.addEventListener('pointerout', (e) => {
  const screen = e.target.closest('.screen');
  if (screen && canHover.matches && !reduceMotion.matches && !screen.contains(e.relatedTarget)) setPlaying(screen, false);
});

// --- copy link -------------------------------------------------------------

let toastTimer;
const say = (msg) => {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
};

const copyLink = async (button) => {
  const url = new URL(button.dataset.href, location.href).href;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    say(`Couldn't reach the clipboard. The link is ${url}`);
    return;
  }
  button.textContent = 'Copied';
  button.classList.add('copied');
  setTimeout(() => {
    button.textContent = 'Copy link';
    button.classList.remove('copied');
  }, 1600);
  say(`Copied link to ${button.dataset.name}`);
};

shelf.addEventListener('click', (e) => {
  const button = e.target.closest('.copy');
  if (button) copyLink(button);
});

// --- search ------------------------------------------------------------------

const filter = () => {
  const terms = q.value.toLowerCase().split(/[\s-]+/).filter(Boolean);
  let shown = 0;
  for (const tile of tiles) {
    const match = terms.every((t) => tile.dataset.search.includes(t));
    tile.hidden = !match;
    if (match) shown++;
  }
  empty.hidden = shown > 0;
  if (!shown) empty.textContent = `No gifs match “${q.value.trim()}”. Try a shorter word.`;
  status.textContent = terms.length ? `${shown} of ${tiles.length} gifs match.` : defaultStatus;
};

q.addEventListener('input', filter);
q.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = tiles.find((t) => !t.hidden);
    if (first) copyLink(first.querySelector('.copy'));
  } else if (e.key === 'Escape') {
    q.value = '';
    filter();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== q && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    q.focus();
  }
});

// Support ?q=… links, and keep search state when navigating back.
const initial = new URLSearchParams(location.search).get('q');
if (initial) q.value = initial;
if (q.value) filter();
