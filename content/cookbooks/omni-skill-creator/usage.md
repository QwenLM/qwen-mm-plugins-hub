---
title: Omni Skill Creator
category: Understanding
tags: [video, skills]
order: 12
---

# Omni Skill Creator

Turn a teaching video, screen recording or demonstration into a reusable Agent
Skill. The plugin reads the recording as a time-aligned audio-visual sequence,
then writes instructions with the relevant frames, clips and audio.

## Before you start

Install `qwen-mm-plugins-omni-skill-creator`, configure a DashScope key using the
[configuration guide](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/configuration/),
and make `ffmpeg` available. Provide a local recording and a directory for the
generated Skill. Define what a consumer should be able to produce after following it.

## Workflow

For example, ask:

```text
Turn /path/to/tutorial.mp4 into a reusable Skill for reproducing the demonstrated
workflow. Save it under /path/to/output/my-skill. Include the useful frames and
clips, validate its structure, and report which steps were actually tested.
```

The agent first reads the recording and creates a timestamped `video_events.md`
timeline. It uses that evidence to draft `SKILL.md`, plans and extracts supporting
media, and records the assets in `asset_manifest.json`. Structural validation
checks the draft before behavioral evaluation.

Review the proposed test prompts and outputs, or request the supported agent
self-iteration workflow. Test cases should ask for the actual deliverable whenever
one can be generated. Keep source-grounded steps distinct from execution-verified
steps; a successful structural check alone does not demonstrate that the workflow
works in its target application.

## Expected result

The output directory contains `SKILL.md`, the referenced media and asset manifest,
plus build and evaluation evidence where applicable. Check that the instructions
refer to existing assets, preserve the demonstrated steps and preferences, and
state any application or environment requirements.

See the plugin's generated tool reference and bundled Skill on its Hub page for
the current schemas and full authoring workflow.
