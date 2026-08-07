# Metric Targets documentation site

Astro [Starlight](https://starlight.astro.build/) site for **Metric Targets** (npm package / format: `mtargets`).

Narrative content is authored in `../docs/guide/` and `../docs/reference/`, then synced here:

```bash
npm run docs:sync   # from repo root
npm run docs:dev
```

TypeDoc output is written to `public/api/` and served at `/api/`.

| Command (from repo root) | Action |
|--------------------------|--------|
| `npm run docs:dev` | Sync + API + `astro dev` |
| `npm run docs:build` | Production build → `website/dist/` |
| `npm run docs:preview` | Preview production build |
