import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  documentationPath,
  documentationUrl,
  documentationGroups,
} from '../lib/documentation.ts';
import { markdownHeadings } from '../lib/cookbook.ts';

const docs = JSON.parse(
  readFileSync(new URL('../data/docs.json', import.meta.url), 'utf8'),
);
const catalog = JSON.parse(
  readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'),
);
const books = JSON.parse(
  readFileSync(new URL('../data/cookbooks.json', import.meta.url), 'utf8'),
);

test('English docs and plugin references share a source commit', () => {
  assert(docs.pages.length >= 7);
  for (const plugin of catalog.plugins) {
    assert.equal(plugin.source.commit, docs.commit);
    assert.equal(plugin.channel, docs.ref);
  }
  for (const page of docs.pages) {
    assert(page.path.startsWith('docs/en/'));
    assert.equal(
      page.sourceUrl,
      `${docs.repository}/blob/${docs.commit}/${page.path}`,
    );
    assert(page.markdown.includes('# ' + page.title));
  }
});

test('Docs opens installation directly and every imported page appears once in navigation', () => {
  assert.equal(documentationPath('installation'), '/docs/');
  const pages = [
    ...docs.pages,
    { slug: 'future-guide', title: 'Future guide' },
  ];
  const navigation = documentationGroups(pages).flatMap((group) => group.pages);
  assert.deepEqual(
    navigation.map((page) => page.slug).sort((a, b) => a.localeCompare(b)),
    pages.map((page) => page.slug).sort((a, b) => a.localeCompare(b)),
  );
});

test('relative and GitHub English doc links stay local with anchors and base paths', () => {
  for (const base of ['', '/qwen-mm-plugins-hub']) {
    const resolve = (url) =>
      documentationUrl(url, 'docs/en/installation.md', docs, base);
    assert.equal(resolve('configuration.md'), base + '/docs/configuration/');
    assert.equal(
      resolve('manual_harnesses.md#qoderwork-and-qwenwork-in-app-task'),
      base + '/docs/manual-harnesses/#qoderwork-and-qwenwork-in-app-task',
    );
    assert.equal(
      resolve('installation.md?view=all#guided-installer'),
      base + '/docs/?view=all#guided-installer',
    );
    assert.equal(resolve('#roll-back'), '#roll-back');
    assert.equal(
      resolve(
        `${docs.repository}/blob/main/docs/en/installation.md#guided-installer`,
      ),
      base + '/docs/#guided-installer',
    );
    assert.equal(
      resolve(
        `${docs.repository}/blob/${docs.commit}/docs/en/configuration.md`,
      ),
      base + '/docs/configuration/',
    );
    assert.equal(
      resolve(`${docs.repository}/blob/${docs.ref}/docs/en/configuration.md`),
      base + '/docs/configuration/',
    );
    if (docs.pages.some((page) => page.slug === 'hub')) {
      assert.equal(
        resolve('hub.md#author-descriptions-once'),
        base + '/docs/hub/#author-descriptions-once',
      );
    }
  }
});

test('Chinese and code references use immutable source files and directories', () => {
  const resolve = (url) =>
    documentationUrl(url, 'docs/en/installation.md', docs);
  assert.equal(
    resolve('../zh/installation.md'),
    `${docs.repository}/blob/${docs.commit}/docs/zh/installation.md`,
  );
  assert.equal(
    resolve('../../src/shared/env.py'),
    `${docs.repository}/blob/${docs.commit}/src/shared/env.py`,
  );
  assert.equal(
    resolve('../../src/capabilities/example/'),
    `${docs.repository}/tree/${docs.commit}/src/capabilities/example/`,
  );
  for (const external of [
    'https://example.com/',
    'mailto:hello@example.com',
    `${docs.repository}/blob/old-version/docs/en/installation.md`,
    `${docs.repository}/blob/main/src/shared/env.py`,
  ])
    assert.equal(resolve(external), external);
});

test('all current cookbook documentation links map to imported pages', () => {
  let count = 0;
  for (const book of Object.values(books)) {
    for (const [, url] of book.markdown.matchAll(
      /\]\((https:\/\/github\.com\/QwenLM\/Qwen-MM-Plugins\/blob\/main\/docs\/en\/[^)]+)\)/g,
    )) {
      assert(documentationUrl(url, '', docs).startsWith('/docs/'));
      count++;
    }
  }
  assert(count >= 6);
});

test('document headings preserve code/link text, duplicates and non-Latin anchors', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'heading',
        children: [
          { type: 'inlineCode', value: 'Qwen' },
          { type: 'text', value: ' setup' },
        ],
      },
      {
        type: 'heading',
        children: [
          { type: 'link', children: [{ type: 'text', value: 'Qwen setup' }] },
        ],
      },
      { type: 'heading', children: [{ type: 'text', value: '中文' }] },
    ],
  };
  markdownHeadings()(tree);
  assert.deepEqual(
    tree.children.map((node) => node.data.hProperties.id),
    ['qwen-setup', 'qwen-setup-1', '中文'],
  );
  markdownHeadings({ prefix: 'skill-section-' })(tree);
  assert.deepEqual(
    tree.children.map((node) => node.data.hProperties.id),
    [
      'skill-section-qwen-setup',
      'skill-section-qwen-setup-1',
      'skill-section-中文',
    ],
  );
});
