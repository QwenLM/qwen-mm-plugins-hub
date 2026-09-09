import type { Metadata } from 'next';
import { Source_Sans_3, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import './docs-theme.css';
import { themeScript } from '@/lib/theme';

const geistSans = Source_Sans_3({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = IBM_Plex_Mono({
  weight: ['400', '500', '600'],
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  icons: { icon: (process.env.SITE_BASE_PATH || '') + '/favicon.svg' },
  title: 'Qwen MM Plugins — Skills & tools for multimodal agents',
  description:
    'Explore Qwen multimodal plugins by contributor and capability. Read Skills, inspect MCP tool definitions, and find the right tools for your agent.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
