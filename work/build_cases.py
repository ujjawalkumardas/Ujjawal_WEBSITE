# Builds work/<slug>.html for each case study from the matching panel in index.html,
# so the figures and clips on a case page always match the home page.
# Run from the site root:  python3 work/build_cases.py
import re

CASES = {
    'capmint': {'n': 1, 'name': 'CapMint',
                'desc': "How one hook-first content system drove 1.9M views in 28 days and a 12.4% average CTR across CapMint's two YouTube channels.",
                'edits': 'Straight from the CapMint timeline.',
                'edits_intro': "Maps, archive footage, kinetic type and product graphics cut for CapMint's long-form explainers."},
    'clips-agency': {'n': 2, 'name': 'The Clips Agency',
                     'desc': 'A year of vertical content and podcast trailers for dentists, real estate agents, founders and personal brands, packaged to bring in leads.',
                     'edits': 'Straight from the Clips Agency timeline.',
                     'edits_intro': 'Podcast trailers cut for clients on the Dubai agency roster.'},
    'yaas-media': {'n': 3, 'name': 'YaaS.Media',
                   'desc': "Long and short form for Zoho Builders Central, Zerodha Rainmatter, Livspace and Farah Khan's home tour, held together by structure.",
                   'edits': 'Straight from the YaaS.Media timeline.',
                   'edits_intro': 'Sequences from the brands and channels I cut for at YouTube as a Service.'},
}

h = open('index.html').read()
head = h[:h.index('</head>')]
version = re.search(r'styles\.css\?v=(\d+)', head).group(1)
head = head.replace('href="styles.css', 'href="../styles.css')
header_src = h[h.index('<header class="site-nav">'):h.index('</header>') + 9]
f0 = h.index('<footer class="site-footer">')
footer_src = h[f0:h.index('</footer>', f0) + 9]


def relink(html, prefix):
    """Point in-page anchors and the portfolio page at the right place from a subfolder or sibling page."""
    html = re.sub(r'href="#(\w*)"', rf'href="{prefix}#\1"', html)
    return html.replace('href="portfolio.html"', f'href="{prefix}portfolio.html"' if prefix.startswith('..') else 'href="portfolio.html"')


header = relink(header_src, '../')
footer = relink(footer_src, '../')

BACK = '<a class="btn-red" href="../#work">← All case studies</a>'

for slug, c in CASES.items():
    a = h.index(f'id="panel-{c["n"]}"')
    panel = h[a:h.index('</article>', a)]
    label = re.search(r'<p class="panel-label">.*?</p>', panel, re.S).group(0)
    title = re.search(r'<h3 class="panel-title">(.*?)</h3>', panel, re.S).group(1)
    body = re.search(r'<div class="panel-body">.*?</div>\s*</div>\s*</div>', panel, re.S).group(0)
    clips = re.findall(r'<div class="longform-wrap"><video data-src="([^"]+)"[^>]*aria-label="([^"]*)"', panel)
    grid = '\n'.join(
        f'        <figure class="clip"><div class="longform-wrap"><video data-src="../{s}" muted loop playsinline preload="none" aria-label="{t}"></video></div><figcaption>{t}</figcaption></figure>'
        for s, t in clips)

    page_head = re.sub(r'<title>.*?</title>', f'<title>{c["name"]} case study | Ujjawal Kumar Das</title>', head)
    page_head = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{c["desc"]}">', page_head)

    page = f'''{page_head}</head>
<body>

{header}

<main>
  <section class="sec case-page">
    <div class="case-nav">{BACK}</div>
    {label}
    <h1 class="panel-title">{title}</h1>
    {body}
  </section>

  <section class="sec" aria-labelledby="edits-heading">
    <p class="sec-eyebrow"><span class="dot"></span>The edits</p>
    <h2 class="sec-heading" id="edits-heading">{c["edits"]}</h2>
    <p class="sec-intro">{c["edits_intro"]}</p>
    <div class="clip-grid">
{grid}
    </div>
    <div class="case-nav case-nav--end">{BACK}</div>
  </section>
</main>

{footer}

<script src="../script.js?v={version}"></script>
</body>
</html>
'''
    open(f'work/{slug}.html', 'w').write(page)
    print(slug, len(clips), 'clips')


# ---------------- Portfolio page (portfolio.html) ----------------
# Every clip on the site in one place: the short-form strip, then each company's
# long-form clips. Like the case pages, it is read straight from index.html.
COMPANIES = [(c['n'], c['name']) for c in CASES.values()]

p0 = h.index('id="portfolio"')
strip = h[p0:h.index('</section>', p0)]
short = re.findall(r'<div class="video-wrap"><video data-src="([^"]+)"[^>]*aria-label="([^"]*)"', strip)


def card(src, title, tag, shape):
    return (f'        <figure class="clip"><div class="{shape}"><video data-src="{src}" muted loop playsinline preload="none" aria-label="{title}"></video></div>'
            f'<figcaption><span class="clip-tag">{tag}</span>{title}</figcaption></figure>')


short_cards = '\n'.join(card(s, t, 'The Clips Agency' if 'clips-v' in s else 'Short-form', 'video-wrap') for s, t in short)

long_groups, long_total = [], 0
for n, name in COMPANIES:
    a = h.index(f'id="panel-{n}"')
    clips = re.findall(r'<div class="longform-wrap"><video data-src="([^"]+)"[^>]*aria-label="([^"]*)"', h[a:h.index('</article>', a)])
    long_total += len(clips)
    long_groups.append(f'''    <h3 class="group-head">{name} <span>{len(clips)}</span></h3>
    <div class="clip-grid">
{chr(10).join(card(s, t, name, 'longform-wrap') for s, t in clips)}
    </div>''')

page_head = re.sub(r'<title>.*?</title>', '<title>Portfolio | Ujjawal Kumar Das</title>', h[:h.index('</head>')])
page_head = re.sub(r'<meta name="description" content="[^"]*">',
                   '<meta name="description" content="Every edit in one place: short-form reels and long-form sequences for CapMint, The Clips Agency and YaaS.Media.">', page_head)
root_header = relink(header_src, './').replace('href="portfolio.html">Portfolio', 'href="portfolio.html" aria-current="page">Portfolio')
root_footer = relink(footer_src, './')

page = f'''{page_head}</head>
<body>

{root_header}

<main>
  <section class="sec case-page" aria-labelledby="portfolio-heading">
    <p class="sec-eyebrow"><span class="dot"></span>Portfolio</p>
    <h1 class="sec-heading" id="portfolio-heading">Every cut, in one place.</h1>
    <p class="sec-intro">Short-form reels and long-form sequences from CapMint, The Clips Agency and YaaS.Media. Each one loops silently; scroll to play.</p>

    <div class="filter-tabs" role="group" aria-label="Filter the work">
      <button type="button" data-filter="all" aria-pressed="true">All <span>{len(short) + long_total}</span></button>
      <button type="button" data-filter="short" aria-pressed="false">Short-form <span>{len(short)}</span></button>
      <button type="button" data-filter="long" aria-pressed="false">Long-form <span>{long_total}</span></button>
    </div>

    <div class="clip-group" data-group="short">
    <h2 class="group-head">Short-form <span>{len(short)}</span></h2>
    <div class="clip-grid clip-grid--vertical">
{short_cards}
    </div>
    </div>

    <div class="clip-group" data-group="long">
    <h2 class="group-head">Long-form <span>{long_total}</span></h2>
{chr(10).join(long_groups)}
    </div>
  </section>
</main>

{root_footer}

<script src="script.js?v={version}"></script>
</body>
</html>
'''
open('portfolio.html', 'w').write(page)
print('portfolio', len(short), 'short +', long_total, 'long')
