import type { AnchorHTMLAttributes } from 'react';

/** Native document navigation works on any static host, without an RSC server. */
export default function StaticLink({
  href = '/',
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return (
    <a
      href={href.startsWith('/') && !href.startsWith('//') ? base + href : href}
      {...props}
    >
      {children}
    </a>
  );
}
