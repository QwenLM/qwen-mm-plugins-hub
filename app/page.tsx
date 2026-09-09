import catalog from '@/data/catalog.json';
import { Catalog } from '@/components/catalog';
import type { PluginSummary } from '@/lib/catalog';

export default function Home() {
  const plugins: PluginSummary[] = catalog.plugins.map(
    ({
      skill: _skill,
      tools,
      moduleDocstring: _moduleDocstring,
      requirements: _requirements,
      ...plugin
    }) => ({
      ...plugin,
      toolCount: tools.length,
      toolNames: tools.map((t) => t.name),
    }),
  );
  const categories = [
    ...new Set([...catalog.categories, ...plugins.map((p) => p.category)]),
  ].filter((c) => plugins.some((p) => p.category === c));
  return (
    <Catalog
      plugins={plugins}
      contributors={catalog.contributors}
      categories={categories}
    />
  );
}
