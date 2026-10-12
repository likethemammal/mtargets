# mtargets launch checklist

Public GitHub + optional npm release. Check boxes as you go.

**Snapshot (this machine, 2026-10-11)**

| Check | Result |
|-------|--------|
| GitHub SSH | OK as `likethemammal` (`ssh -T git@github.com`) |
| GitLab SSH | OK as `likethemammal` (current `origin`) |
| GitHub CLI (`gh`) | Not installed |
| Empty GitHub repo `likethemammal/mtargets` | Create before first push |
| npm login | Not logged in (`npm whoami` → ENEEDAUTH) |

**Canonical home (chosen):** `github.com/likethemammal/mtargets`  
(Personal account for now — transfer to a Tensegrity org later if you want.)

---

## 0. Decide (locked / remaining)

- [x] Owner: **`likethemammal`** (matches SSH on this machine) — skip org for now
- [ ] Visibility on first push: **public** now, or private then flip
- [ ] Ship **current `main` (1.11.0)** first (feat/v2 deferred)
- [ ] npm this week? Yes / No (GitHub-only is enough for Show HN + LinkedIn)

---

## 1. Machine setup

- [ ] Install GitHub CLI (optional): `winget install GitHub.cli`
- [ ] Authenticate if using `gh`: `gh auth login` (SSH preferred)
- [ ] Confirm: `gh auth status` → `likethemammal`
- [ ] npm login (only if publishing to registry): `npm login` then `npm whoami`
- [ ] Confirm Node ≥ 18: `node -v`

---

## 2. Repo hygiene (before first public push)

- [ ] `npm ci` && `npm ci --prefix website`
- [ ] `npm run build`
- [ ] `npm run test:all`
- [ ] `npm run docs:build` (or rely on `prepublishOnly` later)
- [ ] Scan for secrets / private URLs in README, examples, CI
- [ ] Confirm `LICENSE` copyright line is correct
- [ ] Decide version tag for first public release: `v1.11.0`

### Package / docs metadata (from CONTRIBUTING)

- [ ] Set `"private": false` in `package.json` (required for `npm publish`)
- [ ] Add `repository`, `homepage`, `bugs` in `package.json` → `https://github.com/likethemammal/mtargets`
- [ ] Starlight: confirm `site` / social links in `website/astro.config.mjs` (`site` already `https://mtargets.dev`)
- [ ] README install section matches reality (`npm i` vs `git`/`file:` until npm is live)
- [ ] Commit metadata changes on `main`

---

## 3. Create GitHub repository

**With `gh` (preferred once installed):**

```powershell
gh repo create likethemammal/mtargets --public `
  --description "Metric Targets — file format + TypeScript library/CLI for measurable quality targets" `
  --disable-wiki
```

- [ ] Run the create command (or use the UI below)
- [ ] Do **not** initialize with README/license on GitHub (history already exists)

**Without `gh`:**

- [ ] [github.com/new](https://github.com/new) → Owner `likethemammal` · Name `mtargets` · Public · **no** README / .gitignore / license → Create

---

## 4. Push history from this machine

Keep GitLab; add GitHub as a second remote.

```powershell
cd path\to\mtargets
git remote add github git@github.com:likethemammal/mtargets.git
git push -u github main
```

- [ ] Add remote: `git@github.com:likethemammal/mtargets.git`
- [ ] `git push -u github main`
- [ ] Do **not** push tags unless intentional (`v1.12.0` is GitLab-only / not on this main)
- [ ] Confirm commits at `https://github.com/likethemammal/mtargets`
- [ ] Repo → Settings → About: description, website (`https://mtargets.dev` and/or blog URL)
- [ ] Topics: `ai`, `devtools`, `metrics`, `quality`, `open-source`, `slo`, `lighthouse`
- [ ] Enable GitHub Actions (CI workflow already at `.github/workflows/ci.yml`)
- [ ] Confirm Actions run green on `main`
- [ ] Star the repo

---

## 5. GitHub Release

- [ ] Releases → Create release on `likethemammal/mtargets`
- [ ] Tag: `v1.11.0`
- [ ] Title: `mtargets v1.11.0`
- [ ] Body: paste CHANGELOG section for that version
- [ ] Publish release

---

## 6. npm publish (optional, after GitHub is live)

- [ ] `npm whoami` succeeds
- [ ] `"private": false` and version correct
- [ ] `package.json` `repository.url` → `https://github.com/likethemammal/mtargets.git`
- [ ] `npm run prepublishOnly` (build + test:all + docs:build)
- [ ] `npm publish --access public`
- [ ] Verify: `npm view mtargets version`
- [ ] Smoke: empty dir → `npm i mtargets` → `npx mtargets --help`

---

## 7. Docs site / domain

- [ ] Decide host for `mtargets.dev` (GitHub Pages / Netlify / Cloudflare / other)
- [ ] Deploy `website/dist` from `npm run docs:build`
- [ ] Confirm HTTPS + homepage links from README

---

## 8. Distribution / launch posts

Dependency order: **repo live → splash/docs → LinkedIn → blog**.

- [ ] Copy GitHub URL into blog draft / Self-Healing Software post
- [ ] LinkedIn Featured → add repo
- [ ] chrisdolphin.dev projects (if section exists)
- [ ] Content calendar: mark “mtargets README + push” done
- [ ] Projects Master List: Status / GitHub URL / Presentable
- [ ] Optional: Show HN (Tue/Wed morning PT)
- [ ] Optional: launch LinkedIn post linking repo + one-liner

---

## 9. Post-launch hygiene

- [ ] Update Notion publish checkboxes
- [ ] Keep GitLab as archive (do not force-push rewritten history there yet)
- [ ] Protect `main` if accepting outside contributors
- [ ] Later (optional): transfer repo to a Tensegrity org when you’re ready

---

## Quick path (minimum viable public launch)

1. [ ] Create empty public `likethemammal/mtargets` on GitHub  
2. [ ] `git remote add github git@github.com:likethemammal/mtargets.git`  
3. [ ] `git push -u github main`  
4. [ ] About + topics + Release `v1.11.0`  
5. [ ] npm / docs domain / LinkedIn later  

This machine **can** do steps 2–3 over SSH once the empty repo exists.
