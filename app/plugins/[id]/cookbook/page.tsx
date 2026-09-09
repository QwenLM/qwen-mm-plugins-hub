import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CodeXml } from 'lucide-react';
import catalog from '@/data/catalog.json';
import cookbooks from '@/data/cookbooks.json';
import { SiteHeader, SiteFooter } from '@/components/site-header';
import { DocsShell } from '@/components/docs-shell';
import { CookbookMarkdown } from '@/components/cookbook-markdown';
import { MarkdownToc } from '@/components/markdown-toc';
import { DocBreadcrumb } from '@/components/doc-breadcrumb';

export function generateStaticParams() {
  return catalog.plugins.map((p) => ({ id: p.id }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = catalog.plugins.find((p) => p.id === id);
  return {
    title: `${p?.title || 'Plugin'} cookbook — Qwen MM Plugins`,
    description: p?.description,
  };
}
export default async function CookbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = catalog.plugins.find((p) => p.id === id);
  const book = (
    cookbooks as Record<string, { markdown: string; sourceUrl: string }>
  )[id];
  if (!p || !book) notFound();
  return (
    <>
      <a className="skip-link" href="#cookbook-content">
        Skip to cookbook
      </a>
      <SiteHeader />
      <DocsShell
        plugins={catalog.plugins}
        current={id}
        cookbookUrl={`/plugins/${id}/cookbook/`}
        section="cookbook"
        hasTools={p.tools.length > 0}
      >
        <main className="detail-shell doc-detail">
          <div className="detail-layout">
            <div className="docs-article">
              <DocBreadcrumb id={id} title={p.title} cookbook />
              <div className="cookbook-heading">
                <span>COOKBOOK</span>
                <a href={book.sourceUrl}>
                  <CodeXml size={15} />
                  Source Markdown
                </a>
              </div>
              <section id="cookbook-content">
                <CookbookMarkdown
                  markdown={book.markdown}
                  id={id}
                  sourceUrl={book.sourceUrl}
                />
              </section>
            </div>
            <aside className="detail-sidebar">
              <MarkdownToc markdown={book.markdown} top="cookbook-content" />
            </aside>
          </div>
        </main>
      </DocsShell>
      <SiteFooter />
    </>
  );
}
