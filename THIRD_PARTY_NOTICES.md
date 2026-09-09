# Third-party notices

## Hugging Face doc-builder

Copyright 2018– The Hugging Face team. All rights reserved.

Documentation typography and neutral theme conventions are adapted from [doc-builder's Tailwind theme](https://github.com/huggingface/doc-builder/blob/main/kit/tailwind.config.cjs) and [app styles](https://github.com/huggingface/doc-builder/blob/main/kit/src/app.css), under the Apache License 2.0. These conventions are adapted for React and Tailwind 4 rather than using the Svelte documentation application. Source Sans 3 is used in place of Source Sans Pro. The full license is in `licenses/huggingface-doc-builder.txt`.

The three-column documentation shell also references [doc-builder's development layout](https://github.com/huggingface/doc-builder/blob/main/kit/src/routes/+layout.svelte), adapted to the site's existing React sidebar, tabs, static navigation, and plugin content.

## Qwen-MM-Plugins

The blue Qwen header mark and favicon are copied unchanged from the upstream [qwen-icon.svg](https://github.com/QwenLM/Qwen-MM-Plugins/blob/82008629c47c385d073801d6cabac05ce8284e78/src/capabilities/video-edit/skill/assets/images/qwen-icon.svg). Qwen branding remains the property of its owner. Plugin avatars are provided by their contributors' public GitHub profiles; a contributor avatar is not a verification badge or an endorsement of this independently hosted Hub.

Plugin descriptions, Skill Markdown, tool definitions and English documentation are generated from [QwenLM/Qwen-MM-Plugins](https://github.com/QwenLM/Qwen-MM-Plugins), licensed under Apache 2.0. Each displayed source link records the exact source commit. English documentation is synchronized from upstream `docs/en/` on each Hub build; its source remains upstream. Third-party integrations retain the notices in their upstream capability directories.

The initial Hub-owned cookbooks, screenshots and local case traces were migrated from upstream commit `82008629c47c385d073801d6cabac05ce8284e78`. Published demo recordings and additional HTML traces came from the upstream cookbook's linked Qwen OSS assets; the [migration provenance record](https://github.com/JJJYmmm/qwen-mm-plugins-hub/blob/823bef90cee588c256709a18da6e10e2d61d40c4/cookbook-media.json) preserves their original URLs, checksums and video conversions. Cookbook edits now live in `content/cookbooks/`. Original credits and external reference links inside the case content are preserved.

## Qwen3.5 tokenizer

Build-time token estimates use the official [Qwen/Qwen3.5-9B tokenizer](https://huggingface.co/Qwen/Qwen3.5-9B/blob/c202236235762e1c871ad0ccb60c8ee5ba337b9a/tokenizer.json) with the [Hugging Face Tokenizers](https://github.com/huggingface/tokenizers) library. Exact source and engine versions are recorded in `tokenizer.config.json`. The tokenizer asset remains in an ignored build cache and is not redistributed in the website's static assets. Refer to the upstream repositories for their licenses and notices.

## Fonts and UI libraries

Source Sans 3 and IBM Plex Mono are provided through Google Fonts under the SIL Open Font License. Font assets are bundled at build time. Lucide icons use the ISC license; React, Base UI, and shadcn components retain their package licenses. This project does not use Hugging Face logos or imply affiliation.
