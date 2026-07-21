import { GitPullRequest, Layers, type LucideIcon, ShieldCheck } from 'lucide-react';

type Pillar = { icon: LucideIcon; title: string; body: string };

type WhyStripProps = { agentCount: number };

export function WhyStrip({ agentCount }: WhyStripProps) {
  const pillars: Pillar[] = [
    {
      icon: GitPullRequest,
      title: 'A local PR pipeline',
      body: 'From the first diff to an opened PR — plan, review, fix, and ship, all inside Claude Code. No cloud bill, no CI wait, and your code never leaves your machine.',
    },
    {
      icon: ShieldCheck,
      title: 'Review that earns the merge',
      body: `A ${agentCount}-agent panel — six always run, the rest fire only on what your diff touches. Findings post as inline GitHub comments (never an auto-approve); the safe fixes get applied on demand.`,
    },
    {
      icon: Layers,
      title: 'Or ship it autonomously',
      body: 'tib-ship takes a brief, implements it test-driven, self-reviews in a loop, and hands you a ready-to-push branch — with the TIB → TIP → PR paper trail, so the why ships with the code.',
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
