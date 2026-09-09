import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import catalog from '@/data/catalog.json';
import { CodeBlock } from '@/components/code-block';
import { markdownHeadings } from '@/lib/cookbook';
import { PluginDetail } from '@/components/plugin-detail';
import { skillExcerpt, type Plugin } from '@/lib/catalog';

export function generateStaticParams() {
  return catalog.plugins.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const plugin = catalog.plugins.find((p) => p.id === id);
  return {
    title: plugin ? `${plugin.title} — Qwen MM Plugins` : 'Plugin not found',
    description: plugin?.description,
  };
}

export default async function PluginPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plugin = catalog.plugins.find((p) => p.id === id);
  if (!plugin) notFound();
  // Resolve bundled relative references against the exact documented commit.
  const skillDirectory = plugin.skill.sourceUrl.replace(/SKILL\.md$/, '');
  const renderMarkdown = (markdown: string) => (
    <article className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [markdownHeadings, { prefix: 'skill-section-' }],
        ]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
        urlTransform={(url, key) => {
          const safe = defaultUrlTransform(url);
          if (!safe) return safe;
          if (safe.startsWith('#')) return '#skill-section-' + safe.slice(1);
          if (/^https?:\/\//.test(safe) || safe.startsWith('mailto:'))
            return safe;
          const resolved = new URL(safe, skillDirectory).href;
          return key === 'src'
            ? resolved
                .replace('github.com/', 'raw.githubusercontent.com/')
                .replace('/blob/', '/')
            : resolved;
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
  return (
    <PluginDetail
      plugin={plugin as unknown as Plugin}
      contributors={catalog.contributors}
      tokenizer={catalog.tokenizer}
      navigation={catalog.plugins.map(({ id, title, category }) => ({
        id,
        title,
        category,
      }))}
      skillPreview={renderMarkdown(skillExcerpt(plugin.skill.markdown).text)}
      skillFullPreview={renderMarkdown(plugin.skill.markdown)}
      prerequisitesPreview={
        plugin.skill.prerequisites
          ? renderMarkdown(plugin.skill.prerequisites)
          : null
      }
    />
  );
}
