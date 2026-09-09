import GithubSlugger from 'github-slugger';

/** Map cookbook-local references to hosted assets, retaining repository links for other files. */
export function cookbookUrl(
  url: string,
  id: string,
  sourceUrl: string,
  base = '',
): string {
  if (!url || url.startsWith('#') || /^(https?:|mailto:)/.test(url)) return url;
  const resolved = new URL(
    url,
    `https://cookbook.local/content/cookbooks/${id}/usage.md`,
  );
  if (resolved.origin !== 'https://cookbook.local') return '';
  if (resolved.pathname.startsWith('/public/cases/')) {
    return (
      base +
      resolved.pathname.slice('/public'.length) +
      resolved.search +
      resolved.hash
    );
  }
  if (resolved.pathname.startsWith('/cases/'))
    return base + resolved.pathname + resolved.search + resolved.hash;
  if (
    resolved.pathname.startsWith('/content/cookbooks/') &&
    resolved.pathname.endsWith('/usage.md')
  ) {
    return `${base}/plugins/${resolved.pathname.split('/')[3]}/cookbook/${resolved.hash}`;
  }
  return new URL(url, sourceUrl).href;
}

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  depth?: number;
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
};
type TextNode = { value?: string; children?: TextNode[] };
export function nodeText(node: TextNode): string {
  return node.value || node.children?.map(nodeText).join('') || '';
}

/** Body and outline share the same GitHub-compatible heading IDs. */
export function markdownHeadings({ prefix = '' }: { prefix?: string } = {}) {
  return (tree: MarkdownNode) => {
    const headings = new GithubSlugger();
    function visit(node: MarkdownNode) {
      if (node.type === 'heading') {
        node.data = {
          ...node.data,
          hProperties: { id: prefix + headings.slug(nodeText(node)) },
        };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

/** A standalone local media link becomes an embed; prose links remain ordinary links. */
export function cookbookEmbeds({ id }: { id: string }) {
  return (tree: MarkdownNode) => {
    markdownHeadings()(tree);
    function visit(parent: MarkdownNode) {
      parent.children = parent.children?.map((node) => {
        const link =
          node.type === 'paragraph' && node.children?.length === 1
            ? node.children[0]
            : undefined;
        if (link?.type === 'link' && link.url) {
          const local = new URL(
            link.url,
            `https://cookbook.local/content/cookbooks/${id}/usage.md`,
          );
          if (
            local.origin === 'https://cookbook.local' &&
            local.pathname.startsWith('/public/cases/') &&
            /\.(mp4|webm|html)$/.test(local.pathname)
          ) {
            return {
              type: 'paragraph',
              children: [],
              data: {
                hName: local.pathname.endsWith('.html')
                  ? 'cookbook-case'
                  : 'cookbook-video',
                hProperties: {
                  src: local.pathname.slice('/public'.length),
                  title: nodeText(link),
                },
              },
            };
          }
        }
        visit(node);
        return node;
      });
    }
    visit(tree);
  };
}
