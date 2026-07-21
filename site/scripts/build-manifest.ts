// Build-time data pipeline: reads the facets plugin's own SKILL.md / agent /
// manifest files (the single source of truth) and emits one typed JSON file the
// Vite app imports. Run on predev/prebuild so the site never drifts from the
// plugin. Runs dependency-light via Node's native type stripping.

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Agent, AgentKind, CategoryId, Manifest, Plugin, Skill } from '../src/lib/types.ts';
import {
  deriveLead,
  deriveNotes,
  extractSections,
  extractTrigger,
  firstSentence,
  parseFrontmatter,
} from './derive.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const pluginRoot = join(repoRoot, 'plugins', 'facets');
const skillsDir = join(pluginRoot, 'skills');
const agentsDir = join(skillsDir, 'pr-review-engine', 'agents');
const outFile = join(here, '..', 'src', 'data', 'manifest.generated.json');

const EXCLUDED_SKILLS = new Set(['pr-review-engine']);
const EXPECTED_SKILLS = 14;
const EXPECTED_AGENTS = 17;

const CATEGORY: Readonly<Record<string, CategoryId>> = {
  'pr-switch': 'pr-flow',
  'pr-review-local': 'pr-flow',
  'pr-review-gh': 'pr-flow',
  'pr-fix': 'pr-flow',
  'pr-create': 'pr-flow',
  'tib-create': 'authoring',
  'tip-create': 'authoring',
  'tib-ship': 'authoring',
  'convert-tib-to-linear': 'authoring',
  'ts-conventions': 'conventions',
  setup: 'conventions',
  'inject-wallet': 'dapp',
  feedback: 'feedback',
  'implement-feedback': 'feedback',
};

const pluginJsonSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  license: z.string().default('MIT'),
  homepage: z.string().default(''),
  author: z.union([z.string(), z.object({ name: z.string() })]).optional(),
});

const marketplaceSchema = z.object({
  description: z.string().optional(),
  plugins: z
    .array(
      z.object({ description: z.string().optional(), keywords: z.array(z.string()).optional() }),
    )
    .optional(),
});

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function buildPlugin(): Plugin {
  const plugin = pluginJsonSchema.parse(
    readJson(join(pluginRoot, '.claude-plugin', 'plugin.json')),
  );
  const market = marketplaceSchema.parse(
    readJson(join(repoRoot, '.claude-plugin', 'marketplace.json')),
  );
  const entry = market.plugins?.[0];
  const slug = plugin.homepage.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '');
  const author = typeof plugin.author === 'string' ? plugin.author : (plugin.author?.name ?? '');
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    marketplaceDescription: entry?.description ?? market.description ?? '',
    homepage: plugin.homepage,
    license: plugin.license,
    author,
    keywords: entry?.keywords ?? [],
    installCommand: `/plugin marketplace add ${slug}\n/plugin install ${plugin.name}@${plugin.name}`,
  };
}

function buildSkills(): Skill[] {
  const ids = readdirSync(skillsDir).filter(
    (id) => !EXCLUDED_SKILLS.has(id) && statSync(join(skillsDir, id)).isDirectory(),
  );
  const skills: Skill[] = [];
  for (const id of ids) {
    let raw: string;
    try {
      raw = readFileSync(join(skillsDir, id, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    const { data, body } = parseFrontmatter(raw);
    const description = data.description ?? '';
    const category = CATEGORY[id];
    if (!category) {
      throw new Error(
        `No category mapping for skill "${id}" — add it to CATEGORY in build-manifest.ts`,
      );
    }
    const lead = deriveLead(description);
    const { slashCommand, phrases } = extractTrigger(id, description);
    skills.push({
      id,
      name: data.name ?? id,
      version: data.version ?? '0.0.0',
      category,
      tagline: firstSentence(lead),
      lead,
      notes: deriveNotes(description),
      trigger: { slashCommand, phrases },
      sections: extractSections(body),
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function buildAgents(): Agent[] {
  const agents: Agent[] = readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data } = parseFrontmatter(readFileSync(join(agentsDir, f), 'utf8'));
      const id = f.replace(/\.md$/, '');
      const kind: AgentKind = data.kind === 'conditional' ? 'conditional' : 'baseline';
      return {
        id,
        name: data.name ?? id,
        version: data.version ?? '0.0.0',
        kind,
        trigger: data.trigger ?? null,
        focus: data.focus ?? '',
      };
    });
  return agents.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'baseline' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const skills = buildSkills();
const agents = buildAgents();

if (skills.length !== EXPECTED_SKILLS) {
  throw new Error(
    `Expected ${EXPECTED_SKILLS} user skills, found ${skills.length}: ${skills.map((s) => s.id).join(', ')}`,
  );
}
if (agents.length !== EXPECTED_AGENTS) {
  throw new Error(`Expected ${EXPECTED_AGENTS} review agents, found ${agents.length}`);
}

const manifest: Manifest = {
  plugin: buildPlugin(),
  skills,
  agents,
  generatedAt: new Date().toISOString(),
};

writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`✓ manifest: ${skills.length} skills, ${agents.length} agents\n`);
