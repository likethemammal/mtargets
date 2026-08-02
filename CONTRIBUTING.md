# Contributing

## Develop

```bash
npm install
npm ci --prefix website
npm run build
npm test
npm run validate:examples
npm run docs:dev
```

## Docs

- Author guides in `docs/guide/` and format docs in `docs/reference/`
- Starlight site: `website/` (synced via `npm run docs:sync`)
- TypeDoc API: `npm run docs:api` → `website/public/api/` (served at `/api/`)
- Do not hand-edit synced `website/src/content/docs/guides|reference` or `website/public/api`

## Release checklist (when going public)

Full launch checklist with checkboxes: [LAUNCH.md](./LAUNCH.md).

1. Set `"private": false` in `package.json`
2. Add `repository` / `homepage` / `bugs` pointing at the GitHub remote
3. Set Starlight `site` / social links in `website/astro.config.mjs`
4. Confirm LICENSE copyright holder
5. `npm run prepublishOnly` then `npm publish` (or GitHub Packages)
6. Flip the GitHub repo from private → public when ready
