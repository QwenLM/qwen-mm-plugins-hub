import Link from '@/components/static-link';
import { SiteHeader } from '@/components/site-header';
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="empty-state">
        <h1>Page not found</h1>
        <p>
          This page may have moved. Explore the plugins or open the
          documentation.
        </p>
        <Link className="documentation-link" href="/">
          Browse plugins →
        </Link>
        <Link className="documentation-link" href="/docs/">
          Read the docs →
        </Link>
      </main>
    </>
  );
}
