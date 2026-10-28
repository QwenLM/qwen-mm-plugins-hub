---
title: Omni Deep Research
category: Understanding
tags: [video, research]
order: 11
---

# Omni Deep Research

Use `qwen-mm-plugins-omnidr` with Claude Code or Codex to research a video's
visuals and speech, collect external sources (related webpages, images, videos,
and documents), and produce an HTML report. The report includes the original
video, detailed illustrated notes with timestamps and citations, and multiple
analyses covering comparisons, causal relationships, and timeliness to address
the user's needs.

## Install

For Claude Code, install OmniDR from the plugin marketplace:

```bash
claude plugin marketplace add https://github.com/QwenLM/Qwen-MM-Plugins.git
claude plugin install qwen-mm-plugins-omnidr@qwen-mm-plugins
```

For Codex and other supported clients, run the guided installer and select
**OmniDR**:

```bash
curl -fsSL https://raw.githubusercontent.com/QwenLM/Qwen-MM-Plugins/main/install.sh | bash
```

The released MCP server needs `uvx`. OmniDR also requires Python 3.10+,
FFmpeg with `libx264`, `ffprobe`, Node.js 22+, and Chromium for screenshots.
On Windows, follow the
[WSL2 installation guide](https://github.com/QwenLM/Qwen-MM-Plugins/blob/main/docs/en/installation.md#windows-wsl2).
Reload Claude Code plugins or start a new Codex task after installation.

## Configure

Set these through the installer's **Configure** action, the environment, or
`~/.qwen-mm-plugins/config`:

```dotenv
DASHSCOPE_API_KEY=<your-api-key>
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MM_API_OMNI_MODEL=qwen3.8-omni-flash
```

The host agent's model is configured separately. Public search needs no key.

## Research a video

Provide a local video or downloadable URL, a question, and a new report
directory:

```text
Use qwen-mm-plugins-omnidr to research /absolute/path/demo.mp4.
Explain the demonstrated method, compare alternatives, and verify its main
claims. Write an English report in /absolute/path/demo-research/.
```

The Skill requires full-source reading, external research, and checks of
comparisons and dated claims, even for a focused question.

## View and resume the report

Open `/absolute/path/demo-research/index.html` to view the report. Keep the
complete directory for its media, images, and research records.

To resume, give the agent that directory and the original question:

```text
Resume the qwen-mm-plugins-omnidr report in /absolute/path/demo-research/.
The original question was: Explain the demonstrated method, compare
alternatives, and verify its main claims. Investigate the remaining gaps.
```

The agent reuses completed work. Unavailable sources and incomplete readings
remain explicit gaps in a partial report.
