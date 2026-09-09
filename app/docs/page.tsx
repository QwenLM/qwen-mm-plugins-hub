import docs from '@/data/docs.json';
import { DocumentationArticle } from '@/components/documentation-page';

export const metadata = { title: 'Installation — Qwen MM Plugins' };

export default function DocsPage() {
  return (
    <DocumentationArticle
      page={docs.pages.find((page) => page.slug === 'installation')!}
    />
  );
}
