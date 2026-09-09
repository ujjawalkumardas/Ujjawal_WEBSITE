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
  themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  themeBtn.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

applyTheme(root.getAttribute('data-theme') || 'dark');

themeBtn.addEventListener('click', () => {
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
