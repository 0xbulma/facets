import { AgentPanel } from '@/components/AgentPanel.tsx';
import { Hero } from '@/components/Hero.tsx';
import { SiteFooter } from '@/components/SiteFooter.tsx';
import { SiteHeader } from '@/components/SiteHeader.tsx';
import { SkillCatalog } from '@/components/SkillCatalog.tsx';
import { WhyStrip } from '@/components/WhyStrip.tsx';
import { manifest } from '@/data/manifest.ts';

export function App() {
  const { plugin, skills, agents } = manifest;
  return (
    <div className="min-h-screen">
      <SiteHeader plugin={plugin} />
      <main>
        <Hero plugin={plugin} skillCount={skills.length} agentCount={agents.length} />
        <WhyStrip agentCount={agents.length} />
        <SkillCatalog skills={skills} />
        <AgentPanel agents={agents} />
      </main>
      <SiteFooter plugin={plugin} generatedAt={manifest.generatedAt} />
    </div>
  );
}
