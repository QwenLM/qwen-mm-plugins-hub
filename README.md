# Qwen MM Plugins Hub

Documentation, tool references, and cookbooks for Qwen MM Plugins.

[Browse the Hub](https://qwenlm.github.io/qwen-mm-plugins-hub/) · [Install plugins](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/) · [Plugin source](https://github.com/QwenLM/Qwen-MM-Plugins)

## Use the plugins

Open the [Hub](https://qwenlm.github.io/qwen-mm-plugins-hub/), choose a plugin, and follow its **Install** tab. Its **Cookbook** has workflows and examples. You do not need to run this repository.

## Add or update a plugin

1. **In [Qwen-MM-Plugins](https://github.com/QwenLM/Qwen-MM-Plugins):** implement the plugin, write its Skill and tool docstrings, and register it using [Add a new plugin](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/how-to-add-new-capability/). Update existing plugins in the same place.
2. **In this repository:** add or edit `content/cookbooks/<cap>/usage.md`. Put example files in `public/cases/<cap>/<case>/assert/` and link them from the cookbook. Replace `<cap>` with the plugin's capability ID, such as `core`.

The Hub reads plugin descriptions, Skills, tools, and English guides automatically. **Do not edit `data/*.json`.**
[Hub authoring](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/hub/) has a copyable cookbook template, media examples, and local content-refresh instructions.

## Work on the website locally

For frontend changes, use **Node 24**:

```bash
git clone https://github.com/QwenLM/qwen-mm-plugins-hub.git
cd qwen-mm-plugins-hub
npm ci
npm run dev
```

Open the URL printed by the server. This preview uses the committed content snapshot.
If you changed a cookbook or plugin source, [regenerate the content first](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/hub/#validate-locally); that step also needs Python and a plugin checkout.

## Publish your changes

- **Hub changes:** merge your PR or push to this repository's `main`; GitHub Actions builds and publishes the website automatically.
- **Plugin-source changes only:** first merge into the branch selected in [source.config.json](source.config.json), currently plugin `main`. Then open [Build and deploy plugin directory](https://github.com/QwenLM/qwen-mm-plugins-hub/actions/workflows/pages.yml) → **Run workflow** on Hub `main`.

For a new plugin, both its source and Hub cookbook must be available before the build runs.
Wait for the workflow to pass, then check [the public Hub](https://qwenlm.github.io/qwen-mm-plugins-hub/). Publishing the website does not publish plugin releases.

Maintenance constraints and verification commands are in [AGENTS.md](AGENTS.md). See [third-party notices](THIRD_PARTY_NOTICES.md) for licenses and content provenance.
