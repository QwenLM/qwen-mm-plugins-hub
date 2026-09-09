import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filterPlugins,
  formatTokens,
  schemaType,
  skillExcerpt,
  skillFileTree,
} from '../lib/catalog.ts';

const catalog = JSON.parse(
  readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'),
);
const source = JSON.parse(
  readFileSync(new URL('../source.config.json', import.meta.url), 'utf8'),
);
const plugins = catalog.plugins.map((p) => ({
  ...p,
  toolCount: p.tools.length,
  toolNames: p.tools.map((t) => t.name),
}));

test('Skill previews show 50 source lines without modifying the full text', () => {
  const text =
    Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
  const excerpt = skillExcerpt(text);
  assert.equal(excerpt.lineCount, 80);
  assert.equal(excerpt.text.split('\n').length, 50);
  assert.equal(excerpt.text.split('\n').at(-1), 'line 50');
  assert.equal(excerpt.truncated, true);
  assert.equal(skillExcerpt('short\n').truncated, false);
  assert.equal(skillExcerpt(Array(50).fill('x').join('\n')).truncated, false);
});

test('Skill file hierarchy preserves nested files and immutable source links', () => {
  for (const p of plugins) {
    assert(p.skill.files.some((f) => f.path === 'SKILL.md'));
    assert.equal(
      new Set(p.skill.files.map((f) => f.path)).size,
      p.skill.files.length,
    );
    assert(p.skill.directoryUrl.includes(`/tree/${p.source.commit}/`));
    const leaves = [];
    function visit(nodes) {
      for (const node of nodes) {
        if (node.file) leaves.push(node.file);
        else visit(node.children);
      }
    }
    visit(skillFileTree(p.skill.files));
    assert.equal(leaves.length, p.skill.files.length);
    for (const file of leaves) {
      assert(
        !file.path.startsWith('/') && !file.path.split('/').includes('..'),
      );
      assert(
        file.sourceUrl.includes(
          `/blob/${p.source.commit}/${p.source.path}/skill/`,
        ),
      );
    }
  }
  const edu = plugins.find((p) => p.id === 'edu-agent');
  const tree = skillFileTree(edu.skill.files);
  assert(tree.some((n) => n.name === 'references' && n.children.length));
  const assets = tree.find((n) => n.name === 'assets');
  assert(
    assets.children
      .find((n) => n.name === 'components')
      .children.some((n) => n.children.length),
  );
});

test('development snapshots do not advertise unreleased tags, and requirements retain install hints', () => {
  for (const p of plugins) {
    if (source.ref === 'main') {
      assert.equal(
        p.release.tag,
        `qwen-mm-plugins-${p.id}-v${p.release.version}`,
      );
      assert(p.release.url.endsWith(`/tree/${p.release.tag}`));
    } else assert.equal(p.release, null);
    for (const requirement of p.requirements) {
      assert(requirement.label && requirement.tools.length && requirement.hint);
    }
  }
  const edu = plugins.find((p) => p.id === 'edu-agent');
  assert(edu.skill.prerequisites.includes('NOT** auto-installed'));
  assert(edu.skill.prerequisites.includes('DASHSCOPE_API_KEY'));
  assert(!edu.skill.prerequisites.includes('## Pipeline Overview'));
});

test('all records use one public upstream snapshot and have a complete Skill', () => {
  assert.equal(new Set(plugins.map((p) => p.source.commit)).size, 1);
  assert.equal(new Set(plugins.map((p) => p.id)).size, plugins.length);
  assert(!plugins.some((p) => p.id === 'example'));
  for (const p of plugins) {
    assert.equal(p.channel, source.ref);
    assert(p.skill.raw.startsWith('---\n'));
    assert(p.skill.markdown.length > 50);
    assert(p.skill.sourceUrl.includes(p.source.commit));
    assert.equal(p.cookbookUrl, `/plugins/${p.id}/cookbook/`);
    assert(p.contributors.every((c) => catalog.contributors[c]));
    assert.equal(new Set(p.tools.map((t) => t.name)).size, p.tools.length);
    for (const t of p.tools) {
      assert(t.name && t.description && t.sourceUrl.includes(p.source.commit));
      assert.equal(t.inputSchema.type, 'object');
      for (const required of t.inputSchema.required || [])
        assert(Object.hasOwn(t.inputSchema.properties, required));
    }
  }
});

test('search finds tool names, ignores case, and ANDs query terms', () => {
  assert.deepEqual(
    filterPlugins(plugins, 'WEB_SEARCH', '', '', []).map((p) => p.id),
    ['search'],
  );
  assert.deepEqual(
    filterPlugins(plugins, 'web_search nonexistent', '', '', []),
    [],
  );
  assert.equal(
    filterPlugins(plugins, '   ', '', '', []).length,
    plugins.length,
  );
});

test('category, contributor and multiple tags compose as an intersection', () => {
  const result = filterPlugins(plugins, '', 'Search & memory', 'qwenlm', [
    'audio',
    'video',
  ]);
  assert.deepEqual(
    result.map((p) => p.id),
    ['omni-memory'],
  );
  assert.equal(filterPlugins(plugins, '', '', 'unknown', []).length, 0);
});

test('contributor identity comes from GitHub accounts, not capability glyphs', () => {
  for (const [id, contributor] of Object.entries(catalog.contributors)) {
    assert.equal(id, contributor.name.toLowerCase());
    assert.equal(contributor.url, `https://github.com/${contributor.name}`);
    assert.equal(contributor.avatarUrl, `${contributor.url}.png?size=80`);
  }
  for (const plugin of plugins) {
    assert(plugin.contributors.length);
    assert(!Object.hasOwn(plugin, 'icon'));
    assert(!Object.hasOwn(plugin, 'color'));
    assert.deepEqual(plugin.tags, [...new Set(plugin.tags)]);
    assert(plugin.tags.every((tag) => tag === tag.trim().toLowerCase()));
  }
});

test('Skill-only capabilities are not represented as MCP servers', () => {
  const education = plugins.find((p) => p.id === 'edu-agent');
  assert.equal(education.kind, 'Skill only');
  assert.equal(education.tools.length, 0);
  assert.equal(education.tokenEstimate.toolsTotal, 0);
});

test('token estimates use a pinned reference and retain the exact counted definitions', () => {
  assert.equal(catalog.tokenizer.label, 'Qwen3.5');
  assert.equal(catalog.tokenizer.modelId, 'Qwen/Qwen3.5-9B');
  assert.match(catalog.tokenizer.revision, /^[a-f0-9]{40}$/);
  assert.match(catalog.tokenizer.sha256, /^[a-f0-9]{64}$/);
  assert(catalog.tokenizer.sourceUrl.includes(catalog.tokenizer.revision));
  assert.equal(catalog.tokenizer.addSpecialTokens, false);
  for (const plugin of plugins) {
    for (const count of Object.values(plugin.tokenEstimate)) {
      assert(Number.isInteger(count) && count >= 0);
    }
    assert.equal(
      plugin.tokenEstimate.toolsTotal,
      plugin.tools.reduce((sum, t) => sum + t.tokenCount, 0),
    );
    for (const tool of plugin.tools) {
      assert(Number.isInteger(tool.tokenCount) && tool.tokenCount > 0);
      assert.deepEqual(JSON.parse(tool.definitionText), {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }
  assert.equal(formatTokens(18842), '18,842');
  assert.equal(formatTokens(0), '0');
});

test('parameter types preserve unions and nested arrays', () => {
  assert.equal(
    schemaType({ type: 'array', items: { type: 'string' } }),
    'string[]',
  );
  assert.equal(
    schemaType({ anyOf: [{ type: 'number' }, { type: 'string' }] }),
    'number | string',
  );
  assert.equal(schemaType({ type: ['number', 'string'] }), 'number | string');
});
