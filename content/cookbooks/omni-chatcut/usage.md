---
title: Omni ChatCut
category: Generation
tags: [video, audio]
order: 11
---

# Cookbook — Qwen-MM-Plugins Omni ChatCut

`qwen-mm-plugins-omni-chatcut` is a collection of three independently discoverable video Skills.
The implementation supports **Music-to-MV**, **Movie Commentary**, and **Video Translation**. Music-to-MV can
analyze the track, create a timed visual plan, generate identity and video assets, assemble the
shots against the original song, burn validated lyric subtitles, and verify the finished MV.

Music captions, creative blueprints, storyboards, generated assets, and review reports are durable
project artifacts, so the workflow can stop at an intermediate result or resume an interrupted run.
Movie Commentary turns an existing long-form video into an evidence-grounded narrated retelling. Video
Translation analyzes speakers and subtitles, authors a duration-aware translation plan, and can use an
external IndexTTS2/Demucs/TEN-VAD service to produce a speaker-preserving dubbed video.

---

## How Music-to-MV works

```text
local music
  → music caption + sentence-level lyrics
  → creative blueprint + validated timed storyboard
  → Wan: generate fictional-character identity portraits / Seedance: bind Ark image asset IDs
  → one video-provider request per editorial shot
  → local frame-exact assembly + original soundtrack
  → lyric subtitle burn-in + technical verification
```

The agent detects existing project state and runs only the stages needed for the requested target:

- `analysis_only` — stop after the evidence-grounded music caption and lyric timeline.
- `storyboard_only` — stop after the creative blueprint and validated storyboard.
- `final_mv` — generate the remaining assets, assemble the video, render subtitles, and verify it.
- `resume` — reuse compatible completed artifacts and continue the same project.

Scenes remain promptable text definitions rather than fixed scene images. For Wan, the image provider creates
one reusable identity portrait per cast member; Seedance uses selected Ark image asset IDs. Every editorial shot is sent as one independent video
request with its cast identities, complete scene description, exact action/camera plan, and matching
audio interval. The provider never owns cuts between shots; the local assembler does.

The current Music-to-MV executor supports `live_action` only. Storyboards specifying another
`creative_direction.media_form`, such as 2D or 3D animation, fail execution validation.

## Providers and tools

| Role | Available provider | Default |
|---|---|---|
| Music analysis and optional shot review | Qwen Omni | Qwen Omni |
| Fictional-character identity portraits for Wan | Qwen Image 3.0, Seedream | Qwen Image 3.0 |
| Fixed characters for Seedance | Public or user-uploaded/authorized Ark image assets (`asset://` IDs) | User selection first; otherwise the local public portrait pool |
| One-shot video generation | Wan 3.0, Seedance | Wan 3.0 |

Atomic MCP tools exposed by the capability:

- `omni_call` — prompt-driven Qwen Omni audio/video analysis; supports a no-request `dry_run`.
- `slice_audio_from_structure` — strict structure parsing and deterministic ffmpeg audio slicing.
- `get_music2mv_runtime` — returns the running MCP server's Python executable and environment
  prefix so local skill scripts use the same installed dependencies.


The Music-to-MV Skill orchestrates these tools and the packaged generation runner. Users normally
describe the intended result to the agent rather than invoking the atomic tools themselves.

---

## Install

Claude Code can install the complete Skill and MCP bundle from the marketplace:

```bash
claude plugin marketplace add https://github.com/QwenLM/Qwen-MM-Plugins.git
claude plugin install qwen-mm-plugins-omni-chatcut@qwen-mm-plugins
```

For Codex, Qoder, Qwen Code, Gemini CLI, OpenClaw, CodeBuddy, or another supported harness, use the
guided installer and select `omni-chatcut`:

```bash
curl -fsSL https://raw.githubusercontent.com/QwenLM/Qwen-MM-Plugins/main/install.sh | bash
```

To test an unpublished checkout, use a dedicated clone on the desired branch and install from that
checkout instead of the latest release:

```bash
git clone https://github.com/QwenLM/Qwen-MM-Plugins.git
cd Qwen-MM-Plugins
git switch <development-branch>
bash install.sh local
```

Restart the harness or reload its plugins after installation. See the general
[installation guide](../../docs/en/installation.md) for activation commands and manual harness setup.

## Prerequisites

`ffmpeg` and `ffprobe` are required for audio slicing, segment normalization, assembly, subtitles,
and technical verification:

```bash
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg
```

The default Wan route uploads each local shot-audio interval through `dashscope oss.upload`. Install
DashScope CLI 1.24.0 or later on the execution host, unless the run config supplies usable remote
audio URLs:

```bash
uv tool install 'dashscope>=1.24.0'
dashscope --help
```

Python runtime dependencies are installed into the plugin's isolated environment. From a source
checkout, verify the MCP server with:

```bash
uv run --extra omni-chatcut qwen-mm-plugins-omni-chatcut --check-system
uv run --extra omni-chatcut qwen-mm-plugins-omni-chatcut --list-tools
```

Speaker-preserving dubbing additionally requires a separately deployed service compatible with the
`/health`, `/tts`, `/separate`, and `/vad` protocol. Keep GPU model dependencies outside the plugin's
lightweight MCP environment and configure the endpoint through setup:

```text
QWEN_MM_DUBBING_SERVER_URL=http://your-dubbing-service
```

---

## Model configuration

Music-to-MV uses one user-owned JSON file for every remote model connection. Copy the template out
of the installed Skill or source checkout, then edit endpoints, model IDs,
and credential-variable names:

```bash
mkdir -p ~/.qwen-mm-plugins/omni-chatcut
SKILL_ROOT=/absolute/path/to/installed/music-to-mv
cp "$SKILL_ROOT/assets/model-config.example.json" \
  ~/.qwen-mm-plugins/omni-chatcut/model-config.json
```

Configure the absolute path through the same shared setup used by other capabilities:

```bash
bash install.sh --setup
```

Select **Omni ChatCut** and enter the absolute path for
`QWEN_MM_OMNI_CHATCUT_MODEL_CONFIG`. The installer stores it in
`~/.qwen-mm-plugins/config`, where GUI-launched harnesses can read it. Setting the same variable in
the process environment overrides the shared value.

The JSON stores only names such as `DASHSCOPE_API_KEY`; it must never contain a credential value.
Export the variables named by the selected providers, or put them in
`~/.qwen-mm-plugins/config` for GUI-launched harnesses that do not inherit the shell environment:

```text
QWEN_MM_OMNI_CHATCUT_MODEL_CONFIG=/absolute/path/to/model-config.json
DASHSCOPE_API_KEY=<your-model-studio-key>
ARK_API_KEY=<your-volcengine-ark-key>
```

Only configure the credentials needed by the selected providers. With the default Qwen Omni,
Qwen Image, and Wan route, only a Beijing-region DashScope API key is needed; no workspace ID is
required. Qwen Image and Wan default to `https://dashscope.aliyuncs.com`, and their adapters append
the native `/api/v1/...` paths. Omni uses `https://dashscope.aliyuncs.com/compatible-mode/v1`.
Seedream or Seedance additionally uses the variable configured for that provider, commonly
`ARK_API_KEY`.

Workspace-specific endpoints remain optional. To use one for Qwen Image or Wan, set that provider's
`base_url` to `https://{workspace_id}.cn-beijing.maas.aliyuncs.com`, add
`workspace_id_env: "DASHSCOPE_WORKSPACE_ID"`, and configure that variable and a key for the workspace.
For existing projects, update copied model files and any legacy run-config endpoint overrides to
use the shared domain; changing the repository template does not update those files automatically.

Music-to-MV connection settings and run behavior are deliberately separate:

- `<skill-root>/assets/model-config.example.json` — endpoints, models, optional workspace variables, and
  credential-variable names.
- `<skill-root>/workflows/video-generation/assets/api-config.example.json` — provider selection,
  generation parameters, rate limits, semantic-QC policy, subtitles, and assembly settings.

For a white-box run, copy the second template into the project and edit only the behavior that should
differ from its defaults:

```bash
cp "$SKILL_ROOT/workflows/video-generation/assets/api-config.example.json" \
  /absolute/path/to/project/run-config.json
```

An explicit `--model-config` path overrides `QWEN_MM_OMNI_CHATCUT_MODEL_CONFIG`. Values in an explicit
per-run config override the unified model file for compatibility with older projects.

## Video Translation

Give the agent a source video, source/target languages, and a durable project directory:

```text
Translate /data/video/source.mp4 from Chinese to English and create a speaker-preserving dubbed video.
Keep the project under /data/projects/source-en and use my configured dubbing service. Preserve the
original picture and non-vocal background, validate the translation plan before synthesis, and return
only a delivery that passes full decode and duration checks.
```

The workflow can stop after source analysis (`analysis_only`), stop after a validated translation plan
(`translation_only`), render a complete dub (`full`), or continue an existing project (`resume`). Its
project artifacts live under `analysis/`, `plan/`, `work/`, and `full/`; the final delivery is
`full/translated.mp4` with `render_report.json` and `final_qa.json` beside it.

---

## Using it

### Create a complete MV

Give the agent an absolute music path, a project directory, and any meaningful creative constraints.
If provider selection is omitted, the Skill uses Qwen Image for identities and Wan for video.

```text
Use the Music-to-MV skill to create a complete MV for
/data/music/song.mp3. Keep all project state under
/data/projects/song-mv. Develop the visual direction from the music and lyrics,
generate all shots, assemble them against the original song, burn the validated
lyrics, and return the final MV. Use the default semantic-QC setting.
```

The default semantic-QC setting is **off**. This avoids additional Omni review calls, review waiting,
and review-triggered video regenerations. Structural storyboard validation and final technical media
verification still run.

### Stop after music analysis

```text
Analyze /data/music/song.mp3 for later MV planning. Create a durable Music-to-MV
project at /data/projects/song-mv, but stop after the completed music caption and
sentence-level lyrics. Show me the final caption and saved artifact paths.
```

### Stop after the storyboard

```text
Continue /data/projects/song-mv from its existing music caption. Create and validate
the creative blueprint and timed storyboard, but do not call image or video generation
APIs. Brief: cinematic live action with varied urban and coastal environments.
```

### Resume an interrupted project

```text
Resume the Music-to-MV project at /data/projects/song-mv. Inspect its manifest and
execution state, reuse compatible successful assets and provider task IDs, and continue
to the final verified MV.
```

Use the same project and execution directories when resuming. Do not run two pipeline processes
against the same execution directory at once.

### Choose different providers

By default, Music-to-MV uses Qwen Image 3.0 for fictional-character identity portraits and
Wan 3.0 for video generation. We also provide interfaces for Seedream image generation and
Seedance video generation for users who choose to use them. Both connect directly to the official
Volcengine Ark API at `https://ark.cn-beijing.volces.com` (the adapters append `/api/v3`).

When selecting Seedance, use existing Ark image asset IDs for fixed characters. User-provided IDs
take priority; otherwise the skill searches the local 300-character pool and proposes a suitable
character. It also explains how to override the choice by supplying an uploaded/authorized image
asset or manually selecting and copying an image ID from the public library. Website operations
are performed by the user; the skill searches only the bundled local pool. See
[character selection](../../src/capabilities/omni-chatcut/skill/music-to-mv/references/seedance-character-search.md).
Bind each storyboard cast ID in the run config, for example:

```json
{
  "video": {"provider": "seedance"},
  "providers": {
    "seedance": {
      "official_identity_assets": {
        "C1": "asset://asset-20260401123823-6d4x2"
      }
    }
  }
}
```

This is an example preset from the [official documentation](https://docs.volcengine.com/docs/82379/2608626?lang=zh#preset-avatar).
Describe the selected assets consistently in the storyboard. The existing config key
`official_identity_assets` accepts both public and user-provided authorized image assets. Seedance
skips identity-image generation and asset registration, and requires only an Ark API key. Generated
portraits, ordinary image URLs, and silently recovered legacy assets are not used as fallbacks.
Users complete uploads and any required authorization in Ark before providing an image asset ID.
Missing character bindings stop the workflow before paid generation. Replace legacy
`identity_reference_urls` / `register_identity_assets` settings with `official_identity_assets`.

Changing an image or video provider changes the execution signature. Existing outputs from a
different provider are retained for audit but are not silently reused as compatible results.

### Enable optional semantic shot QC

```text
Enable Omni semantic shot QC for this run. Accept fully compliant shots and shots with
minor issues, regenerate shots with major issues, and keep at most three candidates per
shot. If all three are rejected, select the best retained candidate and report its issues.
```

Semantic QC is opt-in. It returns `fully_compliant`, `minor_issues`, or `major_issues`; the local
policy decides acceptance and bounded regeneration. Profiles do not enable this feature.

---

## Project outputs

A normal project is organized as follows:

```text
project/
├── music2mv-manifest.json
├── inputs/
├── analysis/music-caption/
│   ├── caption.md
│   ├── evidence.json
│   ├── slice-manifest.json
│   └── lyrics.srt                 # present when validated lyrics exist
├── authoring/
│   ├── <title>_creative_blueprint.md
│   ├── <title>_storyboard.json
│   ├── <title>_validation_report.json
│   └── <title>_continuity_report.json
├── execution/
│   ├── state.json
│   ├── generation_manifest.json
│   ├── generated/characters/
│   ├── video_segments/
│   │   └── assembled_with_audio.mp4   # clean master
│   ├── reports/
│   │   └── final_qc.json
│   └── final_mv.mp4                   # subtitle-burned deliverable by default
└── work/music-caption/                # disposable analysis clips
```

The manifest records artifact ownership and stage status. If source audio, caption, material brief,
or storyboard changes, the agent marks affected downstream outputs stale rather than silently
reusing them.

---

## Advanced — white-box video execution

Captioning and storyboard authoring are agent workflows. Once a validated storyboard exists, the
packaged runner exposes deterministic execution phases for debugging. Replace the placeholders below
with real absolute paths. For the installed plugin, first call `get_music2mv_runtime`: in all
commands below, replace `python3` with its `python_executable` unchanged (preserve symlinks), and
add `--expected-python-prefix "<python_prefix>"` after `"$RUNNER"`. This checks the MCP environment
before loading dependencies; direct development runs may omit this check.

```bash
SKILL_ROOT=/absolute/path/to/installed/music-to-mv
RUNNER="$SKILL_ROOT/workflows/video-generation/scripts/run_mv_pipeline.py"
STORYBOARD=/absolute/path/to/storyboard.json
AUDIO=/absolute/path/to/song.mp3
OUTPUT=/absolute/path/to/project/execution
MODEL_CONFIG=/absolute/path/to/model-config.json
RUN_CONFIG=/absolute/path/to/run-config.json

python3 "$RUNNER" validate --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

python3 "$RUNNER" plan --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

python3 "$RUNNER" base-assets --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

python3 "$RUNNER" prepare-videos --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

python3 "$RUNNER" videos --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

python3 "$RUNNER" assemble --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

python3 "$RUNNER" verify --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"
```

Inspect the `plan` output before the first paid generation call. With the default policy it must show
`semantic_quality_control.enabled=false`, `additional_omni_calls=false`, and
`video_regeneration_possible=false`.

After explicit final-MV authorization, the same execution stages can be run in one command:

```bash
python3 "$RUNNER" all --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"
```

Use `status` with the same arguments to inspect a resumable execution. Use `--segments 0,1,2` only
for a deliberate subset during white-box debugging; a final MV still requires every storyboard shot.

---

## Troubleshooting

- **The Skill is not visible after installation:** reload plugins or start a new harness session.
  Codex requires a new task or restart; Gemini CLI uses `/skills reload` and `/mcp reload`.
- **`ffmpeg` or `ffprobe` is missing:** install the system package, then rerun
  `qwen-mm-plugins-omni-chatcut --check-system`.
- **Wan reports that `dashscope` is missing:** install DashScope CLI 1.24.0 or later, or configure
  remote shot-audio URLs in the run config.
- **A model call reports a missing key:** confirm that the selected provider's `api_key_env` names an
  exported variable or a matching entry in `~/.qwen-mm-plugins/config`. Do not paste the credential
  into the model JSON, storyboard, or run config.
- **The wrong endpoint or model is used:** pass the intended `--model-config` explicitly and inspect
  the `plan` output. The per-run config takes precedence when it contains legacy connection fields.
- **Semantic QC starts unexpectedly:** inspect the run config. The only switch is
  `quality_control.enabled`; profiles and the `final_mv` target do not enable it.
- **Generation was interrupted:** confirm that the previous process has exited, then resume with the
  same project and execution directory. Successful artifacts are reused only when their execution
  signatures remain compatible.
- **Storyboard validation fails:** return to storyboard authoring and fix the reported timing,
  one-shot packaging, cast/scene, action, camera, or continuity errors before generation.
- **Subtitle assembly stops:** provide valid sentence-level SRT evidence, explicitly disable
  subtitles for that project, or confirm that the caption evidence has a validated `no_lyrics`
  result. Missing lyrics are not treated as `no_lyrics`.

For detailed workflow contracts, consult the installed Music-to-MV `SKILL.md` and load only the
internal workflow reference relevant to the failing stage.
