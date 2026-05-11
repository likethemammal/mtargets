# Metric Targets documentation

Docs for **Metric Targets** (library) and the **mtargets** file format.

| Layer | Path | Role |
|-------|------|------|
| **Source markdown** | [`guide/`](guide/), [`reference/`](reference/) | Edit these; synced into Starlight |
| **Docs site** | [`../website/`](../website/) | Astro Starlight (guides + reference + splash) |
| **API** | TypeDoc → `website/public/api/` | Generated; do not hand-edit |

## Develop the site

```bash
# from repo root
npm run docs:sync      # copy guide/reference → website content
npm run docs:api       # TypeDoc → website/public/api
npm run docs:dev       # Starlight at http://localhost:4321
npm run docs:build     # sync + api + astro build
```

## Sidebar map

```text
Guides
  Product layers, Product schema (v0.2), Validate, Consumers, Integrations, Subjects, Metrics catalog
Reference
  Specification, Advanced, Schema
API
  TypeScript API (TypeDoc) → /api/
```

Changelog: [../CHANGELOG.md](../CHANGELOG.md)
