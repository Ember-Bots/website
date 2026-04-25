# Ember Bots — Agent Context & Handoff Document

_Last updated: 2026-04-03_

---

## Company

**Name:** Ember Bots LLC
**Status:** LLC formation pending — not yet filed as of 2026-04-03
**State:** Texas
**Structure:** Member-managed LLC
**Filing method:** SOSDirect (online) or Form 205 by mail ($300 TX fee)
**Filing to-do:** Evan Rice to file via SOSDirect next week. Account creation pending.

### Members / Founders
| Name | Role | Ownership |
|------|------|-----------|
| Amber Rice | CEO & Co-Founder | Majority (exact % TBD in Company Agreement) |
| Steve Ward | CRO & Co-Founder | Minority (exact % TBD) |
| Evan Rice | Co-Founder / Advisor | Minority (exact % TBD) |

**Note:** Ownership percentages and control rights are NOT in the state filing — they live in the Company Agreement (Operating Agreement), which has not yet been drafted. Amber has majority control per Evan's direction.

**Registered Agent:** Evan Rice's personal address (not published on website)
**Location:** Dallas, TX

---

## Domain

**Domain:** emberbots.ai
**Registrar:** GoDaddy
**DNS:** Managed in GoDaddy DNS panel

### Current DNS Records
| Type | Name | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | ember-bots.github.io |

---

## Website

**Live URL:** https://emberbots.ai
**Repo:** https://github.com/Ember-Bots/website
**Hosting:** GitHub Pages (free tier)
**Branch:** `main` — auto-deploys on every push
**Tech stack:** Pure HTML/CSS — no framework, no build step, no CMS

### Files in repo
| File | Purpose |
|------|---------|
| `index.html` | Entire website (single page) |
| `logo.svg` | Canonical Ember Bots logo from emberbots.ai; use this for new materials |
| `favicon.svg` | Canonical Ember Bots mark |
| `logo.png` | Deprecated old PNG logo; do not use for new materials |
| `amber.jpg` | Amber Rice founder photo |
| `steve.jpg` | Steve Ward founder photo |
| `CNAME` | Contains `emberbots.ai` — tells GitHub Pages the custom domain |

### To update the site
```bash
git clone https://github.com/Ember-Bots/website.git
cd website
# Edit index.html or replace image files
git add .
git commit -m "Your change description"
git push
# Site rebuilds automatically in ~60 seconds
```

### Site sections
1. **Hero** — preserved hero wording, updated subheadline, CTA buttons
2. **Problem** — operational drag/pain framing for small teams
3. **Automation Systems** — current homepage offer stack focused on non-conflicting automation services
4. **How Ember Bots Works** — 4-step process + premium flow visual
5. **Best Fit** — who the service is for and operational pain signals
6. **Our Story** — Amber Rice + Steve Ward founder cards + narrative copy
7. **Contact** — contact form CTA, email, phone, Dallas TX

### Current homepage positioning constraints
- Keep the hero wording exactly:
  - `AI AUTOMATION FOR SMALL BUSINESS`
  - `Your business deserves intelligent automation.`
- Keep Ember Bots positioned away from quoting, invoicing, billing, and payment language unless Evan explicitly changes direction, to avoid overlap with Rev.io.
- Current approved offer stack includes lead response, message routing, scheduling/reminders, onboarding, task orchestration, follow-up automation, back-office admin automation, and executive daily briefing.

### Design system (current CSS variables)
```css
--bg: #0a0b10           /* obsidian background */
--bg2: rgba(18, 14, 26, 0.88)
--bg3: rgba(24, 18, 36, 0.9)
--surface: rgba(28, 21, 42, 0.88)
--border: rgba(84, 72, 120, 0.28)
--text: #ece8f6
--text-muted: #9a92b3
--ember-red: #bc2535
--ember: #f05a28
--gold: #ffb84d
--accent: #6d4dff
--indigo: #2d3250
```
Current visual direction is premium, dark, restrained, and "controlled fire" rather than playful, neon, or generic AI-site styling.

---

## Email

**Status:** NOT YET SET UP as of 2026-04-03
**Planned address:** hello@emberbots.ai (and/or amber@emberbots.ai)
**Recommended setup:** Google Workspace ($6/user/month) — adds MX records to GoDaddy
**Current contact on site:** hello@emberbots.ai (placeholder — not live)

### To set up Google Workspace
1. Go to workspace.google.com, sign up with domain emberbots.ai
2. Add the MX records Google provides to GoDaddy DNS
3. Create user (amber@emberbots.ai or hello@emberbots.ai)
4. Update the contact email in index.html

---

## GitHub Organization

**Org:** https://github.com/Ember-Bots
**Owner:** erice320 (Evan Rice's personal GitHub account)
**Repos:** `website` (the site)

### To give the Mac Mini agent push access
1. Create a GitHub personal access token (PAT) with `repo` scope
2. Configure git on the Mac Mini: `git remote set-url origin https://<TOKEN>@github.com/Ember-Bots/website.git`
3. Or create a dedicated GitHub account for the agent and add it as a member of the Ember-Bots org

---

## Pending / To-Do

- [ ] File LLC Certificate of Formation via SOSDirect (Evan, next week)
- [ ] Draft Company Agreement (ownership %, voting rights, Amber majority)
- [ ] Set up Google Workspace email (hello@emberbots.ai or amber@emberbots.ai)
- [ ] Update contact email on website once email is live
- [ ] Get proper transparent PNG logo (current version was green-screen keyed)
- [ ] Add contact form (Phase 1.5 — basic form or Formspree embed, no backend needed)
- [ ] Phase 2: additional live-site polish and conversion improvements once positioning is settled

---

## Phase 2 Notes (for future reference)

- **Payments:** Stripe Payment Links work on static sites — no backend required for basic checkout. Stripe also generates QR codes per payment link.
- **Contact form:** Formspree (formspree.io) — free tier, just add an HTML form pointing to their endpoint. No server needed.
- **CMS (if needed later):** Netlify CMS or Decap CMS work with GitHub-hosted static sites and give non-technical users an edit interface.

---

## Brand / Voice Notes

- **Tone:** Clean, professional, modern — SpaceX/Tesla aesthetic
- **Audience:** Small business owners and decision makers doing diligence
- **Color:** Ember orange (`#ff6b35`) — intentional nod to co-founder Amber's name
- **Logo:** Robot mascot with ember/fire in chest — the "ember" theme is deliberate
- **Copy voice:** Direct, confident, no fluff — speaks to business outcomes not tech specs
