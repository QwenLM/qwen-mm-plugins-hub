---
title: NIfTI
category: Understanding
tags: [nifti, medical-imaging]
contributors: [shiym2000]
order: 4
---

# Cookbook — Qwen-MM-Plugins NIfTI

Use `qwen-mm-plugins-nifti` to inspect a local `.nii` or `.nii.gz` file, choose slices,
and compare views with explicit display settings. Both tools open the source read-only.

## Tools

- `nifti_inspect` — read header metadata, including dimensions, spacing, and orientation.
- `nifti_render_slices` — render selected slices and report the effective display settings.

Call either tool directly; rendering does not require an inspection call first.
The Tools tab contains the complete arguments and defaults.

## Install

```bash
claude plugin marketplace add https://github.com/QwenLM/Qwen-MM-Plugins.git
claude plugin install qwen-mm-plugins-nifti@qwen-mm-plugins
```

For other harnesses, use this plugin's Install tab. NumPy, NiBabel, and Pillow are
installed with the plugin; no system application is required. The default native-image
mode needs no API key. With `QWEN_MM_NATIVE_MODE=0`, rendered images can be sent to the
configured VL endpoint for captions.

## Workflow

Start with a local file and the question you want to answer. Inspect its header when
shape, spacing, or orientation matters; request a view directly when you want slices.
After rendering, check the reported source axis, slice indices, selected volumes, and
intensity bounds before comparing images or asking for a more specific view.

Source voxel axes need not match anatomical planes. Oblique data is not resampled,
and unknown spatial units are reported with an mm assumption. These views support
inspection and visualization, not clinical diagnosis.

## Example requests

### Check the header

```text
@scan.nii.gz  Report the dimensions, voxel spacing, and orientation without rendering images.
```

Expect header metadata without an intensity scan or image output. A 4D file also
reports its fourth-dimension spacing and units; that dimension is not assumed to be time.

### Start with an overview, then choose a view

```text
@scan.nii.gz  Show the default slices and tell me which source axis and slice indices were used.
```

The default view selects three interior slices along source voxel axis 2. Slices from
one 3D volume share a P1–P99 intensity range. The report identifies the bounds and
whether their calculation used a sample.

```text
@scan.nii.gz  Show five evenly spaced slices along source voxel axis 1.
```

For precise locations, ask for zero-based slice indices or fractional positions along
the chosen axis. For example: “Show source axis 2 at slice indices 10, 20, and 30.”

### Use the same intensity window across volumes

```text
@series.nii.gz  Show the first and third volumes at 25%, 50%, and 75% along source axis 2.
Use window center 40 and width 400 for both volumes, and report the settings.
```

A corresponding `nifti_render_slices` call is:

```json
{
  "file_path": "/absolute/path/series.nii.gz",
  "volumes": "1,3",
  "max_volumes": 2,
  "slice_axis": 2,
  "slice_positions": [0.25, 0.5, 0.75],
  "intensity_mode": "window",
  "window_center": 40,
  "window_width": 400
}
```

Volume numbers start at **1**; explicit slice indices start at **0**. A manual window
keeps the same numeric intensity range across volumes, whereas automatic normalization
calculates a separate range for each volume. Choose the window for your data; the values
above are an example. CT presets require an explicit request and HU-like input values.

## Case — try a synthetic volume

This reproducible example needs no scan download. Run it in a Python environment with
NumPy and NiBabel installed, then give the printed path to your agent:

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

Ask for its header and a default view, using the two example requests above. Expect:

- Shape `(32, 40, 48)`, spacing `(1, 1, 2) mm`, and one 3D volume.
- Three slices on source axis 2 at indices `(12, 24, 35)`.
- One shared automatic intensity range across the three slices.

The synthetic values have no medical calibration. Use this case to check file loading,
slice selection, and reproducibility of the reported settings.

## Troubleshooting

If fewer slices arrive than requested, check for duplicate resolved indices and the
response-size limit. Request the remaining slices or volumes in a separate call. For
views that look different across volumes, compare their reported intensity bounds and
use a manual window when you need an identical scale.
