const RESUME_URL = 'resume.pdf'; // drop resume.pdf in this folder, or point this at a URL

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

const toast = document.getElementById('toast');
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2000);
}

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

document.getElementById('resumeBtn').addEventListener('click', async () => {
  /* Only navigate if the file is actually there — otherwise say so instead of 404ing */
  try {
    const res = await fetch(RESUME_URL, { method: 'HEAD' });
    if (!res.ok) throw new Error('missing');
    window.open(RESUME_URL, '_blank');
  } catch {
    showToast('Resume not added yet');
  }
});
