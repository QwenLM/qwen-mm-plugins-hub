---
title: Vision & audio APIs
category: Understanding
tags: [image, audio]
order: 2
---

# Cookbook — Qwen-MM-Plugins API

Use `qwen-mm-plugins-api` for image, video, and audio understanding. Pair it with
[`core`](../core/usage.md) for local file reading and annotation, and
[`search`](../search/usage.md) for web search.

## Setup

```bash
claude plugin marketplace add https://github.com/QwenLM/Qwen-MM-Plugins.git
claude plugin install qwen-mm-plugins-api@qwen-mm-plugins
claude plugin install qwen-mm-plugins-core@qwen-mm-plugins
```

`core` supplies local reading, frame extraction, and annotation tools. Install ffmpeg and ffprobe
for local audio/video processing. See [installation](https://github.com/QwenLM/Qwen-MM-Plugins/blob/main/docs/en/installation.md) for other hosts.

Set credentials through the installer's **Configure** action, environment variables, or
`~/.qwen-mm-plugins/config`. Environment variables take precedence.

| Setting | Use |
|---|---|
| `DASHSCOPE_API_KEY` | DashScope vision, Omni, and Qwen3-ASR calls |
| `ORCAROUTER_API_KEY` | Calls to `api.orcarouter.ai` |
| `OPENROUTER_API_KEY` | Calls to `openrouter.ai` |
| `DASHSCOPE_BASE_URL` | Default OpenAI-compatible endpoint for VL and Omni calls |
| `ASR_SERVER_URLS` | Self-hosted Qwen3-ASR fallback |
| `SAM3_SERVER_URL` | Self-hosted segmentation service |
| `QWEN_MM_AUDIO_RAW_B64=1` | Omni endpoints that require raw audio base64; leave unset for DashScope |

See [configuration](https://github.com/QwenLM/Qwen-MM-Plugins/blob/main/docs/en/configuration.md) for all settings.

## Models and endpoints

| Tools | Default model | Alternative |
|---|---|---|
| `vision_chat`, `ocr`, `grounding` | `qwen3.7-plus` | `qwen3.8-max` |
| `omni_*` | `qwen3.5-omni-plus` | `qwen3.5-omni-flash` |

Pass `model` for an individual call, or set `QWEN_MM_API_VL_MODEL` / `QWEN_MM_API_OMNI_MODEL`
to change the corresponding default. The call's `model` takes precedence.

```text
Use vision_chat with model qwen3.8-max to summarize the slides in @demo.mp4, then use
omni_asr_timestamped with model qwen3.5-omni-plus to produce sentence-level subtitles.
```

See Model Studio's [vision catalog](https://help.aliyun.com/en/model-studio/vision-model/)
and [Omni catalog](https://help.aliyun.com/en/model-studio/omni/) for supported models and input
limits. Omni tools use non-realtime HTTP models.

### Custom endpoints

Pass `base_url` and `model` to select another compatible service. An explicit `base_url` overrides
`DASHSCOPE_BASE_URL`, and an explicit `api_key` overrides the configured key. DashScope endpoints
read `DASHSCOPE_API_KEY`; `api.orcarouter.ai` reads `ORCAROUTER_API_KEY`; `openrouter.ai` reads
`OPENROUTER_API_KEY`. For other endpoints, pass `api_key` if authentication is required, or omit it
for an authentication-free server.
The endpoint and model must support the selected tool's media format.

### OrcaRouter example

Add your key through **Configure** or in `~/.qwen-mm-plugins/config`:

```text
ORCAROUTER_API_KEY=your-orcarouter-api-key
```

Call `vision_chat` with these arguments, replacing the image path with your own file:

```json
{
  "base_url": "https://api.orcarouter.ai/v1",
  "model": "z-ai/glm-5.3-flash-free",
  "images": ["/absolute/path/photo.jpg"],
  "text": "Describe the main objects in this image."
}
```

The call reads `ORCAROUTER_API_KEY` automatically. See the
[OrcaRouter model catalog](https://www.orcarouter.ai/models) for other model IDs.

### OpenRouter example

Add your key through **Configure** or in `~/.qwen-mm-plugins/config`:

```text
OPENROUTER_API_KEY=your-openrouter-api-key
```

Call `vision_chat` with these arguments, replacing the image path with your own file:

```json
{
  "base_url": "https://openrouter.ai/api/v1",
  "model": "qwen/qwen3.7-plus",
  "images": ["/absolute/path/photo.jpg"],
  "text": "Describe the main objects in this image."
}
```

The call reads `OPENROUTER_API_KEY` automatically. This example uses
[Qwen3.7 Plus](https://openrouter.ai/qwen/qwen3.7-plus), which supports image input. See
[OpenRouter authentication](https://openrouter.ai/docs/api_reference/authentication) for key setup
and the [model catalog](https://openrouter.ai/models) for other model IDs and supported media.

For video, pass `videos` and a suitable model, such as
[Qwen3.8 Max](https://openrouter.ai/qwen/qwen3.8-max-0902):

```json
{
  "base_url": "https://openrouter.ai/api/v1",
  "model": "qwen/qwen3.8-max-0902",
  "videos": ["/absolute/path/clip.mp4"],
  "text": "Summarize the scene changes in chronological order."
}
```

Local sampled frames are sent as ordered images. Direct video URLs and video data URLs require
a model and provider that support [video input](https://openrouter.ai/docs/guides/overview/multimodal/videos).

## Tools

### Vision

- `vision_chat` — ask questions about images or videos using `images`, `videos`, and `text`.
- `ocr` — extract text from a local image.
- `grounding` — locate objects and return pixel and normalized boxes. Pass `bbox_normalized`
  to core's `draw_bbox` for annotation.

### Omni

| Tool | Use |
|---|---|
| `omni_asr` | Speech transcription |
| `omni_asr_timestamped` | Timestamped transcripts and SRT subtitles |
| `omni_multi_speaker_asr` | Speaker-labelled transcripts |
| `omni_av_caption` | Audio/video descriptions, visible text, and dialogue |
| `omni_av_grounding` | Find an event's start and end times |
| `omni_av_counting` | Count events or actions with timestamps |
| `omni_music_caption` | Music descriptions and structured tags |

Omni tools accept a local audio/video `file_path` or an HTTP(S)/OSS URL. Use `fps` and
`max_pixels` to control video sampling where the tool exposes them.

### Other services

- `transcribe_audio` — transcribe audio/video with `qwen3-asr-flash` or `ASR_SERVER_URLS`;
  returns SRT, text, or JSON.
- `segmentation` — segment a local image with a text prompt through `SAM3_SERVER_URL`.

See the [API Skill](https://github.com/QwenLM/Qwen-MM-Plugins/blob/main/src/capabilities/api/skill/SKILL.md) and MCP tool schemas for arguments.

## Media input

Remote URLs are passed to the endpoint for fetching. Local videos use these delivery paths:

- **Vision**: send local sampled frames as ordered images, or upload the video to OSS and send a
  signed URL when OSS is configured and the video fits the model's duration limit. Inline requests
  support up to 250 media items, including images and frames.
- **Omni**: transcode to fit the inline budget, then use OSS or ordered images plus audio for
  larger videos.

`dry_run=true` previews a VL or Omni request. For long recordings, use
[`video-memory`](../video-memory/usage.md) to locate relevant segments, then inspect a narrow
interval with core's `read_video`.

### OSS configuration

Set `OSS_AK`, `OSS_SK`, `OSS_ENDPOINT`, and `OSS_BUCKET`, and install the `oss` extra. To use a
direct MCP registration with both `api` and `oss` extras:

```bash
claude mcp add qwen-mm-plugins-api-oss -- \
  uvx --from \
  "qwen-mm-plugins[api,oss] @ git+https://github.com/QwenLM/Qwen-MM-Plugins.git@qwen-mm-plugins-api-v<version>" \
  qwen-mm-plugins-api
```

Use this registration in place of the marketplace API MCP server.

## Examples

### Image and video requests

```text
@receipt.jpg
OCR this receipt and total the line items.

@meeting.mp4
Transcribe this meeting with speaker labels and sentence-level timestamps. Return SRT.

@demo.mp4
Describe the clip over time, then locate when the presenter first opens the settings panel.

@workout.mp4
Count every completed push-up and list the timestamp of each repetition.
```

See the [shared image-understanding workflow](#shared-case-local-views-cloud-grounding-and-web-verification) below.

Download the sample files into a local `assets/` directory to run the examples. See the
[asset source notes](../../../public/cases/api/case-api-omni-examples/assert/SOURCES.md).

### Speech to subtitles

Transcribe a 9-second English clip with sentence-level timestamps. Download the
[sample audio](../../../public/cases/api/case-api-omni-examples/assert/guess_age_gender.wav) as `assets/guess_age_gender.wav`.

```python
omni_asr_timestamped(
    file_path="assets/guess_age_gender.wav",
    language="en",
    granularity="sentence",
    format="srt",
)
```

<details>
<summary>SRT output</summary>

```text
1
00:00:00,647 --> 00:00:05,387
I heard that you can understand what people say and even know their age and gender.

2
00:00:05,907 --> 00:00:09,017
So can you guess my age and gender from my voice?
```

</details>

### Describe a video

Follow a 15-second video of someone drawing on a tablet.

[Tablet drawing clip](../../../public/cases/api/case-api-omni-examples/assert/draw1_clip.mp4)

```python
omni_av_caption(file_path="assets/draw1_clip.mp4")
```

<details>
<summary>Caption output</summary>

```text
00:00.000 – 00:02.500
... On the tablet's screen is a cartoon-style drawing of a small guitar-like instrument (ukulele
or acoustic guitar) ... At this moment a young female voice ... says, "Hello, take a look at what
I'm drawing." ...

00:10.000 – 00:13.000
The artist taps an icon ... a vertical color-selection panel slides out ... Across the top of the
panel appears the Chinese word "颜色," meaning "Color." ...
```

</details>

### Find an event

Locate a made basket in a 20-second clip.

[Basketball clip](../../../public/cases/api/case-api-omni-examples/assert/basketball_clip.mp4)

```python
omni_av_grounding(
    file_path="assets/basketball_clip.mp4",
    query="a player making a basket",
)
```

<details>
<summary>Grounding output</summary>

```json
{
  "query": "a player making a basket",
  "matches": [
    { "start": 13.0, "end": 17.0, "score": 0.95,
      "reason": "The video shows a player shooting the basketball and it successfully going through the hoop." }
  ]
}
```

</details>

---

## Shared Case: local views, cloud grounding, and web verification

This Codex session locates cakes, annotates the image, identifies a photographed place, and verifies
the result on the web. The API part uses grounding and vision reasoning; local file/annotation work
belongs to [`core`](../core/usage.md#shared-case-local-views-cloud-grounding-and-web-verification),
and external verification belongs to
[`search`](../search/usage.md#shared-case-local-views-cloud-grounding-and-web-verification).

[Shared Core, API and Search workflow](../../../public/cases/core/case-core-codex-api-use/index.html)

> The trace predates the capability split, so API calls appear under the old
> `qwen_mm_plugins_core` namespace. Today `grounding`, `ocr`, and `vision_chat` are provided by
> `qwen-mm-plugins-api`; the recorded inputs and outputs remain representative of the shared
> workflow.
