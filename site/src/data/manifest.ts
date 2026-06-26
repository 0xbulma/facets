import { z } from 'zod';
import type { Manifest } from '@/lib/types.ts';
import generated from './manifest.generated.json';

const triggerSchema = z.object({
  slashCommand: z.string(),
  phrases: z.array(z.string()),
});

const skillSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  category: z.enum(['pr-flow', 'authoring', 'conventions', 'dapp', 'feedback']),
  tagline: z.string(),
  lead: z.string(),
  notes: z.string().nullable(),
  trigger: triggerSchema,
  sections: z.array(z.string()),
});

const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  kind: z.enum(['baseline', 'conditional']),
  trigger: z.string().nullable(),
  focus: z.string(),
});

const pluginSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  marketplaceDescription: z.string(),
  homepage: z.string(),
  license: z.string(),
  author: z.string(),
  keywords: z.array(z.string()),
  installCommand: z.string(),
});

const manifestSchema = z.object({
  plugin: pluginSchema,
  skills: z.array(skillSchema),
  agents: z.array(agentSchema),
  generatedAt: z.string(),
});

export const manifest: Manifest = manifestSchema.parse(generated);
