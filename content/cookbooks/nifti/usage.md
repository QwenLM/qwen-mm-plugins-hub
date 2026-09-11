---
title: NIfTI
category: Understanding
tags: [nifti, medical-imaging]
contributors: [shiym2000]
order: 4
---

# NIfTI volume inspection

Use `qwen-mm-plugins-nifti` to inspect `.nii` and `.nii.gz` volumes, select
slices, and control their intensity display. Its `nifti_visualize` tool returns
images together with the effective settings so the same view can be checked
and requested again. The source file is read without modification.

The default native-image mode requires no model API key. If the shared
`QWEN_MM_NATIVE_MODE=0` caption fallback is enabled, rendered slices can be
sent to the configured VL endpoint. Visualization is not a clinical diagnosis.

## Setup

The capability requires NumPy, NiBabel, and Pillow, with no system application.
While its initial release is being prepared, use a checkout containing the
plugin and follow the [local development guide](https://qwenlm.github.io/qwen-mm-plugins-hub/docs/local-development/):

```bash
# Run from the Qwen-MM-Plugins checkout containing the nifti capability.
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[nifti]'
.venv/bin/python src/capabilities/nifti/qwen_mm_plugins_nifti --version
```

Register that source entry with your harness for development. Once the
maintainer publishes the capability tag, it can be installed as
`qwen-mm-plugins-nifti` through the repository's normal plugin installer.
The Hub's Tools tab is generated from the real MCP schema.

## Start with the default view

```text
@scan.nii.gz  Use the NIfTI plugin to show this volume and report the settings used.
```

The corresponding `nifti_visualize` arguments can be as simple as:

```json
{"file_path": "/absolute/path/scan.nii.gz"}
```

The tool takes three interior slices along **source voxel axis 2**, using a
five-point grid over indices `0..size-1`, dropping its endpoints and rounding
the remaining positions. For shape `(32, 40, 48)`, the default source indices
are `(12, 24, 35)`. Duplicate indices are removed for small dimensions.

Axis 2 is not necessarily an anatomical axial plane. The response reports
closest orientation codes, affine and obliquity; the displayed planes are
reordered/flipped in-plane without anatomical resampling. Known spatial units
come from the header; unknown units are explicitly interpreted as mm.

All slices from one 3D volume share its P1–P99 intensity range. Small volumes
use exact statistics; larger volumes use a deterministic regular-grid sample.
The returned report states which method was used and the actual intensity
bounds. Each displayed plane still uses its complete source slice before
image-budget resizing.

## Change slice selection

Select five slices on source axis 1:

```json
{
  "file_path": "/absolute/path/scan.nii.gz",
  "slice_axis": 1,
  "num_slices": 5
}
```

For exact locations, use zero-based indices, for example
`"slice_indices": [10, 20, 30]`. Alternatively,
`"slice_positions": [0.25, 0.5, 0.75]` specifies fractions along the selected
source axis. Set only one of these lists. An explicit list overrides
`num_slices`; duplicate resolved indices are returned once, in requested order.

## Choose an intensity display

To apply a manually selected center and width consistently across slices:

```json
{
  "file_path": "/absolute/path/scan.nii.gz",
  "intensity_mode": "window",
  "window_center": 40,
  "window_width": 400
}
```

This clips and linearly maps `[center - width/2, center + width/2]` to grayscale.
For a CT dataset whose intensities are known to be HU-like, an explicit preset
request can instead use `"intensity_mode": "preset"` and
`"window_preset": "ct_bone"`. Available presets are `ct_brain`,
`ct_soft_tissue`, `ct_lung` and `ct_bone`. Neither modality nor preset is
inferred automatically from the NIfTI file.

To return to automatic volume-level normalization, use
`"intensity_mode": "auto_volume"` and omit window arguments. Its percentile
bounds can be adjusted with `percentile_low` and `percentile_high`. Different
selected 3D volumes get separate ranges; use a manual window when an identical
numeric range is required across volumes.

## Inspect a 4D input

By default, the tool views the first 3D volume. To inspect the first and third:

```json
{
  "file_path": "/absolute/path/series.nii.gz",
  "volumes": "1,3",
  "max_volumes": 2,
  "slice_positions": [0.25, 0.5, 0.75]
}
```

Volume selection is **1-based**, while `slice_indices` are **0-based**. The
fourth dimension is not assumed to represent time. The report includes selected
volume pages and indices, along with the header's fourth-dimension spacing/unit.

## Check the result

Review the selected volumes, source axis, resolved slice indices, intensity
mode and effective bounds. Check whether statistics were sampled and whether
the response was truncated. The requested slice count can exceed the returned
count because of duplicate indices or the response-size limit; request the
remaining indices or volumes in another call.

Core's [`visualize`](../core/usage.md#nifti-volumes) retains its existing
three orthogonal center slices and per-slice normalization. When the dedicated
NIfTI tool is available, prefer it for configurable NIfTI viewing. This plugin
does not require core to be installed.

## Try a synthetic volume

The following creates a small, deterministic test image outside the repository:

```python
from pathlib import Path
from tempfile import mkdtemp

import nibabel as nib
import numpy as np

x, y, z = np.indices((32, 40, 48), dtype=np.float32)
data = 20 * x + 5 * y + z
volume = nib.Nifti1Image(data, np.diag([1.0, 1.0, 2.0, 1.0]))
volume.header.set_xyzt_units("mm")
path = Path(mkdtemp(prefix="nifti-example-")) / "synthetic.nii.gz"
nib.save(volume, path)
print(path)
```

Pass the printed absolute path to `nifti_visualize`. Expect shape `(32, 40, 48)`,
spacing `(1, 1, 2) mm`, three axis-2 slices at `(12, 24, 35)`, and one shared
automatic range. The synthetic values have no medical calibration; use them
to check the viewing workflow, not CT preset interpretation.
