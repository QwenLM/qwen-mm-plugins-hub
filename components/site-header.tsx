import Link from '@/components/static-link';
import Image from 'next/image';
import { ArrowUpRight, CodeXml, Search, BookOpen } from 'lucide-react';
import source from '@/data/docs.json';
import { ThemeToggle } from '@/components/theme-toggle';

export function SiteHeader({
  section = 'plugins',
}: {
  section?: 'plugins' | 'docs';
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          <Image
            className="brand-mark"
            src={(process.env.NEXT_PUBLIC_BASE_PATH || '') + '/favicon.svg'}
            width={32}
            height={32}
            alt=""
            unoptimized
          />
          <span>
            Qwen <span className="brand-light">MM</span> Plugins
          </span>
        </Link>
        <search className="header-doc-search">
          <form action={(process.env.NEXT_PUBLIC_BASE_PATH || '') + '/'}>
            <Search size={16} />
            <input
              name="q"
              aria-label="Search plugins and tools"
              placeholder="Search plugins and tools…"
            />
          </form>
        </search>
        <nav aria-label="Main navigation">
          <Link
            className={section === 'plugins' ? 'nav-active' : undefined}
            aria-current={section === 'plugins' ? 'page' : undefined}
            href="/"
          >
            Plugins
          </Link>
          <Link
            className={section === 'docs' ? 'nav-active' : undefined}
            aria-current={section === 'docs' ? 'page' : undefined}
            href="/docs/"
          >
            Docs
          </Link>
          <a
            className="github-link"
            aria-label="Plugin repository on GitHub"
            href="https://github.com/QwenLM/Qwen-MM-Plugins"
          >
            <CodeXml size={18} />
            <span>GitHub</span>
          </a>
          <ThemeToggle />
        </nav>
      </div>
      <div className="documentation-bar">
        <BookOpen size={16} />
        <Link href="/docs/">Qwen MM Plugins documentation</Link>
        <span>{source.ref}</span>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>
        Qwen MM Plugins <span className="footer-dot">·</span> Open-source
        multimodal capabilities
      </span>
      <a href="https://github.com/QwenLM/qwen-mm-plugins-hub">
        Hub source <ArrowUpRight size={13} />
      </a>
      <a href="https://github.com/QwenLM/Qwen-MM-Plugins/blob/main/LICENSE">
        Apache 2.0
      </a>
    </footer>
  );
}
