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

/* ---------------- Colour theme ----------------
   Two buttons in the nav switch the whole site between dark and red/yellow.
   The head script already applied the saved choice before first paint. */
const root = document.documentElement;
const themeButtons = [...document.querySelectorAll('[data-set-theme]')];
const showTheme = () => themeButtons.forEach(b =>
  b.setAttribute('aria-pressed', String(b.dataset.setTheme === root.dataset.theme)));
themeButtons.forEach(b => b.addEventListener('click', () => {
  root.dataset.theme = b.dataset.setTheme;
  try { localStorage.setItem('theme', b.dataset.setTheme); } catch (e) { /* private mode: this visit only */ }
  showTheme();
}));
showTheme();

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

/* ---------------- Case study carousel ----------------
   Four cards on a ring. data-pos is the card's place relative to the front
   one (-1 left, 0 front, 1 right, 2 behind); it advances on its own. */
const caseCards = [...document.querySelectorAll('.case-card')];
if (caseCards.length) {
  let active = 0;
  const n = caseCards.length;
  const place = () => caseCards.forEach((card, i) => {
    let d = (i - active + n) % n;
    if (d > n / 2) d -= n;
    card.dataset.pos = d;
    card.tabIndex = d === 0 ? 0 : -1;
  });
  const go = step => { active = (active + step + n) % n; place(); };
  document.querySelector('.cases-arrow.next').addEventListener('click', () => go(1));
  document.querySelector('.cases-arrow.prev').addEventListener('click', () => go(-1));
  /* a side card comes to the front instead of opening */
  caseCards.forEach(card => card.addEventListener('click', e => {
    const d = Number(card.dataset.pos);
    if (d !== 0) { e.preventDefault(); go(d); }
  }));
  place();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => go(1), 3500);
}

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

/* ---------------- Word-by-word reveal ----------------
   Like cred.club: copy starts dim and each word lights up as you scroll
   through it. Every word is wrapped in a span once; on scroll, each block
   lights a share of its words based on where it sits in the viewport. */
const REVEAL = '.sec-heading, .sec-intro, .about-statement, .about-para, .t-role, .t-desc, ' +
  '.panel-title, .panel-copy, .build-name, .build-desc, .build-sub, .testi-quote, .faq-a-inner p';

if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const blocks = [...document.querySelectorAll(REVEAL)].map(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(node => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const span = document.createElement('span');
        span.className = 'w';
        span.textContent = part;
        frag.appendChild(span);
      });
      node.replaceWith(frag);
    });
    el.classList.add('reveal-words');
    return { el, words: [...el.querySelectorAll('.w')], lit: -1 };
  });

  const update = () => {
    const vh = innerHeight;
    /* at the very bottom, the last blocks can't scroll any higher, so finish them */
    const atEnd = vh + scrollY >= document.documentElement.scrollHeight - 4;
    blocks.forEach(b => {
      const r = b.el.getBoundingClientRect();
      if (!r.height) return; /* inside a closed panel */
      /* 0 when the block's top reaches 85% of the screen, 1 once its bottom passes 55% */
      const start = vh * 0.85, end = vh * 0.55;
      const p = atEnd && r.top < vh ? 1 : Math.min(1, Math.max(0, (start - r.top) / (start - end + r.height)));
      const n = Math.round(p * b.words.length);
      if (n === b.lit) return;
      b.words.forEach((w, i) => w.classList.toggle('on', i < n));
      b.lit = n;
    });
  };
  let ticking = false;
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(() => { update(); ticking = false; }); }
  }, { passive: true });
  addEventListener('resize', update);
  /* opening a case panel or FAQ changes layout without scrolling */
  document.addEventListener('click', () => setTimeout(update, 500));
  update();
}
