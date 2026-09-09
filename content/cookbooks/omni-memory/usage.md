---
title: Omni Memory
category: Search & memory
tags: [video, audio]
order: 5
---

# Cookbook — Qwen-MM-Plugins Omni Memory

The audio-visual long-video capability, `qwen-mm-plugins-omni-memory`. One omni model reads each 30s window **together with its in-video audio**, so the record it writes already holds the bindings between the two: every spoken line is attached to the person visibly saying it, with how they said it and what was audible around them. There is no separate ASR pass and no acoustic diarization — those would give you a transcript and a picture, but not what was said *while* something was done, or whether a sound came from the person on screen or from off it.

Short videos skip the memory entirely: under ~10 minutes a single tool call watches the whole thing
and answers.

---

## How it works

A build walks the video in 30s windows, each one omni call over the frames *and* the audio, carrying the previous window's state forward so identities stay canonical. It lands next to the video in `<video_path>.memory/` as five containers:

```
Entities     canonical people — person_id stable for the whole video, resolved name, appearance
Semantic     induced facts as keyed triples, e.g. David/role → "…"
Episodic     one record per 30s window: visual caption + every utterance with its speaker,
             paralinguistics and the non-speech sound around it
Scene env    durable environment / layout items
Clips        the 30s files themselves, so an answer can re-watch the source
```

Typical query = **orient once** → **one fused retrieval** → answer from the evidence, with a re-watch
of specific clips only when the record demonstrably lost something.

---

## Tools

- `get_memory_status` — does a memory exist, is it complete, how long is the video. Always first
- `get_memory_overview` — the people and fact keys a retrieval plan is written from
- `plan_and_search` — one fused retrieval from a plan you give it; returns evidence, not an answer
- `watch_and_answer` — watch a SHORT video whole, in one call, with **no memory involved**
- `replay_and_answer` — re-watch up to 3 stored clips with their audio
- `get_people` · `get_person_dialogue` — who is in it; every line one person spoke
- `search_dialogue` · `search_facts` · `search_memory` — by utterance, by fact, or one broad net
- `get_timeline` → `get_moment` — a time range, then full detail plus each clip's path

> For grouping, exact schemas and the retrieval decision table, see the capability's `SKILL.md`.

---

## Install

```bash
claude plugin marketplace add https://github.com/QwenLM/Qwen-MM-Plugins.git
claude plugin install qwen-mm-plugins-omni-memory@qwen-mm-plugins
```

Nothing else is required — unlike graph memory, this capability does not lean on another plugin to look at the source, because `watch_and_answer` and `replay_and_answer` do that themselves *with the audio*. Install `qwen-mm-plugins-core` if you also want frame-level visual inspection (`read_video` returns frames for you to look at, and drops the audio).

`ffmpeg` is required to **build** a memory and by `watch_and_answer`, which re-encodes the video
before sending it. Querying a memory that already exists needs no system tools. The build script
runs under your own `python3` rather than inside the server's environment, so it installs the two
Python packages it needs (`numpy`, `openai`) on first run if that interpreter lacks them.

```bash
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install -y ffmpeg
# Fedora / RHEL / CentOS
sudo dnf install -y ffmpeg          # or: sudo yum install -y ffmpeg
# Arch Linux
sudo pacman -S ffmpeg
# macOS (Homebrew)
brew install ffmpeg
# Windows (winget / Chocolatey)
winget install Gyan.FFmpeg          # or: choco install ffmpeg
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `DASHSCOPE_API_KEY` | Required — the omni calls that build a memory, and the embeddings behind dense retrieval. Without it, search falls back to keyword-only ranking and a build cannot run. |
| `DASHSCOPE_BASE_URL` | Optional — moves every DashScope call, this capability's included, to another host: an international station or a corporate gateway. |
| `QWEN_MM_API_OMNI_MODEL` | Optional — Omni model used for memory builds, replay, and direct watching. Defaults to `qwen3.5-omni-plus`. |
| `EMBED_BASE_URL` / `EMBED_MODEL_NAME` / `EMBED_API_KEY` | Optional — endpoint, model, and key overrides for embeddings, defaulting to DashScope with `text-embedding-v4`. Set them only to run embeddings somewhere else. |
| `MEM_LOCAL_DIR` | Optional — fixed shared root for `--namespace` memories. Without it, namespace memories are written beside the input video. Per-video memories live at `<video_path>.memory/`. |

> Only the key is required — everything else has a working default, so an exported `DASHSCOPE_API_KEY` is all it takes to run. Set it in the environment, or with **`bash install.sh`**, which writes `~/.qwen-mm-plugins/config`; the environment wins when both are present. A GUI-launched harness does not inherit a shell's exports, so there the config file is the route that works. Omni-memory shares `DASHSCOPE_BASE_URL`, `DASHSCOPE_API_KEY`, and `QWEN_MM_API_OMNI_MODEL` with the API capability.

---

## Using it

Point `@` at a video and ask in natural language. What happens next depends on how long it is, and the agent decides from `get_memory_status`, which reports the duration before any memory exists:

| Length | What the agent does |
|---|---|
| **under ~10 min** | `watch_and_answer` — one call, no memory built, done |
| **~10–30 min** | builds a memory, *unless* you have said you do not want one and just want a quick answer |
| **over ~30 min** | builds a memory, no exceptions — one request cannot hold that much video |

Two things override the table, and both are about cost rather than length:

- **Several questions about the same video → build the memory**, even a short one. A watch is stateless: every question re-uploads and re-watches. A memory is paid for once and then answers in milliseconds.
- **A memory already exists → it wins outright.** It holds every utterance with its speaker; a watch would re-upload the video to see less.


### 1. Ask about a short clip — nothing is built

```
@/data/clips/standup-2min.mp4 Who interrupts whom, and how does the other person react?
```

### 2. Ask about a long video — the agent builds first, then answers from memory

```
@/data/meetings/2026-08-20-review.mp4 What did each person commit to, and who pushed back?
```

Questions that need sight and sound held against each other are what this memory is for: who said
what, how they said it, what was happening while they said it, and what was audible that nobody
mentioned.

### 3. Explicitly skip the memory

```
@/data/interview-18min.mp4 Don't build a memory, I just need one quick answer:
does the interviewer ever raise their voice?
```

Past ~30 minutes this is refused rather than answered badly — the result says so and gives you the build command.

<details>
<summary>Advanced — build ahead of time, in batch, or across several files</summary>

Paths are relative to the skill directory — the installed plugin's skill folder, or
`src/capabilities/omni-memory/skill/` in a source checkout:

```bash
# One video → memory next to it, at <video>.memory/
python3 script/build_memory/build_memory.py /path/to/video.mp4

# Many videos → independent per-video memories, built in parallel
python3 script/build_memory/build_memory.py --video-dir /path/to/dir -j 4

# STREAMING: several files that are really one recording session → ONE continuous memory.
# A person keeps the same person_id across files, facts keep accumulating, timestamps are
# stitched end to end. Strictly serial by construction (-j is ignored), in chronological order.
python3 script/build_memory/build_memory.py --video-dir /path/to/session --namespace my_stream
python3 script/build_memory/build_memory.py next_part.mp4 --namespace my_stream --mode append
```

Useful flags: `--model NAME` (all three build stages), `--mode resume` (continue an interrupted
build), `--mode rebuild` (discard and start over), `--max-clips N` (smoke test), `--window` /
`--step` / `--height`, `--log PATH`.

The script writes its own log next to the memory (`build_<timestamp>.log`) and prints the model,
endpoint and log path on startup, so there is nothing to redirect.

**If a build is interrupted**, the library is still finalized and looks entirely normal while
answering from half a video. `get_memory_status` compares the extracted clip count against the slice
plan and is the only thing that catches it; continue with `--mode resume`.

A `--namespace` memory lives at `<video-directory>/<namespace>/` by default and is queried with both
`video_path` and `namespace`. With `MEM_LOCAL_DIR` configured, it lives at
`$MEM_LOCAL_DIR/<namespace>/` and can be queried by namespace alone.

</details>


---

## Cases

Worked examples to follow.
