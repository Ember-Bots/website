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
| `logo.png` | Transparent PNG logo (robot mascot + "Ember Bots" text) |
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
1. **Hero** — headline, subheadline, CTA buttons, 3 stat callouts
2. **Mission & Vision** — company mission, Amber + Steve quote callout
3. **What We Do** — 6 service cards (AI Agents, Workflow Automation, BI, Customer Comms, Integration, Optimization)
4. **How We Help** — 4-step process + automation flow diagram
5. **Our Story** — Amber Rice (CEO) + Steve Ward (CRO) founder cards + narrative copy
6. **Contact** — hello@emberbots.ai, Dallas TX (no physical address published)

### Design system (CSS variables)
```css
--bg: #050508           /* main background */
--ember: #ff6b35        /* primary accent — ember orange */
--ember-dim: rgba(255,107,53,0.12)
--ember-glow: rgba(255,107,53,0.25)
--accent: #6c63ff       /* secondary accent — purple */
--text: #e8eaf6         /* body text */
--text-muted: #8b8fa8   /* secondary text */
--surface: #1a1b2e      /* card backgrounds */
```
To change the accent color globally, update `--ember` and the two `--ember-dim` / `--ember-glow` values.

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
- [ ] Phase 2: Stripe payment integration + QR code generation

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
