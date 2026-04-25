# Ember Bots Website

Static marketing site for **https://emberbots.ai**.

## Stack
- Pure HTML/CSS/JS
- Single-page site in `index.html`
- GitHub Pages deployment from `main`
- No build step

## Local preview
Run a simple static server from the repo root:

```bash
python3 -m http.server 4173
```

Then open:

```bash
http://127.0.0.1:4173/index.html
```

## Deploy
GitHub Pages auto-deploys from `main`.

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

The live site usually updates within about 1 minute.

## Live verification
Quick check for key homepage changes:

```bash
curl -L -A 'Mozilla/5.0' -s https://emberbots.ai | grep -n "Your business deserves\|Lead Response Automation\|Executive Daily Briefing"
```

## Rollback
If a design/content change needs to be reverted fast:

```bash
git log --oneline -10
git revert <commit>
git push origin main
```

Prefer reverting the specific bad commit instead of force-pushing history.

## Important files
- `index.html` — main site markup, styling, and client-side behavior
- `CNAME` — custom domain binding for GitHub Pages
- `amber.jpg`, `steve.jpg`, `logo.svg`, `favicon.svg` — current site assets
- `logo.png` — deprecated old logo; use `logo.svg` for new materials
- `docs/workflow-systems-brief.md` — older messaging/reference material
- `CONTEXT.md` — repo-specific handoff and operating context

## Current positioning notes
The homepage is currently positioned around non-conflicting Ember Bots automation offers:
- Lead Response Automation
- Customer Message Routing
- Scheduling and Reminder Automation
- Client Onboarding Automation
- Internal Task Orchestration
- Follow-Up Automation
- Back Office Admin Automation
- Executive Daily Briefing

Avoid drifting into quote, invoice, billing, or payment positioning on the main Ember Bots site unless Evan explicitly changes direction, to avoid overlap with Rev.io.

## Current design direction
The live design uses an "ember forge" palette:
- obsidian / plum backgrounds
- ember red, orange, solar gold, and purple accents
- premium, restrained glow and gradient treatment
- hero wording preserved as:
  - `AI AUTOMATION FOR SMALL BUSINESS`
  - `Your business deserves intelligent automation.`
