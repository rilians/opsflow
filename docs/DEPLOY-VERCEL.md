# Deploying OpsFlow to Vercel

OpsFlow is a static single-page app (Vite + React). There is no server, no database and no API
key: every BOT runs in the browser against a seeded workspace kept in `localStorage`. That makes
it a natural fit for Vercel's static hosting, with one caveat that must not be skipped — the
rewrite rule in `vercel.json`.

## Why the rewrite matters

The app uses client-side routing with nine top-level routes plus query-string deep links:

```
/dashboard  /tasks  /automation  /workflows  /sla  /analytics  /reports  /notifications  /settings
/tasks?task=tsk-0095      /automation?tab=executions&exec=Failed
/workflows?id=wf-1        /settings?tab=data
```

Only `/index.html` exists on disk. Without a rewrite, Vercel returns 404 for a direct visit or a
refresh on `/tasks?task=tsk-0095`, because the browser asks the host for a file that is not there.
`vercel.json` already contains the fix:

```json
"rewrites": [
  { "source": "/((?!assets/|favicon\\.svg|icons\\.svg).*)", "destination": "/index.html" }
]
```

The negative lookahead keeps `/assets/*` (hashed JS, CSS and the Inter woff2 files) out of the
rewrite so they are served as files. Verified against the production build: all 13 route/query
combinations return 200 and a hard refresh on `/tasks?task=…` reopens the drawer.

## Deploy

```bash
# from the project root
npx vercel            # preview deployment
npx vercel --prod     # production
```

Vercel detects Vite automatically. The settings in `vercel.json` are:

| Setting | Value | Why |
| --- | --- | --- |
| Framework | `vite` | preset |
| Build command | `tsc -b && vite build` | the same command as `npm run build`, so a type error fails the deploy |
| Output directory | `dist` | Vite default |
| Install command | `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci` | see below |

Nothing else is required — no environment variables.

## The one non-obvious build setting

`playwright` is a devDependency because the verification scripts in `scripts/` drive a real
browser. On a Linux builder its postinstall step downloads roughly 400 MB of browser binaries that
the build never uses. `.npmrc` and the `installCommand` both set
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so the install stays small and fast.

If you would rather keep `package.json` untouched and not rely on `.npmrc`, set it in the Vercel
dashboard instead: **Settings → Environment Variables →** `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` =
`1` for all environments.

## Via Git (recommended for a real deployment)

1. Push the project to GitHub.
2. Vercel → **Add New → Project** → import the repository.
3. Framework preset: **Vite**. Build command and output directory come from `vercel.json`.
4. Deploy. Every later push to `main` redeploys, and pull requests get preview URLs.

## What works and what does not after deploying

Works unchanged:

- All nine routes and every deep link, including the ones with query parameters.
- The full demo: BOT execution, the guided scenario, filters, exports, the report generator.
- Seeded data: the workspace is created on first load and persisted in the visitor's browser.

Worth knowing before you share the link:

1. **State is per-browser, not shared.** Two visitors see two independent workspaces. That is
   correct for a demo and wrong for anything collaborative — a multi-user pilot needs a backend.
2. **`localStorage` is origin-bound.** Moving from `*.vercel.app` to a custom domain gives
   returning visitors a fresh seeded workspace, because the old origin's storage is not visible.
3. **Reset is per-browser.** Settings → Data → reset restores the seed for that browser only.
4. **The business-case documents are not served.** `docs/` is outside `public/`, so
   `OpsFlow-Business-Case.docx` and the HTML report are not reachable on the deployed URL. If they
   need to be public, copy them into `public/` (they are ~1.4 MB together) or host them
   separately — do not publish the `.docx` unless you intend it to be downloadable.
5. **Bundle size.** The JS bundle is ~1.1 MB (≈300 KB gzipped) because recharts is bundled
   eagerly. Fine for a demo; if it matters, lazy-load the chart-heavy routes with
   `React.lazy` and the marketing-page load drops sharply.

## Verify before and after

Locally, against the production build (not the dev server):

```bash
npm run build
npx vite preview --port 4173
node scripts/prod-check.cjs        # 9 routes + hard refresh on a ?task= deep link
```

After deploying, open the deployment URL and check the same way: visit `/tasks?task=tsk-0095`
directly and press refresh. If you see the app with the drawer open, routing is correct. If you see
a Vercel 404, the rewrite rule did not make it into the deployment.
