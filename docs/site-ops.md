# Ember Bots Website Ops

## Hosting
- Live URL: https://emberbots.ai
- Hosting: GitHub Pages
- Deploy branch: `main`
- Repo: `https://github.com/Ember-Bots/website`

## Safe update workflow
1. Edit `index.html`
2. Preview locally with a static server
3. Commit the change in an isolated commit when possible
4. Push `main`
5. Verify the live site after GitHub Pages rebuilds

## Local preview
```bash
python3 -m http.server 4173
# open http://127.0.0.1:4173/index.html
```

## Live verification examples
```bash
curl -L -A 'Mozilla/5.0' -s https://emberbots.ai | grep -n "Your business deserves\|Lead Response Automation\|Executive Daily Briefing"
```

For CSS verification, downloading the page to a temp file and checking exact strings is more reliable than complex grep patterns.

## Rollback workflow
Prefer `git revert` over force-push.

```bash
git log --oneline -10
git revert <commit>
git push origin main
```

## Recent high-value website commits from 2026-04-16
- `7d6a61a9` — Refocus website offers away from Rev.io overlap
- `cb0c5519` — Polish website automation positioning copy
- `e9bbc1f8` — Restore approved website hero wording
- `ea836646` — Remove website card new badges
- `e4841e2d` — Refine website process flow styling
- `6a6feef2` — Replace website flow step numbers with icons
- `6d0cf90f` — Refine website palette with ember forge accents
- `4ea25d9a` — Match contact CTA to primary gradient button

## Current brand/design constraints
- Keep the hero wording exactly:
  - `AI AUTOMATION FOR SMALL BUSINESS`
  - `Your business deserves intelligent automation.`
- Keep Ember Bots positioning away from quote/invoice/billing/payment language unless Evan explicitly changes direction.
- Favor a premium, controlled, technical-fire look over playful or emoji-like treatments.
- Use reds, oranges, golds, and purples as restrained accent energy, not loud full-bleed fills.
