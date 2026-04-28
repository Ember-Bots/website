# Shareable HTML presentation standard

Use this workflow for any Ember Bots presentation, signing packet, one-pager, or other HTML document that will be shared outside the local machine.

## Non-negotiable standard
1. Build or edit the HTML locally.
2. Preview locally and fix layout issues.
3. Publish through the `website` GitHub repo so there is a real GitHub Pages URL.
4. Verify the live URL, not just localhost.
5. If available, run a Gemini Pro design-review pass against the published artifact.
6. Re-verify locally and live after design edits.
7. Only then hand off the shareable URL or derivative files like DOCX/PDF.

Localhost preview is draft QA only. It is **not** the finished handoff.

## Publish-first workflow
```bash
cd ~/.openclaw/workspace/website
python3 -m http.server 4173
# preview http://127.0.0.1:4173/<path>.html

git add <changed files>
git commit -m "Describe the presentation change"
git push origin main
```

Then verify the live page:
```bash
curl -I https://emberbots.ai/presentations/<file>.html
curl -L -A 'Mozilla/5.0' -s https://emberbots.ai/presentations/<file>.html | head
```

GitHub Pages can lag briefly. If the source is correct but the site looks stale, wait and re-check before claiming the live update failed.

## Design-review pass
When Gemini Pro is available, review the **published** URL rather than a localhost-only draft. Ask for:
- premium, restrained Ember Bots brand treatment
- mobile overflow and clipping fixes
- print readability for contracts / one-pagers
- signature/readability polish without changing business or legal substance

After Gemini edits, verify again before handoff.

## Brand asset source of truth
- Primary logo: `website/logo.svg`
- Standalone mark/favicon: `website/favicon.svg`
- `website/logo.png` is deprecated and should not be used for new materials.
- If a document logo looks wrong, compare it against the live site at `https://emberbots.ai` and update the local asset first.

## Quality gate before saying "done"
- Local preview loads
- Live GitHub Pages URL loads
- Correct logo/brand assets are present
- Mobile width does not clip tables or signature blocks
- Print CSS is acceptable for customer-facing docs
- Any requested DOCX/PDF export was generated from the final reviewed HTML, not an older draft

## DOCX export path
Use the helper script after the HTML is finalized:
```bash
~/.openclaw/workspace/scripts/html-presentation-to-docx.sh \
  ~/.openclaw/workspace/website/presentations/<file>.html
```

That produces a same-name `.docx` beside the HTML unless an explicit output path is given.
