import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  filterPlugins,
  formatTokens,
  schemaType,
  skillExcerpt,
  skillFileTree,
  skillAnchor,
  skillHeadingPrefix,
} from '../lib/catalog.ts';

const catalog = JSON.parse(
  readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'),
);
const source = JSON.parse(
  readFileSync(new URL('../data/docs.json', import.meta.url), 'utf8'),
);
const plugins = catalog.plugins.map((p) => ({
  ...p,
  toolCount: p.tools.length,
  toolNames: p.tools.map((t) => t.name),
  skillCount: p.skills.length,
  skillNames: p.skills.map((s) => s.name),
}));

test('generated content stays out of Git and records one build identity', () => {
  const root = new URL('..', import.meta.url);
  assert.equal(
    execFileSync('git', ['ls-files', '--', 'data'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    '',
  );
  const identity = JSON.parse(
    readFileSync(new URL('../data/build-info.json', import.meta.url), 'utf8'),
  );
  assert.equal(identity.sourceRef, source.ref);
  assert.equal(identity.sourceCommit, source.commit);
  assert.match(identity.hubCommit, /^[a-f0-9]{40}$/);
  assert.match(identity.tagDigest, /^[a-f0-9]{64}$/);
});

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
    for (const skill of p.skills) {
      assert(
        p.skillBundle.files.some(
          (f) => p.skillBundle.path + f.path === skill.path,
        ),
      );
    }
    assert.equal(
      new Set(p.skillBundle.files.map((f) => f.path)).size,
      p.skillBundle.files.length,
    );
    assert(p.skillBundle.directoryUrl.includes(`/tree/${p.source.commit}/`));
    const leaves = [];
    function visit(nodes) {
      for (const node of nodes) {
        if (node.file) leaves.push(node.file);
        else visit(node.children);
      }
    }
    visit(skillFileTree(p.skillBundle.files));
    assert.equal(leaves.length, p.skillBundle.files.length);
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
  const tree = skillFileTree(edu.skillBundle.files);
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
    if (p.release) {
      assert.equal(source.ref, 'main');
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
  assert(edu.skills[0].prerequisites.includes('NOT** auto-installed'));
  assert(edu.skills[0].prerequisites.includes('DASHSCOPE_API_KEY'));
  assert(!edu.skills[0].prerequisites.includes('## Pipeline Overview'));
});

test('all records use one public upstream snapshot and have a complete Skill', () => {
  assert.equal(new Set(plugins.map((p) => p.source.commit)).size, 1);
  assert.equal(new Set(plugins.map((p) => p.id)).size, plugins.length);
  assert(!plugins.some((p) => p.id === 'example'));
  for (const p of plugins) {
    assert.equal(p.channel, source.ref);
    assert(p.skills.length > 0);
    assert.equal(
      new Set(p.skills.map((skill) => skill.name)).size,
      p.skills.length,
    );
    for (const skill of p.skills) {
      assert(skill.raw.startsWith('---\n'));
      assert(skill.markdown.length > 50);
      assert(skill.sourceUrl.includes(p.source.commit));
    }
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

test('single-Skill anchors stay compatible and collection headings stay distinct', () => {
  assert.equal(skillHeadingPrefix('single', 1), 'skill-section-');
  assert.notEqual(
    skillHeadingPrefix('first', 2),
    skillHeadingPrefix('second', 2),
  );
  assert.equal(skillAnchor('first'), 'skill-entry-first');
  assert.equal(skillHeadingPrefix('first', 2), 'skill-entry-first-section-');
});

test('plugin Skill token totals sum independently counted entries', () => {
  for (const plugin of plugins) {
    assert.equal(
      plugin.tokenEstimate.skillFull,
      plugin.skills.reduce((sum, s) => sum + s.tokenEstimate.full, 0),
    );
    assert.equal(
      plugin.tokenEstimate.skillMetadata,
      plugin.skills.reduce((sum, s) => sum + s.tokenEstimate.metadata, 0),
    );
  }
});

test('ChatCut stays one plugin with three searchable independent Skills', () => {
  const chatcut = plugins.find((p) => p.id === 'omni-chatcut');
  assert(chatcut);
  assert.equal(chatcut.skills.length, 3);
  assert.equal(plugins.filter((p) => p.id === 'omni-chatcut').length, 1);
  assert.equal(plugins.find((p) => p.id === 'video-edit').skills.length, 1);
  for (const skill of chatcut.skills) {
    assert.deepEqual(
      filterPlugins(plugins, skill.name, '', '', []).map((p) => p.id),
      ['omni-chatcut'],
    );
    assert(skill.tokenEstimate.full > 0);
  }
});
