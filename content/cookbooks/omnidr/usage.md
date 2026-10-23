---
title: Omni Deep Research
category: Understanding
tags: [video, research]
order: 11
---

# Omni Deep Research

Use `qwen-mm-plugins-omnidr` to research a video and produce an interactive report
with timestamps, images, citations, and comparisons grounded in external sources.
The host agent directs the research; the plugin supplies media reading, source
collection, report rendering, and validation tools.

## Install and configure

Install the plugin through this page's **Install** tab. For Claude Code:

```bash
claude plugin marketplace add https://github.com/QwenLM/Qwen-MM-Plugins.git
claude plugin install qwen-mm-plugins-omnidr@qwen-mm-plugins
```

The plugin requires Python 3.10+, FFmpeg with `libx264`, `ffprobe`, and Node.js 22+.
Browser screenshots also need Playwright Chromium or a system Chromium installation.
The plugin's Python extra installs Playwright and the document/download dependencies.

Configure media understanding and transcription in `~/.qwen-mm-plugins/config`:

```dotenv
DASHSCOPE_API_KEY=<your-api-key>
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MM_API_OMNI_MODEL=qwen3.8-omni-flash
```

The host agent's model is configured separately. Public search needs no additional
API key. Keep credentials and cookies outside the report directory.

## Research a video

Provide a local video or downloadable video URL, your question, and a new output
directory. For example:

```text
Use qwen-mm-plugins-omnidr to research /absolute/path/demo.mp4.
Explain the demonstrated method, compare it with alternatives, and verify its
main claims against current sources. Write an English interactive report in
/absolute/path/demo-research/.
```

The workflow reads the full source, extracts visual and spoken research anchors,
opens supporting documents, watches related videos, and checks comparisons and
dated claims. It then assembles the illustrated report and checks its evidence,
playback, navigation, and citations. A focused question still receives the full
source-reading and external-research workflow.

## Open the result

Keep the complete report directory: `index.html` depends on its neighboring media,
images, styles, and data. Serve it locally to inspect playback and linked evidence:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory /absolute/path/demo-research
```

Open `http://127.0.0.1:8000/` in your browser. The directory also retains source
readings and research records for audit and continuation.

Report creation starts with a draft. A structure check confirms the report's
shape; delivery checks also assess research coverage and review records. Missing
readings, inaccessible sources, failed downloads, or unreviewed claims must remain
explicit gaps in a partial result.

## Resume work

Give the agent the existing report directory and the original question:

```text
Resume /absolute/path/demo-research/ with qwen-mm-plugins-omnidr.
Keep completed readings and investigate the remaining gaps before delivery.
```

The agent inspects saved state and reuses successful work. Keep the source video,
reading manifests, and evidence files in place. If you explicitly request offline
work, model readers, search, and downloads are unavailable; local inspection can
continue, and the result remains partial where online evidence is required.
