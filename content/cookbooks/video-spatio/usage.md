---
title: Video-Spatio
category: Spatial reasoning
tags: [geometry, video]
contributors: [QwenLM]
order: 14
---

# Video-Spatio — reasoning about space in images and video

`qwen-mm-plugins-video-spatio` turns grounded object boxes, estimated distances, and camera-motion
estimates into a coarse scene. Its 19 tools can inspect relative layout, compare camera and object
motion, triangulate positions, count objects across frames, and suggest further observations.

The host model supplies the perception. Geometry calculations do not need an API key or a GPU
perception server. Tools that ask a vision model use the same OpenAI-compatible configuration as the
API plugin: `DASHSCOPE_BASE_URL`, the endpoint's API key, and `QWEN_MM_API_VL_MODEL`. Their `model`
argument can select a model per call.

## A single-frame layout

Ask the agent:

> Inspect this room image. Ground the chair and table, estimate their distances, and show their layout
> from the camera's perspective. Explain which conclusions depend on uncertain depth estimates.

After inspecting the image, the agent can call `build_scene` with data shaped like this. These are
illustrative observations; replace them with boxes and distances grounded in the actual image.

```json
{
  "frames": ["/absolute/path/room.png"],
  "objects_by_frame": [[
    {"label": "chair", "bbox": [200, 350, 400, 850], "depth_m": 2.0},
    {"label": "table", "bbox": [550, 350, 900, 800], "depth_m": 3.0}
  ]],
  "is_video": false
}
```

Boxes default to **0–1000 normalized coordinates**, with x first and the origin at the top-left,
regardless of the image's pixel dimensions. For raw pixels, explicitly set `bbox_format="pixels"`;
for 0–1 coordinates, use `bbox_format="normalized"`. Keep boxes ordered and inside the image.

Pass the returned `scene` object to `visualize_bev` with `viewpoint={"frame":0}`. Its forward/right
axes show the chosen camera perspective. For a virtual standpoint, use
`viewpoint={"at":"chair","facing":"table"}`. `facing_away` reverses the heading.

## Compare two video frames

Use `core`'s frame-reading/export tools if installed, or another available method to save local
frames. Inspect both images before assigning motion. This illustrative input places the second
camera one meter to the right of the first:

```json
{
  "frames": ["/absolute/path/frame_0.png", "/absolute/path/frame_30.png"],
  "frame_indices": [0, 30],
  "objects_by_frame": [[
    {"label": "chair", "bbox": [450, 350, 550, 750], "depth_m": 3.0}
  ], [
    {"label": "chair", "bbox": [143, 350, 243, 750], "depth_m": 3.16}
  ]],
  "camera_motions": [{"right_m": 1.0, "forward_m": 0.0, "yaw_deg": 0.0}]
}
```

Supply one motion per adjacent frame pair. Translations refer to the preceding camera's axes;
positive yaw means a right turn. The world uses +X right, +Y up, and -Z forward from the first camera.
All frame images must have the same dimensions.

With that scene:

- `camera_motion(scene, frame_i=0, frame_j=30)` summarizes the supplied camera poses.
- `triangulate(scene, target="chair", frame_a=0, frame_b=30)` estimates the position of a stationary
  object from the two views. Check `reliable`, the baseline, and the triangulation angle.
- `object_world_motion(scene, target="chair", frame_a=0, frame_b=30)` compares the object's estimated
  world positions after accounting for camera motion.
- `count_objects(scene, label="chair")` and `match_entities(scene, label="chair")` help group repeated
  sightings. Inspect similar nearby objects before accepting the grouping.

Omitting `camera_motions` assumes a static camera. `camera_motion` reads those stored poses; it does
not independently infer motion from the images. Triangulation cannot establish depth from a pure
turn, parallel/opposed rays, or a solution behind a camera.

## Choose additional observations

`select_keyframes` offers uniform, motion, target coverage, and covisibility strategies. Use
`assess_coverage` → `plan_exploration` to identify missing views; use `assess_reachable` or
`mobile_manip` to suggest an approach to a grounded target. These tools return plans and judgments;
they do not operate hardware. Distance alone does not establish a clear path or a feasible grasp.

Other tools include `verify_grounding`, `orient_facing`, `view_reason`, `scene_map`, `motion`,
`calibrate_scale`, and `render_scene_views`. Consult the plugin's generated tool definitions for the
available operations and required arguments.

## Interpret the results

The scene assumes a 60° horizontal field of view and planar camera motion. Pitch is recorded but
is not incorporated into the planar geometry. Depth estimates, uncertain camera motion, occlusion,
and mistaken object correspondence can dominate the numerical error.

Check boxes against the image, retain units, and state uncertainty. A BEV image and geometry computed
from the same inputs are not independent measurements. If the observations cannot support a metric
answer, explain what is missing instead of reporting a precise number.
