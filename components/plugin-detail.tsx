'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from '@/components/static-link';
import {
  ArrowUpRight,
  BookOpen,
  Braces,
  CodeXml,
  FileText,
  Search,
  Terminal,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { SiteHeader, SiteFooter } from '@/components/site-header';
import { ContributorAvatar } from '@/components/contributor-avatar';
import { CopyButton } from '@/components/copy-button';
import { SkillFiles } from '@/components/skill-files';
import { TokenEstimate } from '@/components/token-estimate';
import { DocsShell, type DocNavPlugin } from '@/components/docs-shell';
import { DocBreadcrumb } from '@/components/doc-breadcrumb';
import {
  sectionFromHash,
  tabForSection,
  type PluginSection,
  type PluginTab,
} from '@/lib/navigation';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  schemaType,
  formatTokens,
  skillExcerpt,
  type Plugin,
  type Contributor,
  type Tool,
  type TokenizerInfo,
} from '@/lib/catalog';

const installCommand =
  'curl -fsSL https://raw.githubusercontent.com/QwenLM/Qwen-MM-Plugins/main/install.sh | bash';

function ToolDefinition({
  tool,
  initialOpen,
  tokenizerLabel,
}: {
  tool: Tool;
  initialOpen: boolean;
  tokenizerLabel: string;
}) {
  const [open, setOpen] = useState(initialOpen);
  const schema = tool.inputSchema;
  const fields = Object.entries(schema.properties || {});
  const definition = tool.definitionText;
  return (
    <details
      id={`tool-${tool.name}`}
      className="tool-definition"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        <Braces size={17} />
        <code>{tool.name}</code>
        <span>{fields.length} parameters</span>
        <ChevronDown className="tool-chevron" size={17} />
      </summary>
      <div className="tool-body">
        <p>{tool.description}</p>
        <div className="tool-actions">
          <span
            className="tool-token-count"
            title={`${tokenizerLabel} tokens for the copied definition JSON`}
          >
            Definition: {formatTokens(tool.tokenCount)} tokens
          </span>
          <a href={tool.sourceUrl}>
            View source <ArrowUpRight size={13} />
          </a>
          <a href={`#tool-${tool.name}`} onClick={() => setOpen(true)}>
            Permalink
          </a>
          <CopyButton text={definition} label="Copy definition" />
        </div>
        {fields.length > 0 ? (
          <Table className="parameter-table">
            <TableHeader>
              <TableRow>
                <TableHead>Parameter</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map(([name, field]) => (
                <TableRow key={name}>
                  <TableCell>
                    <code>{name}</code>
                    {schema.required?.includes(name) ? (
                      <span className="required-label">required</span>
                    ) : (
                      <span className="optional-label">optional</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="type-code">{schemaType(field)}</code>
                  </TableCell>
                  <TableCell>
                    <p>{field.description || '—'}</p>
                    {Object.hasOwn(field, 'default') && (
                      <div className="field-constraint">
                        Default: <code>{JSON.stringify(field.default)}</code>
                      </div>
                    )}
                    {field.enum && (
                      <div className="field-constraint">
                        Values:{' '}
                        <code>
                          {field.enum.map((v) => JSON.stringify(v)).join(' · ')}
                        </code>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="no-parameters">This tool takes no parameters.</div>
        )}
        <details className="json-disclosure">
          <summary>Full JSON definition</summary>
          <pre>{definition}</pre>
        </details>
      </div>
    </details>
  );
}

export function PluginDetail({
  plugin: p,
  contributors,
  skillPreview,
  skillFullPreview,
  prerequisitesPreview,
  navigation,
  tokenizer,
}: {
  plugin: Plugin;
  contributors: Record<string, Contributor>;
  skillPreview: ReactNode;
  skillFullPreview: ReactNode;
  prerequisitesPreview: ReactNode;
  navigation: DocNavPlugin[];
  tokenizer: TokenizerInfo;
}) {
  const [tab, setTab] = useState<PluginTab>('skill');
  const [section, setSection] = useState<PluginSection>('overview');
  const [skillView, setSkillView] = useState('preview');
  const [skillExpanded, setSkillExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [linkedTool, setLinkedTool] = useState('');
  const [toolLinkRevision, setToolLinkRevision] = useState(0);
  useEffect(() => {
    let scrollTimer: number | undefined;
    function fromHash(event?: Event) {
      let hash = window.location.hash.slice(1);
      try {
        hash = decodeURIComponent(hash);
      } catch {
        /* Preserve malformed fragments. */
      }
      if (hash.startsWith('skill-section-')) {
        setSkillExpanded(true);
        setSkillView('preview');
      }
      const next = sectionFromHash(hash);
      setSection(next);
      setTab((current) => tabForSection(next, current));
      if (next !== 'tokens')
        setLinkedTool(hash.startsWith('tool-') ? hash : '');
      if (hash.startsWith('tool-')) {
        setQuery('');
        setToolLinkRevision((revision) => revision + 1);
      }
      window.clearTimeout(scrollTimer);
      if (hash || event)
        scrollTimer = window.setTimeout(
          () =>
            document
              .getElementById(hash || 'overview')
              ?.scrollIntoView({ block: 'start' }),
          100,
        );
    }
    // A repeated fragment click does not emit hashchange. Reapply it so a
    // collapsed or filtered tool can still be opened by its permalink.
    function repeatAnchor(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        anchor instanceof HTMLAnchorElement &&
        (!anchor.target || anchor.target === '_self') &&
        !anchor.hasAttribute('download') &&
        anchor.href === window.location.href
      )
        fromHash(event);
    }
    fromHash();
    window.addEventListener('hashchange', fromHash);
    document.addEventListener('click', repeatAnchor);
    return () => {
      window.clearTimeout(scrollTimer);
      window.removeEventListener('hashchange', fromHash);
      document.removeEventListener('click', repeatAnchor);
    };
  }, []);
  const tools = p.tools.filter((t) =>
    `${t.name} ${t.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const excerpt = skillExcerpt(
    skillView === 'raw' ? p.skill.raw : p.skill.markdown,
  );
  return (
    <>
      <a className="skip-link" href="#plugin-content">
        Skip to plugin content
      </a>
      <SiteHeader />
      <DocsShell
        plugins={navigation}
        current={p.id}
        cookbookUrl={p.cookbookUrl}
        section={section}
        hasTools={p.tools.length > 0}
      >
        <main className="detail-shell doc-detail">
          <div className="detail-layout">
            <div className="docs-article">
              <DocBreadcrumb id={p.id} title={p.title} />
              <div className="plugin-hero" id="overview">
                <div className="plugin-hero-title">
                  <div className="hero-byline">
                    {p.contributors.map((c) => (
                      <a key={c} href={contributors[c].url}>
                        <ContributorAvatar
                          contributor={contributors[c]}
                          small
                        />
                        {contributors[c].name}
                      </a>
                    ))}
                    <span>/</span>
                    <span>{p.id}</span>
                  </div>
                  <h1>{p.title}</h1>
                </div>
                <div
                  className="plugin-resource-actions"
                  aria-label="Plugin resources"
                >
                  <Link
                    className="cookbook-button"
                    href={p.cookbookUrl}
                    title={`${p.title}: setup and usage examples`}
                  >
                    <BookOpen size={16} />
                    <span>Cookbook</span>
                    <ArrowRight size={14} />
                  </Link>
                  <a
                    className="source-button"
                    href={p.source.url + p.source.path}
                  >
                    <CodeXml size={16} />
                    <span>Source</span>
                    <ArrowUpRight size={14} />
                  </a>
                </div>
              </div>
              <p className="plugin-description">
                {p.description.replace(/^Qwen-MM-Plugins\s+[^—]+—\s*/i, '')}
              </p>
              <div className="detail-tags">
                {p.tags.slice(0, 3).map((t) => (
                  <Link
                    className="tag"
                    key={t}
                    href={`/?tag=${encodeURIComponent(t)}`}
                  >
                    {t}
                  </Link>
                ))}
              </div>
              <TokenEstimate estimate={p.tokenEstimate} tokenizer={tokenizer} />
              <section id="plugin-content" className="detail-main">
                <Tabs
                  value={tab}
                  onValueChange={(value) => {
                    const next = sectionFromHash(String(value));
                    setSection(next);
                    setTab((current) => tabForSection(next, current));
                    window.location.hash = String(value);
                  }}
                >
                  <TabsList variant="line" className="detail-tabs">
                    <TabsTrigger value="skill">
                      <BookOpen size={16} />
                      <span>Skill</span>
                    </TabsTrigger>
                    <TabsTrigger value="tools">
                      <Braces size={16} />
                      <span>Tools</span>
                      {p.tools.length > 0 && (
                        <span className="tab-count">{p.tools.length}</span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="install">
                      <Terminal size={16} />
                      <span>Install</span>
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="skill" id="skill">
                    <div className="skill-file-bar">
                      <span>
                        <FileText size={15} />
                        SKILL.md
                      </span>
                      <div className="skill-bar-actions">
                        <a href="#skill" className="section-permalink">
                          Permalink
                        </a>
                        <Tabs
                          value={skillView}
                          onValueChange={(v) => setSkillView(String(v))}
                        >
                          <TabsList className="view-switch">
                            <TabsTrigger value="preview">Preview</TabsTrigger>
                            <TabsTrigger value="raw">Raw</TabsTrigger>
                          </TabsList>
                        </Tabs>
                        <CopyButton text={p.skill.raw} label="Copy Skill" />
                        <a
                          className="skill-source-link"
                          aria-label="View Skill on GitHub"
                          title="View Skill on GitHub"
                          href={p.skill.sourceUrl}
                        >
                          <ArrowUpRight size={17} />
                        </a>
                      </div>
                    </div>
                    <Collapsible
                      open={skillExpanded}
                      onOpenChange={setSkillExpanded}
                    >
                      {!skillExpanded && (
                        <div id="skill-excerpt">
                          {skillView === 'preview' ? (
                            skillPreview
                          ) : (
                            <pre className="raw-skill">{excerpt.text}</pre>
                          )}
                        </div>
                      )}
                      <CollapsibleContent id="skill-full">
                        {skillView === 'preview' ? (
                          skillFullPreview
                        ) : (
                          <pre className="raw-skill">{p.skill.raw}</pre>
                        )}
                      </CollapsibleContent>
                      {excerpt.truncated && (
                        <div className="skill-preview-footer">
                          <span>
                            {skillExpanded
                              ? `All ${excerpt.lineCount} lines`
                              : `50 of ${excerpt.lineCount} lines`}
                          </span>
                          <CollapsibleTrigger
                            className="skill-expand-button"
                            onClick={() => {
                              if (skillExpanded)
                                document
                                  .getElementById('plugin-content')
                                  ?.scrollIntoView({ block: 'start' });
                            }}
                          >
                            {skillExpanded
                              ? 'Show less'
                              : `Show all ${excerpt.lineCount} lines`}{' '}
                            <ChevronDown size={15} />
                          </CollapsibleTrigger>
                        </div>
                      )}
                    </Collapsible>
                    <SkillFiles
                      files={p.skill.files}
                      directoryUrl={p.skill.directoryUrl}
                    />
                  </TabsContent>
                  <TabsContent value="tools" id="tools">
                    <div className="tools-heading">
                      <div className="section-link-heading">
                        <h2>Tool definitions</h2>
                        <a href="#tools">Permalink</a>
                      </div>
                    </div>
                    {p.tools.length ? (
                      <>
                        <div className="search-field tool-search">
                          <Search size={17} />
                          <input
                            aria-label="Search tool definitions"
                            placeholder="Find a tool…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </div>
                        <div className="tools-count" aria-live="polite">
                          {query
                            ? `${tools.length} of ${p.tools.length}`
                            : p.tools.length}{' '}
                          tools
                        </div>
                        {tools.map((tool, i) => (
                          <ToolDefinition
                            key={tool.name + linkedTool + toolLinkRevision}
                            tool={tool}
                            tokenizerLabel={tokenizer.label}
                            initialOpen={
                              linkedTool === `tool-${tool.name}` ||
                              (!linkedTool && i === 0)
                            }
                          />
                        ))}
                        {!tools.length && (
                          <p className="empty-tool-search">
                            No tools match “{query}”.{' '}
                            <button onClick={() => setQuery('')}>
                              Clear search
                            </button>
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="skill-only-note">
                        <BookOpen size={28} />
                        <h3>No MCP tools</h3>
                        <p>
                          This plugin provides a Skill and bundled resources.
                        </p>
                        <a className="skill-only-action" href="#skill">
                          Read the Skill <ArrowRight size={16} />
                        </a>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="install" id="install">
                    <div className="install-content">
                      <h2>Installation</h2>
                      <p>
                        Install the stable release, then select your agent and{' '}
                        <strong>{p.id}</strong>.
                      </p>
                      <div className="install-command">
                        <div>
                          <span>Terminal</span>
                          <CopyButton text={installCommand} />
                        </div>
                        <pre>{installCommand}</pre>
                      </div>
                      <section className="install-version-note">
                        <p className="install-version-summary">
                          {p.release && (
                            <span>
                              Installer release:{' '}
                              <a href={p.release.url}>v{p.release.version}</a>
                            </span>
                          )}
                          <span>
                            Documentation:{' '}
                            <a
                              href={`${p.source.repository}/commit/${p.source.commit}`}
                            >
                              {p.channel} @ {p.source.commit.slice(0, 7)}
                            </a>
                          </span>
                        </p>
                        <details>
                          <summary>Version details</summary>
                          <p>
                            This page follows {p.channel}, plugin v{p.version}.
                            The installer uses published releases, which may
                            differ.
                          </p>
                          {!p.release && (
                            <p>
                              To try this snapshot, check out commit{' '}
                              <code>{p.source.commit.slice(0, 7)}</code> in a
                              dedicated clone and follow the{' '}
                              <Link href="/docs/local-development/">
                                local development guide
                              </Link>
                              .
                            </p>
                          )}
                        </details>
                      </section>
                      <Link className="documentation-link" href="/docs/">
                        Installation guide <ArrowRight size={15} />
                      </Link>
                      {p.requirements.length > 0 && (
                        <>
                          <h3>System dependencies</h3>
                          <p>Required by the listed features.</p>
                          <ul className="system-requirements">
                            {p.requirements.map((r) => (
                              <li key={r.label}>
                                <strong>{r.label}</strong>
                                <code>{r.tools.join(', ')}</code>
                                <span>{r.hint}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {prerequisitesPreview && (
                        <section className="install-prerequisites">
                          <div className="section-link-heading">
                            <h3>Skill prerequisites</h3>
                            <a href={p.skill.sourceUrl}>
                              View source <ArrowUpRight size={14} />
                            </a>
                          </div>
                          {prerequisitesPreview}
                        </section>
                      )}
                      {p.kind === 'Skill only' && prerequisitesPreview && (
                        <p>
                          Install the runtime dependencies above before using
                          this Skill.
                        </p>
                      )}
                      <p>For provider keys and examples, see the cookbook.</p>
                      <Link className="documentation-link" href={p.cookbookUrl}>
                        Open cookbook <ArrowRight size={15} />
                      </Link>
                    </div>
                  </TabsContent>
                </Tabs>
              </section>
            </div>
            <aside className="detail-sidebar">
              <nav className="docs-toc" aria-label="On this page">
                <h2>On this page</h2>
                <a
                  href="#skill"
                  aria-current={section === 'skill' ? 'location' : undefined}
                >
                  Skill
                </a>
                <a
                  href="#files"
                  aria-current={section === 'files' ? 'location' : undefined}
                >
                  Bundled files
                </a>
                <a
                  href="#tools"
                  aria-current={section === 'tools' ? 'location' : undefined}
                >
                  Tools {p.tools.length > 0 && <span>{p.tools.length}</span>}
                </a>
                {tab === 'tools' && p.tools.length > 0 && (
                  <div className="docs-tool-toc">
                    {p.tools.map((tool) => (
                      <a key={tool.name} href={`#tool-${tool.name}`}>
                        {tool.name}
                      </a>
                    ))}
                  </div>
                )}
                <a
                  href="#install"
                  aria-current={section === 'install' ? 'location' : undefined}
                >
                  Installation
                </a>
                <a
                  href="#tokens"
                  aria-current={section === 'tokens' ? 'location' : undefined}
                >
                  Token estimates
                </a>
              </nav>
              <section>
                <h2>Plugin details</h2>
                <dl>
                  <div>
                    <dt>Contributor</dt>
                    <dd>
                      {p.contributors.map((c) => (
                        <a key={c} href={contributors[c]?.url}>
                          {contributors[c]?.name}
                        </a>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>Capability</dt>
                    <dd>{p.category}</dd>
                  </div>
                  <div>
                    <dt>Includes</dt>
                    <dd>
                      <a href="#skill">
                        {p.tools.length ? '1 Skill' : 'Skill only'}
                      </a>
                      {p.tools.length > 0 && (
                        <>
                          {' '}
                          · <a href="#tools">{p.tools.length} tools</a>
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>License</dt>
                    <dd>Apache 2.0</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      <a
                        href={`${p.source.repository}/commit/${p.source.commit}`}
                      >
                        {p.channel} @ {p.source.commit.slice(0, 7)}
                      </a>
                    </dd>
                  </div>
                </dl>
              </section>
              <section>
                <h2>Resources</h2>
                <Link className="resource-link" href={p.cookbookUrl}>
                  <BookOpen size={15} />
                  Cookbook
                  <ArrowRight size={13} />
                </Link>
                <a className="resource-link" href={p.skill.sourceUrl}>
                  <FileText size={15} />
                  Skill source
                  <ArrowUpRight size={13} />
                </a>
                <a className="resource-link" href="#files">
                  <FileText size={15} />
                  Skill files <span>{p.skill.files.length}</span>
                </a>
                <a
                  className="resource-link"
                  href={p.source.url + p.source.path}
                >
                  <CodeXml size={15} />
                  Plugin source
                  <ArrowUpRight size={13} />
                </a>
              </section>
            </aside>
          </div>
        </main>
      </DocsShell>
      <SiteFooter />
    </>
  );
}
