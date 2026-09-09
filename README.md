# Ujjawal Kumar Das — Portfolio

Personal site for Ujjawal Kumar Das, content strategist and social media growth
specialist. Static HTML, CSS and vanilla JavaScript — no build step, no
dependencies to install.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole page: nav, hero, portfolio, case studies, experience, about, now building, testimonials, FAQ, footer. |
| `styles.css` | All styling. Colours, surfaces and spacing are CSS custom properties defined once per theme at the top of the file. |
| `script.js` | Theme toggle, the case-study and FAQ accordions, and the scrollbar-width sync that keeps the nav aligned with the content. |

Fonts (Space Grotesk, Source Sans 3, Playfair Display) load from Google Fonts at
runtime, so the site needs a network connection to render with its intended type.

## Running it locally

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Deploying to GitHub Pages

1. Create a new repository on GitHub and upload these files to the repository
   root (not inside a subfolder — GitHub Pages looks for `index.html` at the top
   level of the chosen source).
2. In the repository, go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**, pick the `main` branch and
   the `/ (root)` folder, then **Save**.
4. The site publishes at `https://<username>.github.io/<repository>/` within a
   minute or two.

## Editing notes

- **Themes.** Light and dark are two blocks of custom properties near the top of
  `styles.css` (`:root, [data-theme="dark"]` and `[data-theme="light"]`). Change
  a colour there and it updates everywhere it is used. The visitor's choice is
  saved to `localStorage`; anyone who has not chosen follows their OS setting.
- **Display font.** The hero headline and every section heading share the
  `--font-display` custom property, so swapping the display face is a one-line
  change.
- **Page width.** `--container` sets the content column width and `--gutter` the
  side padding. The nav, sections and footer all read from them, so they stay on
  one rhythm.
- **Booking links.** The "Book a call" button, the nav "Book a call" link and the
  hero's "Short intro call" all point at the same Calendly URL.
