import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownHeadings, nodeText } from '@/lib/cookbook';

/** Use the same Markdown parser and slug order as the document body. */
export function MarkdownToc({
  markdown,
  top,
}: {
  markdown: string;
  top: string;
}) {
  return (
    <nav className="docs-toc cookbook-toc" aria-label="On this page">
      <h2>On this page</h2>
      <a href={`#${top}`}>Top</a>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, markdownHeadings]}
        allowedElements={[
          'h2',
          'h3',
          'a',
          'code',
          'em',
          'strong',
          'del',
          'br',
          'img',
        ]}
        components={{
          h2: ({ node }) => (
            <a href={`#${node?.properties.id}`}>{node ? nodeText(node) : ''}</a>
          ),
          h3: ({ node }) => (
            <a className="toc-subheading" href={`#${node?.properties.id}`}>
              {node ? nodeText(node) : ''}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </nav>
  );
}
