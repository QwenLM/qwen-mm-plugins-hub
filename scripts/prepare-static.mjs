import {
  readFile,
  copyFile,
  mkdir,
  writeFile,
  access,
  cp,
} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist/client');
const { plugins, contributors } = JSON.parse(
  await readFile('data/catalog.json', 'utf8'),
);
const cookbooks = JSON.parse(await readFile('data/cookbooks.json', 'utf8'));
const docs = JSON.parse(await readFile('data/docs.json', 'utf8'));
const source = JSON.parse(await readFile('source.config.json', 'utf8'));
if (docs.ref !== source.ref || plugins.some((p) => p.channel !== source.ref))
  throw new Error('Generated content must match the configured source branch');
const documentationRoute = (page) =>
  page.slug === 'installation' ? 'docs' : `docs/${page.slug}`;
// Vinext's trailingSlash export currently redirects its internal RSC requests.
// Export without redirects, then provide directory indexes for portable URLs.
for (const { id } of plugins) {
  const destination = path.join(root, 'plugins', id);
  await mkdir(destination, { recursive: true });
  await copyFile(
    path.join(root, 'plugins', `${id}.html`),
    path.join(destination, 'index.html'),
  );
  await mkdir(path.join(destination, 'cookbook'), { recursive: true });
  await copyFile(
    path.join(destination, 'cookbook.html'),
    path.join(destination, 'cookbook/index.html'),
  );
}
for (const page of docs.pages) {
  const route = documentationRoute(page);
  await mkdir(path.join(root, route), { recursive: true });
  await copyFile(
    path.join(root, route + '.html'),
    path.join(root, route, 'index.html'),
  );
}
await writeFile(path.join(root, '.nojekyll'), '');
// Fail publication if a page references an asset outside the exported tree.
const prefix = process.env.SITE_BASE_PATH || '';
if (prefix) {
  if (!/^\/[a-zA-Z0-9_-]+$/.test(prefix))
    throw new Error('SITE_BASE_PATH must be a single safe path segment');
  // assetPrefix also nests Vinext's emitted assets. Pages supplies the prefix
  // itself, so put a copy at the artifact root while preserving URL references.
  await cp(
    path.join(root, prefix.slice(1), '_next'),
    path.join(root, '_next'),
    { recursive: true },
  );
}
for (const file of [
  'index.html',
  ...plugins.map((p) => `plugins/${p.id}/index.html`),
  ...plugins.map((p) => `plugins/${p.id}/cookbook/index.html`),
  ...docs.pages.map((page) => `${documentationRoute(page)}/index.html`),
]) {
  const html = await readFile(path.join(root, file), 'utf8');
  if (html.includes('id="__next_error__"'))
    throw new Error(`Error page exported: ${file}`);
  const outline = html.match(
    /<nav\b[^>]*aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/,
  )?.[1];
  if (outline && /&lt;(?:p|img|div)\b/.test(outline))
    throw new Error(`Raw HTML leaked into the page outline: ${file}`);
  if (
    !html.includes('aria-label="Color theme"') ||
    !html.includes('qwen-hub-theme')
  )
    throw new Error(`Theme control or pre-paint theme script missing: ${file}`);
  if (!html.includes(`<span>${source.ref}</span>`))
    throw new Error(`Source branch badge missing: ${file}`);
  if (source.ref !== 'main') {
    for (const p of plugins) {
      if (
        html.includes(
          `href="${p.source.repository}/tree/qwen-mm-plugins-${p.id}-v${p.version}"`,
        )
      )
        throw new Error(
          `Branch preview links to a prepared release tag: ${file}`,
        );
    }
  }
  if (!html.includes(`action="${prefix}/"`))
    throw new Error(`Documentation search has the wrong destination: ${file}`);
  const mainNav = html.match(
    /<nav\b[^>]*aria-label="Main navigation"[^>]*>([\s\S]*?)<\/nav>/,
  )?.[1];
  const activeMain = [
    ...(mainNav || '').matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g),
  ];
  if (
    !mainNav?.includes(`href="${prefix}/docs/"`) ||
    activeMain.length !== 1 ||
    !activeMain[0][0].includes(
      `href="${prefix}${file.startsWith('docs/') ? '/docs/' : '/'}"`,
    )
  )
    throw new Error(`Incorrect Docs / Plugins header navigation: ${file}`);
  if (
    !html.includes('class="brand-mark"') ||
    !html.includes(`src="${prefix}/favicon.svg"`)
  )
    throw new Error(
      `Qwen brand asset missing or incorrectly prefixed: ${file}`,
    );
  if (file.startsWith('plugins/')) {
    if (
      !html.includes('aria-label="Plugin documentation"') ||
      !html.includes('aria-label="On this page"')
    )
      throw new Error(`Documentation navigation missing: ${file}`);
    const currentId = file.split('/')[1];
    const currentRoot = `${prefix}/plugins/${currentId}/`;
    const localNav = html.match(
      /<nav\b[^>]*data-plugin-navigation="[^"]+"[^>]*>([\s\S]*?)<\/nav>/,
    )?.[1];
    if (!localNav || localNav.includes('Plugin directory'))
      throw new Error(`Plugin-scoped navigation missing: ${file}`);
    for (const [, href] of localNav.matchAll(/href="([^"]+)"/g)) {
      const destination = new URL(href, `https://hub.local${currentRoot}`);
      if (!destination.pathname.startsWith(currentRoot))
        throw new Error(
          `Local plugin navigation leaves the plugin: ${file}: ${href}`,
        );
    }
    const selected = [
      ...localNav.matchAll(/<a\b[^>]*aria-current="(?:page|location)"[^>]*>/g),
    ];
    const selectedHref = file.includes('/cookbook/')
      ? currentRoot + 'cookbook/'
      : currentRoot;
    if (
      selected.length !== 1 ||
      !selected[0][0].includes(`href="${selectedHref}"`)
    )
      throw new Error(`Incorrect current-page navigation: ${file}`);
    if (!html.includes('aria-label="breadcrumb"'))
      throw new Error(`Global return breadcrumb missing: ${file}`);
    for (const plugin of plugins) {
      if (!html.includes(`href="${prefix}/plugins/${plugin.id}/"`))
        throw new Error(
          `Plugin navigation link missing in ${file}: ${plugin.id}`,
        );
    }
    if (file.includes('/cookbook/')) {
      if (!html.includes('id="cookbook-content"'))
        throw new Error(`Cookbook content missing: ${file}`);
      const toc = html.match(
        /<nav\b[^>]*class="docs-toc cookbook-toc"[^>]*>([\s\S]*?)<\/nav>/,
      )?.[1];
      if (!toc || !toc.includes('href="#cookbook-content"'))
        throw new Error(`Cookbook outline missing: ${file}`);
      for (const [, href] of toc.matchAll(/href="([^"]+)"/g)) {
        if (!href.startsWith('#') || !html.includes(`id="${href.slice(1)}"`))
          throw new Error(
            `Cookbook outline leaves this page or misses its heading: ${file}: ${href}`,
          );
      }
      for (const [, url] of html.matchAll(
        /(?:src|href)="([^"?#]*\/cases\/[^"?#]+)"/g,
      )) {
        if (!url.startsWith(prefix + '/cases/'))
          throw new Error(`Wrong cookbook asset prefix: ${url}`);
        await access(path.join(root, url.slice(prefix.length)));
      }
      for (const [, href] of html.matchAll(/href="([^"]*#[^"]+)"/g)) {
        const url = new URL(href, `https://hub.local/${file}`);
        if (url.origin !== 'https://hub.local') continue;
        // Overview tabs are mounted on demand by PluginDetail's hash handler.
        // Their targets are absent from prerendered HTML until that tab opens.
        if (
          plugins.some((p) => url.pathname === `${prefix}/plugins/${p.id}/`) &&
          ['#tools', '#install'].includes(url.hash)
        )
          continue;
        const destination =
          url.pathname === `/${file}`
            ? html
            : await readFile(
                path.join(
                  root,
                  url.pathname.slice(prefix.length),
                  'index.html',
                ),
                'utf8',
              );
        if (
          !destination.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)
        )
          throw new Error(`Broken cookbook anchor in ${file}: ${href}`);
      }
      const id = file.split('/')[1];
      const expectedMedia = [
        ...cookbooks[id].markdown.matchAll(
          /\]\(([^)]+\/public\/cases\/[^)]+\.(?:mp4|webm|html))\)/g,
        ),
      ];
      for (const [, media] of expectedMedia) {
        const src =
          prefix +
          media.slice(media.indexOf('/public/cases/') + '/public'.length);
        const tag = media.endsWith('.html') ? 'iframe' : 'video';
        const embeds = [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))]
          .map((match) => match[0])
          .filter((element) => element.includes(`src="${src}"`));
        if (
          embeds.length !== 1 ||
          (tag === 'iframe' &&
            !embeds[0].includes('sandbox="allow-scripts"')) ||
          (tag === 'video' && !embeds[0].includes('controls=""'))
        )
          throw new Error(
            `Missing, duplicate or unsafe cookbook preview in ${file}: ${src}`,
          );
      }
      for (const figure of html.matchAll(
        /<figure\b[^>]*class="cookbook-media"[^>]*>([\s\S]*?)<\/figure>/g,
      )) {
        if (figure[1].includes('<figcaption') || figure[1].includes('<a '))
          throw new Error(
            `Cookbook embed repeats a caption or action link: ${file}`,
          );
      }
    } else {
      if (!html.includes('id="skill"'))
        throw new Error(`Skill permalink target missing: ${file}`);
      const current = plugins.find(
        (p) => file === `plugins/${p.id}/index.html`,
      );
      for (const id of current.contributors) {
        if (!html.includes(`href="${contributors[id].url}"`))
          throw new Error(`Contributor profile missing in ${file}: ${id}`);
      }
      if (
        !html.includes('id="tokens"') ||
        !html.includes('data-token-kind="skill"') ||
        !html.includes('data-token-kind="tools"') ||
        !html.includes('Skill instructions') ||
        !html.includes('Tool definitions') ||
        !html.includes('Estimated text size—not usage or cost.') ||
        !html.includes(
          current.tokenEstimate.skillFull.toLocaleString('en-US'),
        ) ||
        !html.includes(current.tokenEstimate.toolsTotal.toLocaleString('en-US'))
      )
        throw new Error(`Token estimates missing or incorrect: ${file}`);
      const cookbookButton = html.match(
        /<a\b[^>]*class="cookbook-button"[^>]*>/,
      )?.[0];
      if (!cookbookButton?.includes(`href="${prefix}${current.cookbookUrl}"`))
        throw new Error(
          `Prominent Cookbook link missing or incorrect: ${file}`,
        );
    }
  } else if (file.startsWith('docs/')) {
    const page = docs.pages.find(
      (page) => file === `${documentationRoute(page)}/index.html`,
    );
    const nav = html.match(
      /<nav\b[^>]*data-documentation-navigation="[^"]+"[^>]*>([\s\S]*?)<\/nav>/,
    )?.[1];
    const active = [
      ...(nav || '').matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g),
    ];
    if (
      !html.includes('id="documentation-content"') ||
      !html.includes(`href="${page.sourceUrl}"`) ||
      active.length !== 1 ||
      !active[0][0].includes(`href="${prefix}/${documentationRoute(page)}/"`)
    )
      throw new Error(
        `Documentation content, source or active navigation missing: ${file}`,
      );
    for (const entry of docs.pages) {
      if (!nav.includes(`href="${prefix}/${documentationRoute(entry)}/"`))
        throw new Error(
          `Documentation page missing from sidebar: ${entry.slug}`,
        );
    }
    const toc = html.match(
      /<nav\b[^>]*aria-label="On this page"[^>]*>([\s\S]*?)<\/nav>/,
    )?.[1];
    if (!toc?.includes('href="#documentation-content"'))
      throw new Error(`Documentation outline missing: ${file}`);
    if (
      ['main', docs.ref].some((ref) =>
        html.includes(`href="${docs.repository}/blob/${ref}/docs/en/`),
      )
    )
      throw new Error(
        `Documentation still links to an imported page on GitHub: ${file}`,
      );
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      const url = new URL(
        href.replaceAll('&amp;', '&'),
        `https://hub.local${prefix}/${documentationRoute(page)}/`,
      );
      if (
        url.origin !== 'https://hub.local' ||
        !url.pathname.startsWith(`${prefix}/docs/`)
      )
        continue;
      const destination = await readFile(
        path.join(root, url.pathname.slice(prefix.length), 'index.html'),
        'utf8',
      );
      if (
        url.hash &&
        !destination.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)
      )
        throw new Error(`Broken documentation anchor: ${file}: ${href}`);
    }
  } else {
    if (
      html.includes('class="card-token-estimate"') ||
      html.includes('MCP tools, and hands-on cookbooks.')
    )
      throw new Error('Catalog should not display technical token/tool totals');
    for (const plugin of plugins) {
      for (const destination of [
        `/plugins/${plugin.id}/#skill`,
        ...(plugin.tools.length ? [`/plugins/${plugin.id}/#tools`] : []),
        plugin.cookbookUrl,
      ]) {
        if (!html.includes(`href="${prefix}${destination}"`))
          throw new Error(`Card resource link missing: ${destination}`);
      }
    }
    for (const contributor of Object.values(contributors)) {
      if (!html.includes(`href="${contributor.url}"`))
        throw new Error(
          `Contributor profile missing from catalog: ${contributor.name}`,
        );
    }
  }
  for (const [, url] of html.matchAll(
    /(?:src|href)="([^"?#]+\.(?:js|css|woff2))"/g,
  )) {
    if (!url.startsWith('/')) continue;
    if (prefix && !url.startsWith(prefix + '/'))
      throw new Error(`Missing base path in ${file}: ${url}`);
    await access(path.join(root, url.slice(prefix.length).replace(/^\//, '')));
  }
}
console.log(
  `Verified ${plugins.length * 2 + docs.pages.length + 1} static pages, documentation navigation and anchors, cookbook media, token estimates, search destinations, and script, style, and font assets.`,
);
