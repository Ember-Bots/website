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

## Presentation standard
For any shareable HTML deck, one-pager, proposal, or contract packet:
- publish through GitHub Pages first
- verify the live URL before handoff
- run Gemini Pro design review against the published artifact when available
- generate DOCX/PDF only from the final reviewed HTML

See `docs/shareable-presentations.md` for the full workflow.

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
- `amber.jpg`, `logo.svg`, `favicon.svg` — current site assets
- `logo.png` — deprecated old logo; use `logo.svg` for new materials
- `docs/shareable-presentations.md` — standard workflow for published HTML presentations, review passes, and exports
- `docs/workflow-systems-brief.md` — older messaging/reference material
- `CONTEXT.md` — repo-specific handoff and operating context

## Current positioning notes
The homepage is currently positioned around Ember Bots as an AI orchestration partner for service businesses:
- choose and coordinate the right mix of AI agents, platform tools, CRM/workflow automation, command centers, and human approval gates
- treat tools like Gemini Spark as part of the toolbox when they fit, not as competitors to fight or as the whole product
- keep missed revenue, lead recovery, follow-up, scheduling, customer communication, onboarding, and routine admin as the practical front-door workflows
- lead with managed outcomes and visible command centers, not generic “AI assistant” claims

Avoid drifting into quote, invoice, billing, or payment positioning on the main Ember Bots site unless Evan explicitly changes direction, to avoid overlap with Rev.io.

## Current design direction
The live design uses an "ember forge" palette:
- obsidian / plum backgrounds
- ember red, orange, solar gold, and purple accents
- premium, restrained glow and gradient treatment
- hard rule: the main hero headline must stay exactly:
  - `Your business deserves intelligent automation.`
- Do not change that hero headline unless Evan explicitly asks to change the main hero wording.
- current hero eyebrow:
  - `AI ORCHESTRATION FOR SERVICE BUSINESSES`
