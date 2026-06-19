export type CategoryId = 'pr-flow' | 'authoring' | 'conventions' | 'dapp' | 'feedback';

export type Trigger = {
  readonly slashCommand: string;
  readonly phrases: readonly string[];
};

export type Skill = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly category: CategoryId;
  /** First sentence of the lead — the card headline. */
  readonly tagline: string;
  /** Full prose before the "Use when …" trigger clause. */
  readonly lead: string;
  /** Trailing notes after the trigger clause, if any. */
  readonly notes: string | null;
  readonly trigger: Trigger;
  /** H2 headings of the body, as a table of contents. */
  readonly sections: readonly string[];
};

export type AgentKind = 'baseline' | 'conditional';

export type Agent = {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly kind: AgentKind;
  /** The `HAS_*` flag that fires a conditional agent; null for baseline. */
  readonly trigger: string | null;
  readonly focus: string;
};

export type Plugin = {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly marketplaceDescription: string;
  readonly homepage: string;
  readonly license: string;
  readonly author: string;
  readonly keywords: readonly string[];
  /** Two-line `/plugin marketplace add …` + `/plugin install …` block. */
  readonly installCommand: string;
};

export type Manifest = {
  readonly plugin: Plugin;
  readonly skills: readonly Skill[];
  readonly agents: readonly Agent[];
  readonly generatedAt: string;
};
