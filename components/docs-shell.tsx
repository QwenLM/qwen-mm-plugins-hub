'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from '@/components/static-link';
import type { PluginSection } from '@/lib/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

export type DocNavPlugin = { id: string; title: string; category: string };

function DocumentationNavigation({
  plugins,
  current,
  cookbookUrl,
  section,
  hasTools,
}: {
  plugins: DocNavPlugin[];
  current: string;
  cookbookUrl: string;
  section: PluginSection | 'cookbook';
  hasTools: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const categories = [...new Set(plugins.map((p) => p.category))];
  const currentPlugin = plugins.find((p) => p.id === current)!;
  const overview = `/plugins/${current}/`;
  const localLink = (hash: string) =>
    section === 'cookbook' ? overview + hash : hash;
  const groups = [
    {
      label: 'Get started',
      links: [
        { label: 'Overview', href: overview, section: 'overview' },
        {
          label: 'Installation',
          href: localLink('#install'),
          section: 'install',
        },
        { label: 'Cookbook', href: cookbookUrl, section: 'cookbook' },
      ],
    },
    {
      label: 'Reference',
      links: [
        { label: 'Skill', href: localLink('#skill'), section: 'skill' },
        ...(hasTools
          ? [{ label: 'Tools', href: localLink('#tools'), section: 'tools' }]
          : []),
        { label: 'Bundled files', href: localLink('#files'), section: 'files' },
      ],
    },
  ];
  return (
    <Sidebar className="docs-navigation">
      <SidebarHeader>
        <Link
          href={overview}
          className="docs-project-title"
          onClick={() => setOpenMobile(false)}
        >
          {currentPlugin.title}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Plugin documentation" data-plugin-navigation={current}>
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.links.map((link) => (
                  <SidebarMenuItem key={link.section}>
                    <SidebarMenuButton
                      isActive={section === link.section}
                      render={
                        <Link
                          href={link.href}
                          aria-current={
                            section === link.section
                              ? section === 'overview' || section === 'cookbook'
                                ? 'page'
                                : 'location'
                              : undefined
                          }
                        />
                      }
                      onClick={() => setOpenMobile(false)}
                    >
                      {link.label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))}
        </nav>
        <nav aria-label="Other plugins" className="other-plugin-navigation">
          <h2>Other plugins</h2>
          {categories.map(
            (category) =>
              plugins.some(
                (p) => p.category === category && p.id !== current,
              ) && (
                <SidebarGroup key={category}>
                  <SidebarGroupLabel>{category}</SidebarGroupLabel>
                  <SidebarMenu>
                    {plugins
                      .filter(
                        (p) => p.category === category && p.id !== current,
                      )
                      .map((p) => (
                        <SidebarMenuItem key={p.id}>
                          <SidebarMenuButton
                            render={<Link href={`/plugins/${p.id}/`} />}
                            onClick={() => setOpenMobile(false)}
                          >
                            {p.title}
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                  </SidebarMenu>
                </SidebarGroup>
              ),
          )}
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}

export function DocsShell({
  children,
  plugins,
  current,
  cookbookUrl,
  section,
  hasTools,
}: {
  children: ReactNode;
  plugins: DocNavPlugin[];
  current: string;
  cookbookUrl: string;
  section: PluginSection | 'cookbook';
  hasTools: boolean;
}) {
  return (
    <SidebarProvider
      className="docs-provider"
      style={{ '--sidebar-width': '270px' } as CSSProperties}
    >
      <DocumentationNavigation
        plugins={plugins}
        current={current}
        cookbookUrl={cookbookUrl}
        section={section}
        hasTools={hasTools}
      />
      <div className="docs-workspace">
        <div className="docs-mobile-navigation">
          <SidebarTrigger />
          <span>Documentation menu</span>
        </div>
        {children}
      </div>
    </SidebarProvider>
  );
}
