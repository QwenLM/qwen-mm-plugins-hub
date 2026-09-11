---
title: Omni ChatCut
category: Generation
tags: [video, audio]
order: 11
---

# Cookbook — Qwen-MM-Plugins Omni ChatCut

Choose a workflow, provide readable local source media and a project directory, and tell the agent
whether you want analysis, a reviewed plan, or a finished video.

| Workflow | Input | Result |
|---|---|---|
| [Movie Commentary](#movie-commentary) | A movie or long video | A shorter narrated edit using source footage, commentary subtitles, and selected original dialogue |
| [Music2MV](#music2mv) | A local music file | Generated shots assembled against the original song, with lyric subtitles by default |
| [Video Translation](#video-translation) | A video with speech | A translated dub guided by the original speakers' voices, retaining the source picture |

## Shared setup

### Installation

Install `omni-chatcut` once to obtain all three Skills and their MCP tools. For Claude Code:

```bash
claude plugin marketplace add https://github.com/QwenLM/Qwen-MM-Plugins.git
claude plugin install qwen-mm-plugins-omni-chatcut@qwen-mm-plugins
```

For other supported clients, run the guided installer and select **Omni ChatCut**:

```bash
curl -fsSL https://raw.githubusercontent.com/QwenLM/Qwen-MM-Plugins/main/install.sh | bash
```

Restart or reload the client after installation. See the [installation guide](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/installation/)
for client activation, or the [execution reference](#development-and-configuration-overrides)
for a dedicated development checkout. Released and development versions may differ.

The Skill names are `qwen-mm-plugins-omni-chatcut-movie-commentary`,
`qwen-mm-plugins-omni-chatcut-music-to-mv`, and `qwen-mm-plugins-omni-chatcut-video-translation`.

All workflows require `ffmpeg` and `ffprobe` on the execution host:

```bash
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install -y ffmpeg

# macOS
brew install ffmpeg
```

| Workflow | Additional requirements |
|---|---|
| Movie Commentary | Omni, a client supporting separate planner/executor agents, a TTS engine, and a subtitle font. Default Chinese narration uses Edge TTS. |
| Music2MV | Omni and the selected image/video services; the default Wan upload route also needs DashScope CLI. |
| Video Translation | Omni and an external dubbing service providing `/health`, `/tts`, `/separate`, and `/vad`, including separation/VAD for analysis-only use. |

The Python extra does not install Edge TTS or GPU dubbing models. Prepare Edge TTS in the commentary
executor's environment; deploy IndexTTS2, Demucs, and TEN-VAD separately for Video Translation.

### Connections

Copy the bundled model-connection template into a user-owned location:

```bash
mkdir -p ~/.qwen-mm-plugins/omni-chatcut
MV_SKILL_ROOT=/absolute/path/to/installed/music-to-mv
cp "$MV_SKILL_ROOT/assets/model-config.example.json" \
  ~/.qwen-mm-plugins/omni-chatcut/model-config.json
```

From a source checkout, run `bash install.sh --setup`, select **Omni ChatCut**, and set
`QWEN_MM_OMNI_CHATCUT_MODEL_CONFIG` to that file's absolute path. Shared settings live in
`~/.qwen-mm-plugins/config`, which GUI clients can also read; process environment variables take precedence.

Configure only the services you use. These are placeholders, not a shell script:

```text
QWEN_MM_OMNI_CHATCUT_MODEL_CONFIG=/absolute/path/to/model-config.json
DASHSCOPE_API_KEY=<your-Beijing-region-model-studio-key>
ARK_API_KEY=<only-if-using-Seedream-or-Seedance>
QWEN_MM_DUBBING_SERVER_URL=http://your-dubbing-service
```

The JSON stores credential variable names rather than secret values. Keep credentials out of project artifacts.

| Connection | Repository template / base URL |
|---|---|
| Omni, shared by all workflows | `qwen3.5-omni-plus` · `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Qwen Image, Music2MV identities | `qwen-image-3.0-pro` · `https://dashscope.aliyuncs.com` |
| Wan, Music2MV shots | `wan3.0-video` · `https://dashscope.aliyuncs.com` |
| Seedream / Seedance, optional Music2MV providers | `https://ark.cn-beijing.volces.com` |
| Video Translation service | Your `QWEN_MM_DUBBING_SERVER_URL` |

Image/video adapters append their API paths: do not add `/compatible-mode/v1` to Qwen Image/Wan or
`/api/v3` to Ark. The default DashScope route uses a Beijing-region key without a workspace ID.
For workspace endpoints and configuration overrides, see the [execution reference](#development-and-configuration-overrides).

### Project scope

Use a durable project directory per source and workflow. New Movie Commentary and Video Translation
projects require an empty directory; explicitly request resume for an existing project. Keep the source
readable and allow only one execution to write to a project at a time.

Analysis and planning stop before media generation/TTS, but analysis can call remote models and services.
Requesting a finished video or resuming production authorizes the corresponding generation calls.
Music2MV semantic shot QC remains a separate opt-in feature.

The agent performs creative decisions and evidence/quality review; tools enforce their documented
contracts. A passing tool response alone does not prove that all required agent reviews were performed.

### Development and configuration overrides

Use a dedicated checkout on the intended branch:

```bash
git clone https://github.com/QwenLM/Qwen-MM-Plugins.git
cd Qwen-MM-Plugins
git switch your-development-branch
bash install.sh local
```

Local installation writes absolute checkout paths into tracked manifests. Restore those changes with
`bash install.sh local --restore` before using the checkout for a release. Restart or reload the harness
after installation. See the [installation guide](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/installation/)
for harness-specific activation. A released installation may differ from a development-branch workflow.

An explicit `omni_call.model_config_path` or Music2MV CLI `--model-config` overrides the shared model-file
path. Music2MV's per-run `--config` controls provider selection, generation, subtitles, rate limits,
and QC; legacy connection fields in that file override the unified model file. Update copied project
configs when migrating endpoints or providers.

For workspace-specific Qwen Image/Wan endpoints, configure `base_url`, `workspace_id_env`, and the
matching workspace credential together. From a checkout, inspect dependencies and tool registration with:

```bash
uv run --extra omni-chatcut qwen-mm-plugins-omni-chatcut --check-system
uv run --extra omni-chatcut qwen-mm-plugins-omni-chatcut --list-tools
```

## Movie Commentary

Create a narrated retelling from actual source footage. Provide the movie path, narration language,
desired length, editorial brief, and project directory.

### Workflow

```text
source movie
  → measured execution facts + complete chronological Omni watch notes
  → planner narration + evidence-backed editing plan → plan validation
  → frozen execution shards
  → executor TTS → measured speech duration → exact source cuts, subtitles, and source-audio mix
  → independent shard QA → ordered final assembly → measured final QA
  → commentary.mp4 + QA report
```

The agent measures the credits boundary, usable source range, source subtitle band, output aspect ratio,
and subtitle font/style. Project initialization does not measure all these facts automatically.
Omni analyzes the complete film chronologically, normally in 5–8 minute clips with 5–10 seconds of overlap.
Accepted notes must cover the whole source without gaps before narration begins; names, motives, dialogue,
and the ending must be grounded in this evidence.

One planner writes and revises the narration and editing plan. The validated plan is frozen into shards,
normally 10 consecutive segments each. Separate executors, at most three concurrently, synthesize speech
first and use its measured duration to select exact footage within evidenced source windows.
Visual cuts follow complete narration sentences; subtitle cues can be shorter for readability.

Executors measure each shard, and the orchestrator independently checks shards and the assembled video:
decode, timing/frame counts, seams, loudness/peaks, black/frozen frames, silence, subtitles, and retained
dialogue. The delivery tool checks files and reported QA; it does not perform those media measurements itself.

### Defaults and use

Chinese narration defaults to Edge TTS `zh-CN-YunxiNeural` at `+20%`, with no extra `atempo` speedup.
Narration targets approximately −19 LUFS; the initialized program target is −18 LUFS and −1.5 dBTP.
For another language, select and record a suitable voice.

Ordinary narration uses quiet ducked source audio. Selected original dialogue can play at natural speed,
normally for 3–8 seconds between narration sentences, with commentary voice/subtitles and added BGM muted.
No separate BGM is added without a licensed BGM manifest. Preserve the source aspect ratio and position
commentary subtitles using the measured source subtitle band.

```text
Use the Movie Commentary skill to turn /data/video/movie.mp4 into an approximately
8-minute Chinese commentary. Keep the project at /data/projects/movie-commentary.
Explain the main characters' decisions and the ending from complete source evidence.
Use the default Chinese voice, preserve the source aspect ratio, include readable
commentary subtitles, and retain a few pivotal original lines where supported.
Use no added BGM. Render and validate the finished commentary, then return the video
and QA report.
```

Requested length guides planning; measured TTS and retained dialogue determine the final duration.
For a strict duration limit, review the plan estimate before production.

| Intent / target | What to ask the agent |
|---|---|
| Analysis · `analysis_only` | Analyze the complete movie, measure execution facts, save chronological notes, and stop before narration or TTS. |
| Plan · `plan_only` | Continue the analyzed project; write and validate the narration and editing plan, then stop before rendering. |
| Finished video · `full` | Complete all shards, assemble the commentary, and pass final QA. |
| Resume · `resume` | Inspect the same project, preserve approved narration/order, reuse compatible shards, and finish with final QA. |

### Outputs and recovery

Paths below are relative to the project directory.

| Artifact | Purpose |
|---|---|
| `plan/execution_facts.json`, `plan/watch_notes/` | Measured source facts and raw/accepted viewing evidence |
| `plan/narration_script.md`, `plan/editing_plan.json` | Reviewable narration and validated editing decisions |
| `shards/`, `out/shard_01/` | Frozen execution units, shard videos, and `exec_report.json` reports |
| `full/commentary.mp4`, `full/orchestrator_qa_full.json` | Final video and measured QA to deliver together |

- **Missing evidence:** reanalyze failed intervals and finish source measurements before planning.
- **Plan changes:** return defects to the planner, revalidate, and rebuild affected shards; preserve compatible work.
- **TTS or footage search fails:** retain the shard's work and executor context. Local footage re-pinning is
  allowed only inside evidenced intervals after complete planning evidence exists; report `degraded_local_repin`.
- **Final QA fails:** repair the measured issue and reassemble; missing measurements cannot be marked passing.

A finished commentary requires resolved shards, final assembly, and independent measured QA. See
[tools and QA boundaries](#movie-commentary-tools-and-qa-boundaries) for direct tool use.

### Movie Commentary tools and QA boundaries

These are MCP tools invoked by the agent, not shell commands:

| Tool | Purpose |
|---|---|
| `prepare_movie_commentary_project` | Probe the source and initialize or inspect a project; resume requires `resume=true` |
| `omni_call` | Analyze source clips and ground exact footage inside evidenced intervals |
| `validate_movie_commentary_plan` | Check plan structure, source/evidence references, audio modes, and narration-script consistency |
| `shard_movie_commentary_plan` | Freeze consecutive plan segments; defaults to 10 per shard, accepts 1–20 |
| `validate_movie_commentary_delivery` | Check shard IDs, required report fields/statuses, nonempty video files, and reported QA results; optionally require final files and QA |

There is no single Movie Commentary render tool that replaces the planner/executor workflow. The agents
perform TTS and local media execution under the documented contracts. For a checkpoint after all shards
are rendered, the delivery validator accepts:

```json
{
  "project_dir": "/data/projects/movie-commentary",
  "require_final": false
}
```

This checks the shards; it does not mean that final assembly passed. After final assembly and independent
QA, call the same tool with `require_final=true`.

The Movie Commentary delivery validator does not itself run FFmpeg/ffprobe, measure loudness, inspect
frames, or enforce the full set of workflow QA measurements. Executors and the orchestrator must carry
out those checks and preserve their results before validation. The validator accepts reported boolean
checks; all-true report fields alone do not prove that the measurements were performed.

`highlight_sync` is a workflow treatment, not a valid `audio_plan.source_audio_mode`; that field accepts only `ducked_bed` or `muted`. Shard files are protected against overwrite by default, but `overwrite=true` is supported. Revise and validate the parent plan before rebuilding affected shards.

## Music2MV

Generate new shots from a local music file. A music caption and a validated storyboard are intermediate
artifacts that can be reused when continuing a project; they do not replace the source audio required
for video generation and final assembly. The current executor supports `live_action`; 2D/3D animation
fails execution validation.

### Workflow

```text
local music → input checks
  → independent structure/ASR + sentence SRT + global caption (parallel when supported)
  → structure validation and slicing; independent lyric validation
  → per-clip vocal/instrument analysis → evidence validation → complete caption with both timelines
  → creative blueprint + timed storyboard → structure/continuity and execution/provider checks
  → Wan identity portraits / Seedance Ark asset bindings → identity and request-package review
  → batch shot generation, polling, and download (one continuous shot per candidate request)
  → optional semantic shot QC and bounded regeneration (off by default)
  → clip probing and exact-frame normalization → local assembly + original song
  → configured lyric subtitles → final technical verify → final_mv.mp4 + final_qc.json
```

Structure drives clip analysis and remains in `slice-manifest.json`, `evidence.json` under
`structure.segments`, and the final caption's `Structure Timeline`. Sentence lyrics have an independent
`Lyrics Timeline`; structure-branch ASR is only secondary lyric evidence. Save successful responses as they
arrive so analysis can resume without repeating completed calls.

Authoring develops the whole-film direction, visual units, and edit outline, then cast/scenes and detailed
shots with action, camera, continuity, and music anchors. Shot functions are `dance`, `narrative`, `concept`,
or `performance`. Scenes remain text. Identity references control the person; each request carries the
shot's scene, wardrobe, action/camera plan, and matching audio interval. All edit boundaries are created
locally; retries or semantic regeneration may create several candidates for the same shot.

Checks occur at the stages shown above. Optional Omni semantic QC reviews downloaded candidates before
assembly. Final `verify` follows assembly and subtitle handling; its technical report does not establish
identity, action, or lip-sync correctness. Identity and request-package reviews remain agent responsibilities.

### Providers and use

| Role | Default | Alternative |
|---|---|---|
| Analysis / optional semantic QC | Configured Qwen Omni | Change the model connection as needed |
| Wan identity portraits | Qwen Image 3.0 | Seedream |
| Video generation | Wan 3.0 | Seedance with existing Ark image asset IDs |

For Wan, generate one reusable fictional-adult identity portrait per cast member. The default local
shot-audio upload requires DashScope CLI 1.24.0 or later unless usable remote audio URLs are configured:

```bash
uv tool install 'dashscope>=1.24.0'
dashscope --help
```

Keep connections in the shared model JSON; copy the execution template for provider, generation, subtitle,
assembly, and QC settings:

```bash
MV_SKILL_ROOT=/absolute/path/to/installed/music-to-mv
cp "$MV_SKILL_ROOT/workflows/video-generation/assets/api-config.example.json" \
  /absolute/path/to/project/run-config.json
```

For Seedance, bind each fixed cast member to an existing public or uploaded/authorized adult Ark image
asset in `providers.seedance.official_identity_assets`. Prefer user-supplied assets, then the bundled
public portrait pool. Seedance skips portrait generation and asset registration; its generation route
needs an Ark API key, while Omni still needs its own configured access.

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

The asset ID is an example preset; choose one matching the project. Local images, ordinary image URLs,
and generated portraits are not fixed-character fallbacks. Complete any new authorized upload before
supplying its asset ID. Missing bindings block paid generation; provider duration/reference limits still apply.

```text
Use the Music-to-MV skill to create a complete MV for /data/music/song.mp3.
Keep the project at /data/projects/song-mv. Develop the visual direction from the
music structure and lyrics, validate the blueprint and timed storyboard, generate
all shots, and assemble them against the original song. Burn accepted lyrics when
present, verify the final MV, and return it with the report. Leave semantic QC off.
```

| Intent / target | What to ask the agent |
|---|---|
| Analysis · `analysis_only` | Analyze the song and stop after the complete caption, structure timeline, and independent lyric timeline; return evidence and artifact paths. |
| Storyboard · `storyboard_only` | Continue from the caption; create and validate the blueprint and timed storyboard without image/video generation. |
| Finished video · `final_mv` | Generate remaining assets, assemble with the original song, handle subtitles, and verify the result. |
| Resume · `resume` | Inspect the same project and execution directory; reuse compatible assets/task IDs and finish the MV. |

**Semantic QC is off by default.** Explicitly request it or set `quality_control.enabled=true`; profiles
and `final_mv` do not enable it. The default enabled policy accepts `fully_compliant` and `minor_issues`,
regenerates `major_issues`, and keeps at most three candidates per shot. If all are rejected, it selects
the best retained candidate and reports its remaining issues. This adds Omni reviews and possible video calls.

The default `standard` profile burns accepted sentence-level lyrics. A validated `no_lyrics` result
produces an uncaptioned MV; missing or malformed lyrics block subtitle assembly. Subtitles may also be
explicitly disabled in the run config.

### Outputs and recovery

| Artifact, relative to the project | Purpose |
|---|---|
| `analysis/music-caption/caption.md` | Complete caption including `Structure Timeline` and `Lyrics Timeline` |
| `analysis/music-caption/evidence.json`, `analysis/music-caption/slice-manifest.json` | Validated evidence and corrected structure/slicing timeline |
| `analysis/music-caption/lyrics.srt`, `analysis/music-caption/runs/` | Accepted lyrics when present; raw responses and resumable analysis state |
| `authoring/` | Creative blueprint, storyboard, structural validation, and continuity reports |
| `music2mv-manifest.json`, `execution/state.json` | Project ownership, stage state, and resumable execution |
| `execution/video_segments/assembled_with_audio.mp4` | Clean master preserved when subtitle rendering is enabled |
| `execution/final_mv.mp4`, `execution/reports/final_qc.json` | Final MV and technical report |

- **Analysis interrupted:** resume saved branches; recreate missing temporary clips from retained structure.
- **Timing or storyboard invalid:** repair the owning analysis/authoring stage and revalidate. Keep slicer
  diagnostics for merged sub-second sections or a final endpoint clamped to the real audio end.
- **Generation interrupted:** resume compatible task IDs and assets. Changed source, caption, storyboard,
  or provider settings require checking downstream compatibility before reuse.
- **Upload/runtime problems:** check DashScope CLI and query `get_music2mv_runtime`; direct execution must
  use its returned Python executable and prefix. See the [runner reference](#music2mv-runner).

Delivery requires approved authoring, compatible execution, successful assembly, passing technical QC,
and the configured semantic-QC outcome. When semantic QC is off, report it as skipped.

### Music2MV runner

Captioning and storyboard authoring are agent workflows. Once a validated storyboard exists, the
packaged runner exposes deterministic execution phases for debugging. Replace the placeholders below
with real absolute paths. First ask the agent to call `get_music2mv_runtime` with `{}`.
Copy the returned `python_executable` and `python_prefix` into `MV_PYTHON` and `MV_PYTHON_PREFIX` below
without resolving the executable symlink. Query again after an MCP restart or reinstall.
If the runtime tool is unavailable, restore the MCP connection before running the scripts:

```bash
MV_PYTHON=/exact/python_executable/from/get_music2mv_runtime
MV_PYTHON_PREFIX=/exact/python_prefix/from/get_music2mv_runtime
SKILL_ROOT=/absolute/path/to/installed/music-to-mv
RUNNER="$SKILL_ROOT/workflows/video-generation/scripts/run_mv_pipeline.py"
STORYBOARD=/absolute/path/to/storyboard.json
AUDIO=/absolute/path/to/song.mp3
OUTPUT=/absolute/path/to/project/execution
MODEL_CONFIG=/absolute/path/to/model-config.json
RUN_CONFIG=/absolute/path/to/run-config.json

"$MV_PYTHON" "$RUNNER" --expected-python-prefix "$MV_PYTHON_PREFIX" validate --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

"$MV_PYTHON" "$RUNNER" --expected-python-prefix "$MV_PYTHON_PREFIX" plan --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

"$MV_PYTHON" "$RUNNER" --expected-python-prefix "$MV_PYTHON_PREFIX" base-assets --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

"$MV_PYTHON" "$RUNNER" --expected-python-prefix "$MV_PYTHON_PREFIX" prepare-videos --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

"$MV_PYTHON" "$RUNNER" --expected-python-prefix "$MV_PYTHON_PREFIX" videos --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

"$MV_PYTHON" "$RUNNER" --expected-python-prefix "$MV_PYTHON_PREFIX" assemble --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"

"$MV_PYTHON" "$RUNNER" --expected-python-prefix "$MV_PYTHON_PREFIX" verify --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"
```

Inspect the `plan` output before the first paid generation call. With the default policy it must show
`semantic_quality_control.enabled=false`, `additional_omni_calls=false`, and
`video_regeneration_possible=false`.

After explicit final-MV authorization and the required agent reviews, run the execution sequence with:

```bash
"$MV_PYTHON" "$RUNNER" --expected-python-prefix "$MV_PYTHON_PREFIX" all --storyboard "$STORYBOARD" --audio "$AUDIO" \
  --output "$OUTPUT" --model-config "$MODEL_CONFIG" --config "$RUN_CONFIG"
```

Use `status` with the same arguments to inspect a resumable execution. Use `--segments 0,1,2` only
for a deliberate subset during white-box debugging; a final MV still requires every storyboard shot.

The atomic MCP tools are `omni_call`, `slice_audio_from_structure`, and `get_music2mv_runtime`.
Caption and storyboard authoring are agent workflows; the runner executes an already validated storyboard.

The `all` command runs validation, base assets, videos, assembly, and final verification. It does not independently perform the agent's identity or request-package reviews. Complete those workflow reviews before the paid video run.

Final `verify` passes on successful shot count, total normalized frames, final frame count, and dimensions. Black intervals and silence events are recorded but do not enter the current `passed` decision. This report has `qc_scope="technical_only"`.

## Video Translation

Translate speech and optionally render a dub using per-unit references from the original speakers.
Provide the video, source language or automatic detection, target language, style, and project directory.
The source video stream is retained; burned-in source subtitles are not redrawn. Compatible subtitle
streams are preserved, and the translated text is available in the plan and summary.

### Workflow

```text
source video
  → Omni speech/subtitle/speaker evidence + VAD on separated vocals
  → agent-reviewed transcript and timing
  → translated dubbing units + per-unit same-speaker references → plan validation
  → reference-guided TTS → measured duration fitting
  → reviewed background decision + full-program mix/normalization
  → source-picture remux + technical QA → agent listening review + delivery validation
  → translated.mp4 + readable summary
```

Videos up to 600 seconds use one full-video Omni request with audio; longer videos use ordered windows
with reconciled speaker identities. Every accepted transcript needs separated-vocal VAD evidence.
The agent resolves timing disagreements from audible speech, subtitles, dialogue order, and speaker
continuity: a VAD interval is not necessarily a sentence or speaker turn.

Translate for natural speech while preserving meaning, names, and tone. Adjacent same-speaker fragments
may form one dubbing unit; every accepted source segment must be used exactly once, in order, without
cross-speaker merges. Record mappings, merge reasons, and a clean voice reference for each unit.
Prefer the unit's own speech, extending through nearby same-speaker speech when needed; references must
exclude other speakers. One convenient reference should not automatically serve every unit.

IndexTTS2 speech is measured before fitting. Each unit may borrow up to 0.3 seconds per neighboring silent
gap, also capped at half that gap. Short speech keeps its natural speed with silence before/after it;
long speech may speed up by at most `1.18x`, without clipping or overlap. Limited candidate retries handle
TTS variance; if speech still cannot fit, revise and revalidate the translation. The `1.35x` estimate
controls extra retries, not playback speed or unconditional rejection before synthesis; see the
[candidate policy](#video-translation-candidate-policy).

Before rendering, the agent checks the complete separated background once: omit effectively silent
stems; otherwise use a full-stem Omni review, defaulting to include when uncertain. Pass the decision as
`background_mode`; the renderer does not perform this assessment and defaults to `include`.
The final 48 kHz stereo mix receives measured two-pass normalization to −16 LUFS, −1.5 dBTP, and 11 LRA.

After rendering, the agent uses Omni and listening checks to review meaning, timing, voice references,
naturalness, and mix, then records the review. Delivery validation independently checks media, source-picture
preservation, hashes, segment accounting, and review records; it does not listen to verify subjective judgments.

### Service and use

Configure `QWEN_MM_DUBBING_SERVER_URL`. The external service must provide health/model readiness,
audio separation, VAD, and reference-guided TTS through `/health`, `/separate`, `/vad`, and `/tts`.
Run `check_dubbing_service` before production. A service administrator supplies the GPU environment and
models; the installed Skill includes `references/dubbing-service.md` and `references/launch_dubbing_server.py`.
Returned audio must be saved locally; a remote server's filesystem path is not a usable project artifact.

```text
Use the Video Translation skill to translate /data/video/source.mp4 from Chinese
to English and create a speaker-preserving dub. Keep the project at
/data/projects/source-en and use my configured dubbing service. Preserve meaning,
names, and tone in natural spoken English. Keep the original picture, assess the
separated background, and retain it when useful. Validate the translation plan,
render the dub, review the speech and mix, and validate the final delivery.
Return the video and readable summary, including any lines recommended for listening.
```

| Intent / target | What to ask the agent |
|---|---|
| Analysis · `analysis_only` | Review source transcript, speakers, and timing with Omni and separated-vocal VAD; stop before translation/TTS. This still needs the dubbing service. |
| Plan · `translation_only` | Write and validate the translated plan, source mappings, and per-unit references; stop before TTS. |
| Finished video · `full` | Render the dub, review speech/mix, and pass independent delivery validation. |
| Resume · `resume` | Reuse compatible analysis, stems, and TTS in the same project; finish rendering and review. |

For a specific repair, name the unit and audible problem:

```text
In /data/projects/source-en, DUB_0007 sounds rushed. Review its meaning, wording,
grouping, voice reference, and available time. Repair that unit, validate any plan
changes, reuse other compatible speech, and rebuild and review the final dub.
```

### Outputs and recovery

| Artifact, relative to the project | Purpose |
|---|---|
| `analysis/transcript.json`, `analysis/vad.json` | Accepted source speech, speaker/timing evidence, and VAD |
| `plan/translation_plan.json` | Validated source mappings, translations, timing, and per-unit references |
| `work/` | Reusable separated stems, reference clips, and raw/fitted TTS; retain for resume |
| `full/translated.mp4`, `full/translation_summary.md` | Final video and readable summary to deliver together |
| `full/translation_diagnostics.json` | Per-unit timing and automatic risk flags |
| `full/render_report.json`, `full/final_qa.json`, `full/agent_review.json` | Render measurements, technical QA, and agent review |

Report the number of dubbing units and flagged units, then list recommended listening segments with
time range, translated text, and reason. Read the full summary/diagnostics to include that text.
Even without flags, perform an end-to-end listening check for ordering, pronunciation, voice continuity,
overlap, and mix balance.

- **Service unavailable:** restore health and models before analysis or synthesis; installation alone does not deploy them.
- **Poor timing/reference:** resolve disputed source boundaries or select clean same-speaker speech, then revalidate.
- **Rushed or underfilled translation:** review meaning and grouping; preserve real pauses, never clip speech or slow it just to fill time.
- **Reuse/repair:** revalidate changed plans and rebuild the final delivery. Changing TTS service/model settings
  requires explicit regeneration because those settings are absent from the current raw-TTS cache signature.
- **Delivery rejected:** fix media or review issues and rerun review for the current output; an old passing review is insufficient.

See [tools and reuse](#video-translation-tools-and-reuse) for selected-unit regeneration
and cache rules. Completion requires both technical success and a passing review tied to the current plan/output.

### Video Translation candidate policy

An unusually long TTS sample may be generation variance. The authoring workflow directs the agent to
shorten clearly overlong wording. The renderer's `1.35x` estimate controls additional candidate retries;
actual acceptance always requires no more than `1.18x` acceleration:

| Available candidate / estimate | Current renderer behavior |
|---|---|
| Reuse enabled, matching cache, actual speech fits at up to `1.18x` | Reuse it regardless of the estimate; make no new TTS call. |
| Estimate at most `1.35x`, no fitting cache | Try up to three candidates total for that unit; an overlong matching cache counts as the first, leaving at most two new calls. Accept the first candidate that fits. |
| Estimate above `1.35x`, no matching reusable cache | Allow one initial synthesis and accept it if the actual duration fits. Do not retry an overlong result. |
| Estimate above `1.35x`, matching cache is overlong | Make no new TTS call; stop and request a shorter translation. |

If the allowed candidates remain too long, shorten the affected translation and validate the plan again.
The estimate is not a permitted playback speed or an unconditional pre-synthesis rejection threshold.
Candidate acceptance here measures duration; the subsequent listening review still checks natural delivery.

### Video Translation tools and reuse

These MCP tools support the workflow:

| Tool | Purpose |
|---|---|
| `prepare_video_translation_project` | Probe and initialize the project or inspect it with `resume=true` |
| `omni_call` | Understand source speech/subtitles, assess the full background stem, and review the rendered dub |
| `check_dubbing_service` | Check service readiness |
| `separate_dubbing_audio` | Save project-local vocals/background from the service |
| `detect_dubbing_speech` | Obtain mandatory VAD evidence |
| `validate_video_translation_plan` | Check source/evidence bindings, source accounting, references, and plan validity |
| `synthesize_dubbing_speech` | Synthesize speech from translated text and a local voice reference |
| `render_video_translation` | Run deterministic separation/reuse, TTS fitting, mixing, remux, and technical reports |
| `validate_video_translation_delivery` | Independently check the rendered file and its technical and agent-review contracts |

After a validated plan exists and the background decision is made, the renderer accepts the following
MCP arguments. This example explicitly includes the background; use the reviewed decision for a real run:

```json
{
  "project_dir": "/data/projects/source-en",
  "reuse_existing": true,
  "background_mode": "include",
  "regenerate_segment_ids": []
}
```

For another TTS pass on selected unchanged plan units, set `regenerate_segment_ids` to existing IDs,
for example `["DUB_0007"]`. This requests synthesis for those units; it does not revise their translation.
The renderer still rebuilds the final mix and delivery. Setting `reuse_existing=false` requests broader
regeneration and should be reserved for cases that need it. Final agent review must match the newly
rendered output and current plan before calling the delivery validator.

Raw TTS reuse currently matches the translated text and the extracted reference-audio hash, then checks
the cached speech against the current slot. A plan change therefore requires revalidation but need not
regenerate every raw utterance. The renderer rebuilds references, fitted speech, the mix, and the final
video. After changing TTS service/model settings, explicitly regenerate the affected units or disable
reuse, since those settings are not included in the current raw-TTS signature.

The render tool's direct response omits each flagged unit's translated text. Read `full/translation_summary.md` or `full/translation_diagnostics.json` to include the text in the user-facing listening list.

Voice-reference guidance normally calls for at least 1.5 seconds of usable voice. Extend through adjacent
same-speaker speech only across gaps no greater than 1.2 seconds; otherwise prefer nearby clean speech,
using the longest clean segment as a last fallback. TTS emotion controls stay at service defaults.
The mix uses `amix normalize=0` without automatic sidechain ducking, then normalizes the complete program once.

## Shared troubleshooting

- **Missing Skill/tool:** reload the plugin or start a new session; confirm the installed version includes the workflow.
- **Media failure:** check `ffmpeg`, `ffprobe`, and required fonts on the execution host.
- **Connection failure:** check shared settings, model JSON, run overrides, and matching endpoint/key regions.
- **Incomplete project:** inspect saved state and reports through the owning Skill; existing files alone do not establish completion.

The installed Skills and their referenced `pipeline-contract.md` files define detailed execution contracts.
The advanced sections above cover CLI commands, tool arguments, and implementation details.
