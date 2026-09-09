/* oxlint-disable next/no-img-element -- Static Markdown preserves intrinsic image dimensions without an optimization server. */
/* oxlint-disable jsx-a11y/media-has-caption -- Upstream recordings have no subtitle files; do not invent caption tracks. The cookbook provides written walkthroughs. */
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cookbookEmbeds, cookbookUrl } from '@/lib/cookbook';
import docs from '@/data/docs.json';
import { documentationUrl } from '@/lib/documentation';
import { CodeBlock } from '@/components/code-block';

export function CookbookMarkdown({
  markdown,
  id,
  sourceUrl,
}: {
  markdown: string;
  id: string;
  sourceUrl: string;
}) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const resolve = (url: string) => {
    const safe = defaultUrlTransform(url);
    return /^https?:/.test(safe)
      ? documentationUrl(safe, '', docs, base)
      : cookbookUrl(safe, id, sourceUrl, base);
  };
  const hosted = (src?: string) =>
    src?.startsWith('/cases/')
      ? base + src
      : src?.startsWith(base + '/cases/')
        ? src
        : '';
  const components = {
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    img: ({ src, alt }) => <img src={src} alt={alt || ''} loading="lazy" />,
    'cookbook-video': ({ src, title }: { src?: string; title?: string }) => (
      <figure className="cookbook-media">
        <video
          controls
          playsInline
          preload="none"
          src={hosted(src)}
          aria-label={title}
        />
      </figure>
    ),
    'cookbook-case': ({ src, title }: { src?: string; title?: string }) => (
      <figure className="cookbook-media" id={`case-${src?.split('/').at(-2)}`}>
        <iframe
          src={hosted(src)}
          title={title || 'Interactive example'}
          sandbox="allow-scripts"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </figure>
    ),
  } as Components;
  return (
    <article className="markdown-content cookbook-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [cookbookEmbeds, { id }]]}
        rehypePlugins={[
          [rehypeRaw, { passThrough: [] }],
          [
            rehypeSanitize,
            {
              ...defaultSchema,
              clobberPrefix: '',
              tagNames: [
                ...(defaultSchema.tagNames || []),
                'cookbook-video',
                'cookbook-case',
              ],
              attributes: {
                ...defaultSchema.attributes,
                'cookbook-video': ['src', 'title'],
                'cookbook-case': ['src', 'title'],
              },
            },
          ],
        ]}
        urlTransform={resolve}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
