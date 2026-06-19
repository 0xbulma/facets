# facets — distribution checklist

Ranked by ROI for a solo / small dev-tool. Do the 1-hour wins first (the README is
where every channel lands), then record the demo (it gates the launch posts), then post.

## Positioning (use everywhere)

**Hook:** Self-review every facet of your PR — then ship it. A local PR pipeline in Claude Code: plan, review, fix, and open the PR. No cloud bill, no waiting on CI.

**Three pillars:**
1. **Local-first, no per-seat cloud bill.** Runs in your Claude Code session against a
   locally-computed diff. Your code never leaves your machine. You pay tokens you already pay.
2. **A real review panel, not one pass.** 6 agents always run; 11 fire only on what your
   diff touches (React, Web3, a11y, AI-SDK, CI-security, …). It even screenshots a
   wallet-gated dApp.
3. **Closes the loop.** Posts inline GitHub comments (never auto-approves), applies safe
   fixes, scaffolds the TIB → TIP → PR paper trail.

**Honest trade-off (lead with it on HN):** facets is a *developer's pre-flight self-review*
tool, not a centrally-enforced merge gate — each dev runs it in Claude Code, so it won't
cover contributors who don't. Cloud bots (CodeRabbit/Greptile/Graphite) win on zero-setup,
team-wide coverage. facets wins on cost, privacy, and stack-specific depth.

## Channels (ranked)

| # | Channel | Effort | Payoff | Hook |
|---|---------|--------|--------|------|
| 1 | **README polish** (badges, demo GIF, install block) | 1h | Highest — every channel funnels here | the install block + demo |
| 2 | **Claude Code / Anthropic plugin ecosystem** | Low | High — warmest audience (already run `/plugin`) | "local, multi-agent PR reviewer — no cloud bill" |
| 3 | **skills.sh registry** | Low | High — pre-qualified installers | tight description + demo |
| 4 | **Show HN** | Med | High ceiling, variable | "local multi-agent PR review in Claude Code (no cloud bill)" |
| 5 | **X / Twitter** (native video) | Low–Med | Compounding | the demo video does the work |
| 6 | **Web3 / Morpho-adjacent dev community** | Low | High for this ICP | `inject-wallet`: screenshot your wallet-gated dApp under review |
| 7 | **dev.to / blog** | Med | SEO long-tail | "I stopped paying for cloud PR-review bots" |
| 8 | **Subreddits** (r/ClaudeAI, r/webdev, r/nextjs, r/ethdev) | Low | Spiky, removal risk | demo-first, no pitch |

## Draft copy

### Show HN (title + first comment)

> **Show HN: facets – a local PR pipeline in Claude Code (review, fix, ship; no cloud bill)**
>
> I wanted CodeRabbit-style review without the per-seat subscription or shipping my private
> repo to someone's cloud — but really I wanted the whole loop, not just the review. facets is
> a Claude Code plugin that takes a change from plan to opened PR locally: it runs a 17-agent
> review against your diff, posts findings as inline GitHub comments (never auto-approves),
> applies the safe fixes, and opens the PR. 6 agents always run; 11 fire only on what your change touches —
> so a CSS-only PR doesn't pay for a Web3 review. Tuned for TS/React/Vercel/Web3; it can even
> boot your dev server and screenshot a wallet-gated dApp.
>
> Honest trade-off: it's a developer's pre-flight self-review tool, not a centrally-enforced
> merge gate — each dev runs it in Claude Code, so it won't cover contributors who don't.
> Cloud bots win on zero-setup team-wide coverage. facets wins on cost (tokens you already
> pay), privacy (code stays local), and stack-specific depth. MIT. Demo + install: <link>

### X / Twitter (native video thread)

> Tired of paying per-seat for a cloud bot to review your PRs?
>
> facets is a local PR pipeline in Claude Code — it reviews your diff with a 17-agent panel,
> applies the safe fixes, and opens the PR. No cloud bill. Your code never leaves your machine.
>
> [native demo video]
>
> 6 agents always run. 11 more fire only on what your diff touches — React, Web3, a11y,
> AI-SDK, CI security… it even screenshots your wallet-gated dApp.
>
> 4 commands to install, MIT, built on the TS/React/Vercel stack it reviews: <link>

### Web3 dev community

> Built a local PR-review plugin for Claude Code that's actually tuned for our stack —
> viem/wagmi/ethers, Reown AppKit, Next/Vercel. It runs a Web3 reviewer (contract calls,
> permits, chainId validation, signature handling) only when your diff touches that code,
> posts inline GitHub comments, and — the part nobody else does — injects a test wallet,
> gets past the AppKit connect modal, and screenshots your connected dApp UI under review.
> Runs locally, no cloud review bill, MIT. <demo + link>

## Sequencing

1. **Today (1h):** README badges (done), demo-GIF placeholder (done), tighten the
   skills.sh + marketplace.json descriptions, disambiguate the two "17"s (done).
2. **Half-day:** record + edit the hero demo (see `demo-storyboard.md`). Post Show HN + X +
   web3 channels the same day off the README + GIF — don't wait for the microsite.
3. **Multi-day:** ship the `site/` microsite as the durable destination; re-point links once live.
