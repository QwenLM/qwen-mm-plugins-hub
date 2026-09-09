export type DocumentationPage = {
  slug: string;
  path: string;
  title: string;
  markdown: string;
  sourceUrl: string;
};
export type Documentation = {
  repository: string;
  ref: string;
  commit: string;
  pages: DocumentationPage[];
};

/** The Docs entry is the installation page, not a second directory to navigate. */
export function documentationPath(slug: string): string {
  return slug === 'installation' ? '/docs/' : `/docs/${slug}/`;
}

/** Rewrite links, never command examples or Markdown source. */
export function documentationUrl(
  url: string,
  sourcePath: string,
  docs: Documentation,
  base = '',
): string {
  if (!url || url.startsWith('#')) return url;
  const resolved = new URL(url, `https://source.local/${sourcePath}`);
  let path = resolved.pathname;
  if (resolved.origin !== 'https://source.local') {
    const source = new URL(docs.repository);
    if (resolved.origin !== source.origin) return url;
    const prefix = `${source.pathname}/`;
    if (!path.startsWith(prefix)) return url;
    const [kind, ref, ...segments] = path.slice(prefix.length).split('/');
    if (
      !['blob', 'tree'].includes(kind) ||
      !['main', docs.ref, docs.commit].includes(ref)
    )
      return url;
    path = '/' + segments.join('/');
    // Only imported documents redirect absolute repository links into the Hub.
    if (!docs.pages.some((page) => '/' + page.path === path)) return url;
  }
  const page = docs.pages.find((page) => '/' + page.path === path);
  if (page)
    return (
      base + documentationPath(page.slug) + resolved.search + resolved.hash
    );
  const kind = path.endsWith('/') ? 'tree' : 'blob';
  return `${docs.repository}/${kind}/${docs.commit}${path}${resolved.search}${resolved.hash}`;
}

// Known pages get a reading order; new upstream pages still appear automatically.
const navigation = [
  { label: 'Get started', slugs: ['installation', 'manual-harnesses'] },
  { label: 'Reference', slugs: ['configuration'] },
  {
    label: 'Development',
    slugs: [
      'local-development',
      'how-to-add-new-capability',
      'hub',
      'testing',
      'releasing',
    ],
  },
];
export function documentationGroups(pages: DocumentationPage[]) {
  const known = new Set(navigation.flatMap((group) => group.slugs));
  const groups = navigation.map((group) => ({
    label: group.label,
    pages: group.slugs.flatMap((slug) =>
      pages.filter((page) => page.slug === slug),
    ),
  }));
  groups[1].pages.push(...pages.filter((page) => !known.has(page.slug)));
  return groups.filter((group) => group.pages.length);
}

export function documentationLabel(page: DocumentationPage): string {
  return page.slug === 'how-to-add-new-capability'
    ? 'Adding a plugin'
    : page.title;
}
