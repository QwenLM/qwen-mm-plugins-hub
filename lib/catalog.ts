export type Contributor = { name: string; url: string; avatarUrl: string };
export type Schema = {
  type?: string | string[];
  description?: string;
  default?: unknown;
  enum?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  [key: string]: unknown;
};
export type Tool = {
  name: string;
  description: string;
  inputSchema: Schema;
  sourceUrl: string;
  sourcePath: string;
  definitionText: string;
  tokenCount: number;
};
export type TokenizerInfo = {
  label: string;
  modelId: string;
  revision: string;
  sourceUrl: string;
  method: string;
  engineVersion: string;
};

export function formatTokens(value: number): string {
  return value.toLocaleString('en-US');
}
export type SkillFile = { path: string; sourceUrl: string };
export type SkillDirectory = {
  name: string;
  path: string;
  children: SkillDirectory[];
  file?: SkillFile;
};

export function skillFileTree(files: SkillFile[]): SkillDirectory[] {
  const roots: SkillDirectory[] = [];
  for (const file of files) {
    let siblings = roots;
    const parts = file.path.split('/');
    for (const [index, name] of parts.entries()) {
      let node = siblings.find((entry) => entry.name === name);
      if (!node) {
        node = {
          name,
          path: parts.slice(0, index + 1).join('/'),
          children: [],
        };
        siblings.push(node);
      }
      if (index === parts.length - 1) node.file = file;
      siblings = node.children;
    }
  }
  function sort(nodes: SkillDirectory[]): SkillDirectory[] {
    return nodes
      .sort(
        (a, b) =>
          Number(Boolean(a.file)) - Number(Boolean(b.file)) ||
          a.name.localeCompare(b.name),
      )
      .map((node) => ({ ...node, children: sort(node.children) }));
  }
  return sort(roots);
}

export function skillExcerpt(text: string, limit = 50) {
  const lines = text.trimEnd().split('\n');
  return {
    text: lines.slice(0, limit).join('\n'),
    lineCount: lines.length,
    truncated: lines.length > limit,
  };
}
export type Plugin = Omit<PluginSummary, 'toolCount' | 'toolNames'> & {
  skill: {
    name: string;
    description: string;
    markdown: string;
    raw: string;
    path: string;
    sourceUrl: string;
    directoryUrl: string;
    files: SkillFile[];
    prerequisites: string;
  };
  tools: Tool[];
  moduleDocstring: string;
  requirements: { label: string; tools: string[]; hint: string }[];
};

export function schemaType(schema: Schema): string {
  if (schema.anyOf || schema.oneOf)
    return (schema.anyOf || schema.oneOf || []).map(schemaType).join(' | ');
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (schema.type === 'array') return `${schemaType(schema.items || {})}[]`;
  return schema.type || (schema.enum ? 'enum' : 'any');
}
export type PluginSummary = {
  id: string;
  name: string;
  title: string;
  version: string;
  release: { version: string; tag: string; url: string } | null;
  description: string;
  contributors: string[];
  category: string;
  tags: string[];
  kind: string;
  order: number;
  channel: string;
  toolCount: number;
  toolNames: string[];
  tokenEstimate: {
    skillFull: number;
    skillMetadata: number;
    toolsTotal: number;
  };
  source: {
    url: string;
    path: string;
    commit: string;
    date: string;
    repository: string;
  };
  cookbookUrl: string;
};

export function filterPlugins(
  plugins: PluginSummary[],
  query: string,
  category: string,
  contributor: string,
  tags: string[],
) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return plugins.filter((p) => {
    const text = [p.name, p.title, p.description, ...p.tags, ...p.toolNames]
      .join(' ')
      .toLocaleLowerCase();
    return (
      (!category || p.category === category) &&
      (!contributor || p.contributors.includes(contributor)) &&
      tags.every((t) => p.tags.includes(t)) &&
      words.every((w) => text.includes(w))
    );
  });
}
