# __NAME__

A __KIND__ site for the __BRAND__ brand, made with `artbucket site new`. It is plain HTML and one build
script with no dependencies but the Artbucket CLI: change anything, or move it to the framework you
like. These files are yours, under the MIT License: keep its notice (LICENSE) and do as you wish.

## Build and deploy

```bash
npm install
npx artbucket login __SERVER__   # once: signs you in through the browser
npm run deploy                   # builds, checks every file against the library, and puts it live
```

`npm run deploy` goes live at the site `__SITE__`. Make it first in Artbucket (Sites, New site, a built
site with that address) or with `npx artbucket site new --create`.

- `npm run brand` exports the release of __BRAND__ that readers see into `.brand/`: its rules,
  `tokens.css` and the files they point at. The build reads only that, so it runs offline after.
- `npm run build` writes `dist/`. `npm run check` asks Artbucket whether everything the build uses may
  be shown (a logo replaced since, a photo whose license ended), without deploying.

## Pages

Each page is an HTML file in `src/pages`, wrapped in `src/layout.html`; its first heading is its
title in the menu. Double braces bring in the brand, as `build.mjs` explains at its top:
`{{text:brand.headline}}`, `{{logo}}`, `{{palette}}`, `{{type}}`, `{{logos}}`. The colors and
faces come from the brand too (`look.css`, and every rule as a custom property in `tokens.css`).

## When the brand changes

Release it in Artbucket, then build again: `npm run deploy`. To have that happen on its own, deploy
from CI with a read key (`ARTBUCKET_URL` and `ARTBUCKET_KEY`), and give the site that CI's deploy
hook in Artbucket (the site's panel, Rebuild on release): each release then calls it.
