# facets — hero demo storyboard

The single highest-ROI marketing asset: one real multi-agent review run posting inline
GitHub comments. Build it once; reuse as the README GIF, the microsite hero, the Show HN
top comment, and the X video.

## Format

- **Primary:** a 35–60s screen recording exported to **MP4** (shows the terminal run *and*
  the GitHub PR UI where inline comments land — asciinema can't show the browser surface).
- **Fallback:** a short looping **GIF** derived from the MP4 for the README (`docs/marketing/demo.gif`)
  and social cards, plus 2–3 annotated static screenshots for places that render video poorly.
- Large-font terminal theme; **burned-in captions** (most social autoplay is muted).

## Shot list (one continuous real run — no fakery)

1. **Fan-out (0–15s).** Type `/facets:pr-review-gh <PR>` in Claude Code. Show the agent panel
   dispatching in parallel and which conditional agents fired for this diff. Pick a **React +
   Web3 PR** so 9+ agents light up — the conditionality is the selling point.
2. **Inline comments (15–35s).** Cut to the GitHub PR "Files changed" tab: review comments
   appearing on specific lines, posted as a `COMMENT` review — visibly **not** an approval
   (this answers the "does it auto-merge?" fear in one frame).
3. **Fix loop (35–50s).** Show one genuinely good finding (a real correctness or security
   catch — one credible finding beats ten nits), then `/facets:pr-fix <PR>` applying the fix,
   pushing, and resolving the thread.
4. **End card (50–60s).** The 4-line install block + "MIT · runs locally · no cloud bill".

## Capture checklist

- [ ] Choose a demo PR with at least one real, specific finding.
- [ ] Clean terminal theme, font ≥ 16pt, window sized to 16:9.
- [ ] Record at 2x then trim dead air; target < 8 MB for the GIF.
- [ ] Export MP4 (hero/social) + GIF (README) + 3 annotated PNGs (cards).
- [ ] Drop `demo.gif` here and swap the README placeholder note for `![demo](docs/marketing/demo.gif)`.
- [ ] Update the microsite `Hero` demo placeholder (`site/src/components/Hero.tsx`) with the MP4.
