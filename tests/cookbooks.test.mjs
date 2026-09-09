import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { cookbookUrl, cookbookEmbeds } from '../lib/cookbook.ts';

const catalog = JSON.parse(
  readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'),
);
const books = JSON.parse(
  readFileSync(new URL('../data/cookbooks.json', import.meta.url), 'utf8'),
);
const casesRoot = new URL('../public/cases/', import.meta.url);
const source =
  'https://github.com/QwenLM/qwen-mm-plugins-hub/blob/main/content/cookbooks/edu-agent/usage.md';

test('cookbooks have one Hub-owned source and no legacy OSS demo references', () => {
  for (const plugin of catalog.plugins) {
    const book = books[plugin.id];
    assert.equal(
      book.markdown,
      readFileSync(
        new URL(`../content/cookbooks/${plugin.id}/usage.md`, import.meta.url),
        'utf8',
      ).replace(/^---\n[\s\S]*?\n---\n+/, ''),
    );
    assert(
      book.sourceUrl.includes(
        'QwenLM/qwen-mm-plugins-hub/blob/main/content/cookbooks/',
      ),
    );
    assert(!book.markdown.includes('qianwen-res.oss-accelerate.aliyuncs.com'));
  }
});

test('case files are discovered automatically and local media references resolve', () => {
  const files = readdirSync(casesRoot, { recursive: true })
    .filter((file) => statSync(new URL(file, casesRoot)).isFile())
    .map((file) => `cases/${file}`);
  assert(files.length > 0);
  for (const file of files) {
    assert.match(file, /^cases\/[^/]+\/[^/]+\/(?:index\.html|assert\/.+)$/);
    const bytes = readFileSync(new URL('../public/' + file, import.meta.url));
    assert(bytes.length < 25 * 1024 * 1024);
    if (file.endsWith('.mp4')) {
      assert.equal(bytes.subarray(4, 8).toString(), 'ftyp');
    }
    if (file.endsWith('/index.html')) {
      const html = bytes.toString('utf8');
      assert(!html.includes('data:image/'));
      for (const match of html.matchAll(/(?:src|href)=["'](assert\/[^"']+)/g)) {
        assert(
          existsSync(
            new URL(
              '../public/' + file.replace(/index\.html$/, '') + match[1],
              import.meta.url,
            ),
          ),
        );
      }
    }
  }
});

test('GitHub-relative media links resolve inside both supported website base paths', () => {
  const media =
    '../../../public/cases/edu-agent/case-edu-agent-math/assert/case-edu-agent-math.mp4';
  for (const base of ['', '/qwen-mm-plugins-hub']) {
    assert.equal(
      cookbookUrl(media, 'edu-agent', source, base),
      base +
        '/cases/edu-agent/case-edu-agent-math/assert/case-edu-agent-math.mp4',
    );
    assert.equal(
      cookbookUrl('../core/usage.md#usage', 'edu-agent', source, base),
      base + '/plugins/core/cookbook/#usage',
    );
  }
  assert.equal(cookbookUrl('//evil.test/video.mp4', 'edu-agent', source), '');
});

test('standalone media links are replaced once, while external HTML stays a link', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: '../../../public/cases/core/example/index.html',
            children: [{ type: 'text', value: 'Example' }],
          },
        ],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'link', url: 'https://other.test/index.html', children: [] },
        ],
      },
    ],
  };
  cookbookEmbeds({ id: 'core' })(tree);
  assert.equal(tree.children.length, 2);
  assert.equal(tree.children[0].data.hName, 'cookbook-case');
  assert.deepEqual(tree.children[0].children, []);
  assert.equal(tree.children[0].data.hProperties.title, 'Example');
  assert.equal(
    tree.children[0].data.hProperties.src,
    '/cases/core/example/index.html',
  );
  assert.equal(
    tree.children[1].children[0].url,
    'https://other.test/index.html',
  );
});

test('standalone videos preserve accessible labels without a duplicate paragraph', () => {
  for (const extension of ['mp4', 'webm']) {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url: `../../../public/cases/core/demo/assert/demo.${extension}`,
              children: [{ type: 'text', value: 'Demo session' }],
            },
          ],
        },
      ],
    };
    cookbookEmbeds({ id: 'core' })(tree);
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].data.hName, 'cookbook-video');
    assert.equal(tree.children[0].data.hProperties.title, 'Demo session');
    assert.deepEqual(tree.children[0].children, []);
  }
});

test('inline media references keep their surrounding prose and do not add embeds', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'See the ' },
          {
            type: 'link',
            url: '../../../public/cases/core/demo/assert/demo.mp4',
            children: [{ type: 'text', value: 'recording' }],
          },
          { type: 'text', value: ' for details.' },
        ],
      },
    ],
  };
  cookbookEmbeds({ id: 'core' })(tree);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].data, undefined);
  assert.equal(tree.children[0].children.length, 3);
  assert.equal(tree.children[0].children[0].value, 'See the ');
});

test('heading IDs preserve existing GitHub-style cookbook anchors', () => {
  const tree = {
    type: 'root',
    children: [
      'Cases',
      'Shared case: local views, cloud grounding, and web verification',
      'Cases',
    ].map((value) => ({
      type: 'heading',
      depth: 2,
      children: [{ type: 'text', value }],
    })),
  };
  cookbookEmbeds({ id: 'core' })(tree);
  assert.deepEqual(
    tree.children.map((n) => n.data.hProperties.id),
    [
      'cases',
      'shared-case-local-views-cloud-grounding-and-web-verification',
      'cases-1',
    ],
  );
});
