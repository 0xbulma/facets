// Pure derivation helpers shared by the manifest build script and its tests.
// No I/O — every function maps strings to strings so it is trivially testable.

export type Frontmatter = {
  readonly data: Readonly<Record<string, string>>;
  readonly body: string;
};

/**
 * Split a markdown file into its YAML frontmatter scalars and body.
 *
 * Only top-level single-line `key: value` scalars are read — block scalars
 * (`applies: |`), lists (`out-of-scope:`), and indented continuations are
 * skipped. That covers every field the manifest needs (name, version,
 * description, kind, trigger, focus) without pulling in a YAML dependency.
 */
export function parseFrontmatter(raw: string): Frontmatter {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return { data: {}, body: raw };

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { data: {}, body: raw };

  const data: Record<string, string> = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i] ?? '';
    const match = line.match(/^([A-Za-z][\w-]*):[ \t]?(.*)$/);
    if (!match) continue;
    const key = match[1] ?? '';
    const value = (match[2] ?? '').trim();
    // Empty value or a block-scalar marker means the content lives on the
    // following (indented) lines — not a scalar we surface.
    if (value === '' || value === '|' || value === '>') continue;
    data[key] = value.replace(/^["']|["']$/g, '');
  }

  return { data, body: lines.slice(end + 1).join('\n') };
}

/** The text before the `". Use when …"` trigger clause; the whole string if absent. */
export function deriveLead(description: string): string {
  const match = description.match(/^(.*?\.)\s+Use\s+(?:when|the)\b/is);
  return (match?.[1] ?? description).trim();
}

/** The first sentence of a passage. */
export function firstSentence(text: string): string {
  const match = text.match(/^(.*?[.!?])(?:\s|$)/s);
  return (match?.[1] ?? text).trim();
}

/** The `/facets:<cmd>` and all quoted invocation phrases from a description. */
export function extractTrigger(
  id: string,
  description: string,
): { slashCommand: string; phrases: string[] } {
  const normalized = description.replace(/[“”]/g, '"');
  const slash = normalized.match(/\/facets:[\w-]+/);
  const phrases = [...normalized.matchAll(/"([^"]+)"/g)]
    .map((m) => m[1] ?? '')
    .filter((p) => p.length > 0);
  return { slashCommand: slash?.[0] ?? `/facets:${id}`, phrases };
}

/** Trailing notes after the last quoted phrase, or null when there are none. */
export function deriveNotes(description: string): string | null {
  const normalized = description.replace(/[“”]/g, '"');
  const lastQuote = normalized.lastIndexOf('"');
  if (lastQuote < 0) return null;
  const tail = normalized
    .slice(lastQuote + 1)
    .replace(/^[\s.,;:]+/, '')
    .trim();
  return tail.length > 0 ? tail : null;
}

/** H2 (`## …`) headings of a markdown body, with fenced code blocks stripped. */
export function extractSections(body: string): string[] {
  const withoutFences = body.replace(/```[\s\S]*?```/g, '');
  return withoutFences
    .split('\n')
    .map((line) => line.match(/^##\s+(.+?)\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1] ?? '')
    .filter((s) => s.length > 0);
}
