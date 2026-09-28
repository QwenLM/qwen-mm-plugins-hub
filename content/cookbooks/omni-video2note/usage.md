---
title: Omni Video2Note
category: Generation
tags: [video, education]
order: 10
---

# Omni Video2Note

`omni-video2note` converts one local tutorial or instructional video into a step-by-step, illustrated PDF. It keeps an auditable work directory and can resume from completed phase checkpoints.

## Install

Run the repository installer and select **omni-video2note**:

```bash
curl -fsSL https://raw.githubusercontent.com/QwenLM/Qwen-MM-Plugins/main/install.sh | bash
```

The capability requires Python 3.10+, `ffmpeg`, and `ffprobe`. Its Python extra installs ReportLab and `pypdfium2`; `pdftoppm` from Poppler is an optional PDF-rasterization fallback. For example:

```bash
# Debian or Ubuntu
sudo apt install ffmpeg poppler-utils

# macOS
brew install ffmpeg poppler
```

## Create a note

Ask the agent to use the local file and provide a PDF destination:

```text
Use omni-video2note to turn @/absolute/path/tutorial.mp4 into
/absolute/path/tutorial-notes.pdf. Use English and the balanced profile.
```

The underlying `omni_video2note_create` tool accepts `video_path` and `output_path`. URLs are rejected. `workdir` is optional and defaults to `<output_path>.work`.

Use `dry_run=true` to validate paths, models, and resolved options without creating the work directory, writing a PDF, or calling a model. The direct Python adapter is also available from an installed environment:

```bash
python -m qwen_mm_plugins_omni_video2note.cli \
  /absolute/path/tutorial.mp4 \
  --output-path /absolute/path/tutorial-notes.pdf \
  --dry-run
```

## Results and exit codes

Every create result contains `exit_code`, `status`, `output_path`, `workdir`, iteration information, and an error message when applicable.

- `0` (`pass`): a PDF was produced and passed deterministic and model review gates.
- `1` (`failed`): no completed valid PDF is available. If an owned work directory was initialized, its phase checkpoints can be resumed.
- `2` (`best_effort`): a valid PDF was produced but did not pass the combined quality gate. This includes an unavailable model reviewer or unavailable PDF page rasterization.

Exit code 2 is a usable artifact with a quality warning, not the same as the hard failure represented by exit code 1.

## Resume and status

Use `omni_video2note_status` with `workdir`, or with `output_path` to derive the default work directory. Status inspection is local and does not call a model.

After an interruption or a failed attempt with valid checkpoints, call `omni_video2note_create` with the same input and settings plus `resume=true`. Resume verifies both the input SHA-256 and a configuration fingerprint; a changed video or processing configuration is rejected. Use `overwrite=true` only when you intentionally want to replace an existing owned job.

## Model and audio configuration

The pipeline has three model roles:

- `omni_model` handles joint audio-video understanding and defaults through `QWEN_MM_API_OMNI_MODEL`;
- `vl_model` handles planning, writing, and repairs and defaults through `QWEN_MM_API_VL_MODEL`;
- `review_model` handles candidate-frame and PDF review and inherits the resolved `vl_model` when omitted.

The MCP tool accepts those three per-run model overrides. The CLI equivalents are `--omni-model`, `--vl-model`, and `--review-model`. Endpoint and credentials are configuration-only: all roles use the shared OpenAI-compatible endpoint resolved from canonical `DASHSCOPE_BASE_URL` and `DASHSCOPE_API_KEY` settings (environment first, then the qwen-mm-plugins config file). There are no per-run endpoint or credential arguments. Credentials are scoped to their endpoint: `DASHSCOPE_API_KEY` is sent to DashScope hosts, so a base URL pointing at another gateway needs that host's own key configured.

`no_asr=true` (`--no-asr`) ignores the video's audio and speech. `require_asr=true` (`--require-asr`) requires the source to contain an audio track and asks the Omni model to understand it. This capability does not use a separate ASR model, and the two options are mutually exclusive.

## Output structure

For `tutorial-notes.pdf`, the default job directory is `tutorial-notes.pdf.work/`:

```text
tutorial-notes.pdf
 tutorial-notes.pdf.work/
 ├── manifest.json
 ├── frames/
 │   ├── r0/
 │   ├── candidates/
 │   └── selected/
 ├── phase1/                 # probe, chunks, coarse frames, understanding
 ├── phase2/                 # document plan
 ├── phase3/                 # draft, selections, HTML, layout
 └── phase4/                 # iteration PDFs/audits/reviews and best.pdf
```

Keep the work directory when you need audit details or resume support. The final PDF is copied to `output_path`.
