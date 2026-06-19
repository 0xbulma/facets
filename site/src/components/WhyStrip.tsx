import { GitPullRequest, Layers, type LucideIcon, ShieldCheck } from 'lucide-react';

type Pillar = { icon: LucideIcon; title: string; body: string };

type WhyStripProps = { agentCount: number };

export function WhyStrip({ agentCount }: WhyStripProps) {
  const pillars: Pillar[] = [
    {
      icon: ShieldCheck,
      title: 'Local-first, no cloud bill',
      body: 'The review runs in your Claude Code session against a locally-computed diff. No per-seat subscription, no third party reading your private repo.',
    },
    {
      icon: Layers,
      title: `A ${agentCount}-agent panel, not one pass`,
      body: 'Six reviewers always run; the rest fire only on what your diff touches — React, Web3, accessibility, AI-SDK, CI security, and more.',
    },
    {
      icon: GitPullRequest,
      title: 'Closes the review → fix → ship loop',
      body: 'Posts findings as inline GitHub comments (never auto-approves), applies safe fixes on demand, and scaffolds the TIB → TIP → PR paper trail.',
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid gap-6 sm:grid-cols-3">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <article
              key={pillar.title}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-6"
            >
              <Icon size={22} className="text-brand" />
              <h3 className="mt-4 text-base font-semibold text-white">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{pillar.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
