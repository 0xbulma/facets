import { useState } from 'react';
import { SkillCard } from '@/components/SkillCard.tsx';
import { SkillDetail } from '@/components/SkillDetail.tsx';
import { CATEGORY_BLURB, CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/categories.ts';
import type { Skill } from '@/lib/types.ts';

type SkillCatalogProps = { skills: readonly Skill[] };

export function SkillCatalog({ skills }: SkillCatalogProps) {
  const [selected, setSelected] = useState<Skill | null>(null);

  return (
    <section id="skills" className="border-t border-slate-800/60 bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <header className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-white">
            {skills.length} skills, from plan to merge
          </h2>
          <p className="mt-3 text-slate-400">
            Slash commands that carry a change all the way to a shipped PR — review and fix are just
            two stops on the line. Click any card for its triggers and what it does.
          </p>
        </header>

        <div className="mt-12 space-y-14">
          {CATEGORY_ORDER.map((category) => {
            const inCategory = skills.filter((skill) => skill.category === category);
            if (inCategory.length === 0) return null;
            return (
              <div key={category}>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h3 className="text-lg font-semibold text-white">{CATEGORY_LABEL[category]}</h3>
                  <span className="text-sm text-slate-500">{CATEGORY_BLURB[category]}</span>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {inCategory.map((skill) => (
                    <SkillCard key={skill.id} skill={skill} onSelect={() => setSelected(skill)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SkillDetail skill={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
