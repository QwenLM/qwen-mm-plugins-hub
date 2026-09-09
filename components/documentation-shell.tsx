'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from '@/components/static-link';
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

export type DocumentationGroup = {
  label: string;
  links: { label: string; href: string; slug: string }[];
};

function Navigation({
  groups,
  current,
}: {
  groups: DocumentationGroup[];
  current: string;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar className="docs-navigation">
      <SidebarHeader>
        <Link
          href="/docs/"
          className="docs-project-title"
          onClick={() => setOpenMobile(false)}
        >
          Documentation
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Documentation" data-documentation-navigation={current}>
          {groups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarMenu>
                {group.links.map((link) => (
                  <SidebarMenuItem key={link.slug}>
                    <SidebarMenuButton
                      isActive={current === link.slug}
                      render={
                        <Link
                          href={link.href}
                          aria-current={
                            current === link.slug ? 'page' : undefined
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
      </SidebarContent>
    </Sidebar>
  );
}

export function DocumentationShell({
  children,
  groups,
  current,
}: {
  children: ReactNode;
  groups: DocumentationGroup[];
  current: string;
}) {
  return (
    <SidebarProvider
      className="docs-provider"
      style={{ '--sidebar-width': '270px' } as CSSProperties}
    >
      <Navigation groups={groups} current={current} />
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
