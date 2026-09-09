# Qwen MM Plugins Hub

Documentation, tool references, and cookbooks for Qwen MM Plugins.

[Browse the Hub](https://qwenlm.github.io/qwen-mm-plugins-hub/) · [Install plugins](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/) · [Plugin source](https://github.com/QwenLM/Qwen-MM-Plugins)

## Use the plugins

Open the [Hub](https://qwenlm.github.io/qwen-mm-plugins-hub/), choose a plugin, and follow its **Install** tab. Its **Cookbook** has workflows and examples. You do not need to run this repository.

## Add or update a plugin

1. **In [Qwen-MM-Plugins](https://github.com/QwenLM/Qwen-MM-Plugins):** implement the plugin, write its Skill and tool docstrings, and register it using [Add a new plugin](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/how-to-add-new-capability/). Update existing plugins in the same place.
2. **In this repository:** add or edit `content/cookbooks/<cap>/usage.md`. Put example files in `public/cases/<cap>/<case>/assert/` and link them from the cookbook. Replace `<cap>` with the plugin's capability ID, such as `core`.

The Hub reads plugin descriptions, Skills, tools, and English guides automatically. Generated `data/*.json` stays out of Git; only the source repository owns that content.
[Hub authoring](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/hub/) has a copyable cookbook template, media examples, and local content-refresh instructions.

## Work on the website locally

Use **Node 24**, Git, and [uv](https://docs.astral.sh/uv/getting-started/installation/):

```bash
git clone https://github.com/QwenLM/qwen-mm-plugins-hub.git
cd qwen-mm-plugins-hub
npm ci
npm run dev
```

Open the URL printed by the server. Development and production builds generate content automatically;
the first run downloads the configured plugin source and exporter dependencies. Run `npm run content:sync`
to refresh the cached source. See [local validation](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/hub/#validate-locally)
to use your own plugin checkout or Python environment.

## Publish your changes

- **Hub changes:** merge your PR or push to this repository's `main`; GitHub Actions builds and publishes the website automatically.
- **Plugin-source changes only:** merge into the branch selected in [source.config.json](source.config.json), currently plugin `main`. The Hub checks for updates every 30 minutes and rebuilds when the source or release tags change. You can also use **Run workflow** on [Build and deploy plugin directory](https://github.com/QwenLM/qwen-mm-plugins-hub/actions/workflows/pages.yml).

For a new plugin, both its source and Hub cookbook must be available before the build runs.
Stable publishing waits for the release tags referenced by the plugin catalog. Failed builds leave
the public site unchanged. See [Hub automation](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/hub/#publish-and-refresh)
for immediate-refresh setup and source-PR build comments with downloadable preview packages.
Publishing the website does not publish plugin releases.

Maintenance constraints and verification commands are in [AGENTS.md](AGENTS.md). See [third-party notices](THIRD_PARTY_NOTICES.md) for licenses and content provenance.
