'use client';

import { useState, useEffect } from 'react';
import Link from '@/components/static-link';
import {
  Search,
  SlidersHorizontal,
  ArrowUpRight,
  BookOpen,
  Braces,
  Layers3,
  X,
  Users,
} from 'lucide-react';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { SiteHeader, SiteFooter } from '@/components/site-header';
import { ContributorAvatar } from '@/components/contributor-avatar';
import {
  filterPlugins,
  type PluginSummary,
  type Contributor,
} from '@/lib/catalog';

export function Catalog({
  plugins,
  contributors,
  categories,
}: {
  plugins: PluginSummary[];
  contributors: Record<string, Contributor>;
  categories: string[];
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [contributor, setContributor] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState('default');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allTagsOpen, setAllTagsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      setQuery(params.get('q') || '');
      setCategory(params.get('category') || '');
      setContributor(params.get('contributor') || '');
      setTags(params.getAll('tag'));
      setSort(
        ['name', 'tools'].includes(params.get('sort') || '')
          ? params.get('sort')!
          : 'default',
      );
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (contributor) params.set('contributor', contributor);
    if (sort !== 'default') params.set('sort', sort);
    tags.forEach((t) => params.append('tag', t));
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (params.size ? '?' + params : ''),
    );
  }, [query, category, contributor, tags, sort, ready]);
  const filtered = filterPlugins(
    plugins,
    query,
    category,
    contributor,
    tags,
  ).sort((a, b) =>
    sort === 'name'
      ? a.title.localeCompare(b.title)
      : sort === 'tools'
        ? b.toolCount - a.toolCount
        : a.order - b.order,
  );
  const tagCounts = new Map<string, number>();
  plugins.forEach((p) =>
    p.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) || 0) + 1)),
  );
  const allTags = [...tagCounts.keys()].sort(
    (a, b) => tagCounts.get(b)! - tagCounts.get(a)! || a.localeCompare(b),
  );
  const visibleTags = allTags.filter(
    (t, i) => allTagsOpen || i < 6 || tags.includes(t),
  );
  const active = Boolean(query || category || contributor || tags.length);
  function reset() {
    setQuery('');
    setCategory('');
    setContributor('');
    setTags([]);
  }
  function toggleTag(t: string) {
    setTags((current) =>
      current.includes(t) ? current.filter((x) => x !== t) : [...current, t],
    );
  }
  const filterContent = (location: string) => (
    <>
      <div className="filter-heading">
        <span>
          <SlidersHorizontal size={16} />
          Filters
        </span>
        {active && <button onClick={reset}>Reset</button>}
      </div>
      <section className="filter-section">
        <h2>Capabilities</h2>
        <button
          aria-pressed={!category}
          onClick={() => setCategory('')}
          className={`category-option ${!category ? 'selected' : ''}`}
        >
          <span>
            <Layers3 size={15} />
            All plugins
          </span>
          <small>{plugins.length}</small>
        </button>
        {categories.map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            onClick={() => setCategory(c === category ? '' : c)}
            className={`category-option ${category === c ? 'selected' : ''}`}
          >
            <span>{c}</span>
            <small>{plugins.filter((p) => p.category === c).length}</small>
          </button>
        ))}
      </section>
      <section className="filter-section">
        <h2>
          <Users size={15} />
          Contributors
        </h2>
        {Object.entries(contributors).map(([id, c]) => (
          <label className="contributor-option" key={id}>
            <Checkbox
              checked={contributor === id}
              onCheckedChange={(checked) => setContributor(checked ? id : '')}
              aria-label={c.name}
            />
            <ContributorAvatar contributor={c} small />
            <span>{c.name}</span>
            <small>
              {plugins.filter((p) => p.contributors.includes(id)).length}
            </small>
          </label>
        ))}
      </section>
      <section className="filter-section">
        <h2>Tags</h2>
        <div className="filter-tags" id={`tag-filters-${location}`}>
          {visibleTags.map((t) => (
            <button
              key={t}
              className={`tag ${tags.includes(t) ? 'tag-active' : ''}`}
              onClick={() => toggleTag(t)}
              aria-pressed={tags.includes(t)}
            >
              {t}
              {tags.includes(t) && <X size={11} />}
            </button>
          ))}
        </div>
        {allTags.length > 6 && (
          <button
            className="more-tags"
            onClick={() => setAllTagsOpen(!allTagsOpen)}
            aria-expanded={allTagsOpen}
            aria-controls={`tag-filters-${location}`}
          >
            {allTagsOpen ? 'Fewer tags' : `All ${allTags.length} tags`}
          </button>
        )}
      </section>
      <Link className="contribute-note" href="/docs/how-to-add-new-capability/">
        <span>
          Contribute a plugin <ArrowUpRight size={14} />
        </span>
      </Link>
    </>
  );
  return (
    <>
      <a className="skip-link" href="#plugins">
        Skip to plugins
      </a>
      <SiteHeader />
      <main className="catalog-shell">
        <div className="catalog-layout">
          <aside className="filter-sidebar" aria-label="Filter plugins">
            {filterContent('desktop')}
          </aside>
          <section
            id="plugins"
            className="plugin-results"
            aria-label="Plugin directory"
          >
            <div className="directory-toolbar">
              <div className="search-field">
                <Search size={18} />
                <input
                  aria-label="Search plugins and tools"
                  placeholder="Search plugins, capabilities, or tools…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button
                    aria-label="Clear search"
                    onClick={() => setQuery('')}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger className="mobile-filter-button">
                  <SlidersHorizontal size={18} />
                  Filters
                </SheetTrigger>
                <SheetContent side="left" className="filter-panel">
                  <SheetTitle className="sr-only">Filter plugins</SheetTitle>
                  {filterContent('mobile')}
                  <div className="filter-panel-footer">
                    <button onClick={() => setFiltersOpen(false)}>
                      Show {filtered.length} plugins
                    </button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <div className="results-heading">
              <div>
                <h1>
                  Plugins <span>{filtered.length}</span>
                </h1>
              </div>
              <Select
                value={sort}
                onValueChange={(value) => setSort(value || 'default')}
              >
                <SelectTrigger
                  aria-label="Sort plugins"
                  className="sort-select"
                >
                  <SelectValue>
                    {sort === 'tools'
                      ? 'Most tools'
                      : sort === 'name'
                        ? 'Name: A–Z'
                        : 'Default order'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default order</SelectItem>
                  <SelectItem value="name">Name: A–Z</SelectItem>
                  <SelectItem value="tools">Most tools</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="catalog-summary">
              Explore multimodal skills, tools, and real examples.{' '}
              <Link href="/docs/">
                Installation guide <ArrowUpRight size={13} />
              </Link>
            </p>
            {active && (
              <div className="active-filters">
                {category && (
                  <button onClick={() => setCategory('')}>
                    {category}
                    <X size={12} />
                  </button>
                )}
                {contributor && (
                  <button onClick={() => setContributor('')}>
                    {contributors[contributor]?.name || contributor}
                    <X size={12} />
                  </button>
                )}
                {tags.map((t) => (
                  <button key={t} onClick={() => toggleTag(t)}>
                    {t}
                    <X size={12} />
                  </button>
                ))}
                <button className="clear-all" onClick={reset}>
                  Clear all
                </button>
              </div>
            )}
            <div aria-live="polite" className="sr-only">
              {filtered.length} plugins found
            </div>
            <div className="plugin-grid">
              {filtered.map((p) => (
                <article key={p.id} className="plugin-card">
                  <a
                    href={contributors[p.contributors[0]].url}
                    className="card-avatar-link"
                    aria-label={`${contributors[p.contributors[0]].name} on GitHub`}
                  >
                    <ContributorAvatar
                      contributor={contributors[p.contributors[0]]}
                    />
                  </a>
                  <Link href={`/plugins/${p.id}/`} className="card-title">
                    <h2>{p.title}</h2>
                  </Link>
                  <div className="card-byline">
                    {p.contributors.map((c) => (
                      <a key={c} href={contributors[c].url}>
                        {contributors[c].name}
                      </a>
                    ))}
                    <span>·</span>
                    <span>{p.category}</span>
                  </div>
                  <p className="card-description">
                    {p.description.replace(/^Qwen-MM-Plugins\s+[^—]+—\s*/i, '')}
                  </p>
                  <div className="card-tags">
                    {p.tags.slice(0, 2).map((t) => (
                      <button
                        className="tag"
                        key={t}
                        onClick={() => toggleTag(t)}
                        aria-pressed={tags.includes(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="card-bottom">
                    <Link
                      className="card-content-link"
                      href={`/plugins/${p.id}/#skill`}
                    >
                      <BookOpen size={14} />
                      Skill
                    </Link>
                    {p.toolCount > 0 && (
                      <Link
                        className="card-content-link"
                        href={`/plugins/${p.id}/#tools`}
                      >
                        <Braces size={14} />
                        Tools
                      </Link>
                    )}
                    <Link className="card-content-link" href={p.cookbookUrl}>
                      <BookOpen size={14} />
                      Cookbook
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <div className="empty-state">
                <Search size={30} />
                <h2>No plugins found</h2>
                <p>Try a different term or remove a filter.</p>
                <button onClick={reset}>Clear filters</button>
              </div>
            )}
            <div className="directory-end">
              <a href="https://github.com/QwenLM/Qwen-MM-Plugins">
                Explore the repository <ArrowUpRight size={13} />
              </a>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
