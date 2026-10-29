/* The nav is fixed (viewport-width) while the content is inset by the scrollbar.
   Publishing the scrollbar width lets the CSS keep both on the same centre line. */
function syncScrollbarWidth() {
  const sbw = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--sbw', sbw + 'px');
}
syncScrollbarWidth();
window.addEventListener('resize', syncScrollbarWidth);
window.addEventListener('load', syncScrollbarWidth);
/* Fonts and late layout can introduce the scrollbar after first paint */
new ResizeObserver(syncScrollbarWidth).observe(document.body);

/* ---------------- Theme toggle ----------------
   The head script has already set data-theme before first paint; this only
   handles switching and persistence. A visitor who has never chosen keeps
   following their OS setting. */
const themeBtn = document.getElementById('themeBtn');
const root = document.documentElement;

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
  if (!themeBtn) return;
  themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  themeBtn.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

/* The site now has one palette, so the toggle may be absent */
if (themeBtn) applyTheme(root.getAttribute('data-theme') || 'dark');

if (themeBtn) themeBtn.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch (e) { /* private mode — session only */ }
});

/* Follow the OS until the visitor picks a side themselves */
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
  let chosen = null;
  try { chosen = localStorage.getItem('theme'); } catch (err) { /* ignore */ }
  if (!chosen) applyTheme(e.matches ? 'light' : 'dark');
});

/* ---------------- Case study accordion ---------------- */
const caseItems = [...document.querySelectorAll('.case-item')];

caseItems.forEach(item => {
  const row = item.querySelector('.case-row');
  row.addEventListener('click', () => {
    const willOpen = !item.classList.contains('is-open');

    /* One panel at a time — matches the reference behaviour */
    caseItems.forEach(other => {
      other.classList.remove('is-open');
      other.querySelector('.case-row').setAttribute('aria-expanded', 'false');
    });

    if (willOpen) {
      item.classList.add('is-open');
      row.setAttribute('aria-expanded', 'true');
    }
  });
});

/* ---------------- FAQ accordion ---------------- */
const faqItems = [...document.querySelectorAll('.faq-item')];

faqItems.forEach(item => {
  const q = item.querySelector('.faq-q');
  q.addEventListener('click', () => {
    const willOpen = !item.classList.contains('open');
    faqItems.forEach(other => {
      other.classList.remove('open');
      other.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
    });
    if (willOpen) {
      item.classList.add('open');
      q.setAttribute('aria-expanded', 'true');
    }
  });
});

/* ---------------- Mascot ----------------
   The eyes glance toward the cursor, and it blinks every few seconds. */
const mascot = document.querySelector('.mascot');
const mascotEyes = mascot && mascot.querySelector('.eyes');
const EYE_TRAVEL = 9; /* in SVG units */

if (mascot) addEventListener('pointermove', e => {
  const r = mascot.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height * 0.53);
  const d = Math.hypot(dx, dy) || 1;
  const pull = Math.min(1, d / 300); /* closer cursor, smaller glance */
  mascotEyes.style.transform = `translate(${dx / d * EYE_TRAVEL * pull}px, ${dy / d * EYE_TRAVEL * pull}px)`;
});

if (mascot && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  (function blink() {
    setTimeout(() => {
      mascot.classList.add('blink');
      setTimeout(() => { mascot.classList.remove('blink'); blink(); }, 140);
    }, 2500 + Math.random() * 3000);
  })();
}

/* ---------------- Portfolio filters ----------------
   All / Short-form / Long-form: show the matching group, hide the other. */
const filterBtns = [...document.querySelectorAll('[data-filter]')];
filterBtns.forEach(btn => btn.addEventListener('click', () => {
  filterBtns.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  document.querySelectorAll('[data-group]').forEach(g => {
    g.hidden = btn.dataset.filter !== 'all' && g.dataset.group !== btn.dataset.filter;
  });
}));

/* ---------------- Moving strips ----------------
   Duplicate the cards once so translateX(-50%) loops seamlessly, and keep the
   speed the same however many cards a strip holds. */
const MARQUEE_PX_PER_SEC = 40;
document.querySelectorAll('.marquee-track').forEach(track => {
  [...track.children].forEach(card => {
    const copy = card.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    track.appendChild(copy);
  });
  const setDuration = () => {
    const w = track.scrollWidth / 2;
    if (w) track.style.setProperty('--marquee-dur', `${w / MARQUEE_PX_PER_SEC}s`);
  };
  setDuration();
  /* panels open later, and widths change with the viewport */
  new ResizeObserver(setDuration).observe(track);
});

/* ---------------- Portfolio clips ----------------
   Each clip loads and plays only while it is on screen, so 34 videos never
   download at once. Reduced-motion visitors get controls instead of autoplay. */
const clipObserver = new IntersectionObserver(entries => {
  entries.forEach(({ target: v, isIntersecting }) => {
    if (!isIntersecting) { v.pause(); return; }
    if (!v.src) v.src = v.dataset.src;
    v.play().catch(() => {});
  });
}, { rootMargin: '200px 0px' });

document.querySelectorAll('video[data-src]').forEach(v => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    v.src = v.dataset.src; v.preload = 'metadata'; v.controls = true;
  } else {
    clipObserver.observe(v);
  }
});
