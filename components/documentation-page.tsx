import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowRight, CodeXml } from 'lucide-react';
import docs from '@/data/docs.json';
import Link from '@/components/static-link';
import { SiteHeader, SiteFooter } from '@/components/site-header';
import { DocumentationShell } from '@/components/documentation-shell';
import { MarkdownToc } from '@/components/markdown-toc';
import { CodeBlock } from '@/components/code-block';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { markdownHeadings, nodeText } from '@/lib/cookbook';
import {
  documentationGroups,
  documentationLabel,
  documentationPath,
  documentationUrl,
  type DocumentationPage,
} from '@/lib/documentation';

export function DocumentationArticle({ page }: { page: DocumentationPage }) {
  const groups = documentationGroups(docs.pages);
  const pages = groups.flatMap((group) => group.pages);
  const index = pages.findIndex((item) => item.slug === page.slug);
  const previous = pages[index - 1];
  const next = pages[index + 1];
  return (
    <>
      <a className="skip-link" href="#documentation-content">
        Skip to documentation
      </a>
      <SiteHeader section="docs" />
      <DocumentationShell
        current={page.slug}
        groups={groups.map((group) => ({
          label: group.label,
          links: group.pages.map((item) => ({
            slug: item.slug,
            label: documentationLabel(item),
            href: documentationPath(item.slug),
          })),
        }))}
      >
        <main className="detail-shell doc-detail">
          <div className="detail-layout">
            <div className="docs-article">
              <div className="documentation-heading">
                <Breadcrumb className="doc-breadcrumb">
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink render={<Link href="/docs/" />}>
                        Docs
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>
                        {documentationLabel(page)}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <a className="documentation-source" href={page.sourceUrl}>
                  <CodeXml size={15} />
                  Source
                </a>
              </div>
              <article
                id="documentation-content"
                className="markdown-content cookbook-prose"
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, markdownHeadings]}
                  urlTransform={(url) =>
                    documentationUrl(
                      defaultUrlTransform(url),
                      page.path,
                      docs,
                      process.env.NEXT_PUBLIC_BASE_PATH || '',
                    )
                  }
                  components={{
                    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                    // The Hub currently publishes English only. Keep the original
                    // language selector in source, but don't advertise untranslated routes.
                    p: ({ node, children }) =>
                      node && nodeText(node) === 'English · 中文' ? null : (
                        <p>{children}</p>
                      ),
                  }}
                >
                  {page.markdown}
                </ReactMarkdown>
              </article>
              <nav
                className="documentation-pagination"
                aria-label="Documentation pages"
              >
                {previous ? (
                  <Link href={documentationPath(previous.slug)}>
                    <ArrowLeft size={16} />
                    <span>
                      <small>Previous</small>
                      {documentationLabel(previous)}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link href={documentationPath(next.slug)}>
                    <span>
                      <small>Next</small>
                      {documentationLabel(next)}
                    </span>
                    <ArrowRight size={16} />
                  </Link>
                )}
              </nav>
            </div>
            <aside className="detail-sidebar">
              <MarkdownToc
                markdown={page.markdown}
                top="documentation-content"
              />
            </aside>
          </div>
        </main>
      </DocumentationShell>
      <SiteFooter />
    </>
  );
}
