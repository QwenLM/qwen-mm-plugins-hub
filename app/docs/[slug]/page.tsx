import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import docs from '@/data/docs.json';
import { DocumentationArticle } from '@/components/documentation-page';

export function generateStaticParams() {
  return docs.pages
    .filter((page) => page.slug !== 'installation')
    .map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${docs.pages.find((page) => page.slug === slug)?.title || 'Documentation'} — Qwen MM Plugins`,
  };
}

export default async function DocsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = docs.pages.find(
    (page) => page.slug === slug && slug !== 'installation',
  );
  if (!page) notFound();
  return <DocumentationArticle page={page} />;
}
