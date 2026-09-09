# Repository instructions for coding agents

Keep this file focused on maintenance constraints. Reader orientation belongs in
[README.md](README.md); tutorials and cookbook examples belong in the existing
[Hub authoring guide](https://jjjymmm.github.io/qwen-mm-plugins-hub/docs/hub/).

## Content ownership

- Discover capabilities from the plugin repository's `plugin-versions.json`. Do not add a
  second registration table in the Hub. Each registered capability requires
  `content/cookbooks/<cap>/usage.md`; a missing cookbook must fail the build.
- The website's plugin introduction comes from `.codex-plugin/plugin.json:description`.
  Skill discovery text comes from `skill/SKILL.md` front matter. They are separate fields;
  do not silently replace one with the other or rewrite Skill text for display brevity.
- Tools come from the actual MCP registry: handler docstrings supply descriptions and
  Pydantic supplies types, defaults, and validation. Never hand-copy tool definitions.
- General English documentation comes from committed upstream `docs/en/**/*.md`. Edit it
  there, not in a second Hub docs tree. New pages need an H1 and a unique generated slug.
- Cookbook YAML owns titles, categories, tags, order, and contributors. Contributors are
  GitHub handles, defaulting to QwenLM; profiles and avatars are derived from them. Prefer
  one or two useful tags. Do not introduce a separate contributor/logo inventory.
- `data/catalog.json`, `data/cookbooks.json`, and `data/docs.json` are committed generated
  snapshots, not authoring sources. Frontend-only edits can use them without Python.

## Regenerate content

Read the source branch from `source.config.json`; do not hard-code a different branch in
the exporter or workflow. Use a dedicated, clean plugin checkout with committed changes
whose HEAD matches that branch. Source-file links pin that commit; uncommitted guides and
new untracked Skill files will not be exported correctly.

After the [documented Python setup](https://jjjymmm.github.io/qwen-mm-plugins-hub/docs/hub/#validate-locally),
run from the Hub root with the chosen checkout path:

```bash
.venv/bin/python -m scripts.build_content --source /path/to/plugin-checkout
```

Regenerate after changing plugin source, cookbooks, or imported docs. `npm run dev` and
`npm run build` do not run the Python exporter. Review generated diffs before committing.
The exporter imports registries in isolated processes but never runs handlers, startup
hooks, or MCP servers. Preserve that boundary; content builds must not need credentials
or invoke paid providers.

## Cases and media

- Keep cases under `public/cases/<cap>/<case>/`: optional `index.html` at the case root,
  all other files under `assert/` (the existing name, not `assets/`). Keep every file below
  25 MiB. Reject symlinks and Git LFS pointers; do not maintain a media checksum inventory.
- Use cookbook-relative links. A standalone video or HTML link becomes a player or iframe;
  inline prose links stay links. Do not duplicate an embed with a thumbnail or download prompt.
  HTML cases use relative `assert/...` asset paths. Review recordings for private data.
- Use H.264/YUV420P MP4 with faststart and AAC audio when present. Keep iframe isolation
  (`sandbox="allow-scripts"`, no same-origin privileges) and Markdown sanitization intact.

## Frontend invariants

- Preserve static hosting and the existing components. Internal links must work both at
  `/` and under `/qwen-mm-plugins-hub`; use the existing static-link and URL helpers.
  `scripts/prepare-static.mjs` provides trailing-slash directory indexes and validates exports.
- Keep light and dark themes on shared CSS variables. Skill previews show 50 source lines;
  expansion and copy retain the full source. Keep nested Skill files and tool permalinks usable.
- Token estimates use the pinned tokenizer in `tokenizer.config.json`. Count the original
  SKILL.md and displayed tool-definition JSON; do not include cookbooks, bundled files, media,
  or runtime output, and do not present the estimates as usage or cost.

## Verification and publishing

For frontend or generated-content changes:

```bash
npm test
SITE_BASE_PATH=/qwen-mm-plugins-hub npm run build
```

For exporter or content changes, also run in the configured Python environment:

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

Root-domain hosting requires a separate build with `SITE_BASE_PATH` unset. Never reuse a
prefixed artifact for a root-domain deployment. Keep the final artifact matched to its host.
For documentation-only edits, check links, command accuracy, and `git diff --check`.

Hub `main` pushes run `.github/workflows/pages.yml`; plugin-repository pushes alone do not.
For upstream-only changes, dispatch the workflow on Hub `main`. Ensure the configured
remote source branch contains the changes and every plugin has a cookbook before dispatch.
Publishing the Hub must not merge plugin branches, publish or move release tags, or point
the stable installer at an unpublished tag. Keep `.openai/hosting.json` tied to the existing
Site; never create another Site to refresh this one.
