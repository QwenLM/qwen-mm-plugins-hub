"""Decode and bound camera samples before encoding MHS image blocks."""

import json

from adapter_server import MhsError


def camera_result(data, received_at, elapsed_s):
    """Validate a camera sample and keep the complete MHS response below 15 MiB."""
    import cv2
    import numpy as np

    if not data or len(data) > 10 * 1024 * 1024:
        raise MhsError(502, "invalid_camera_frame", "Camera sample is empty or exceeds 10 MiB")
    image = cv2.imdecode(np.frombuffer(bytes(data), dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise MhsError(502, "invalid_camera_frame", "Camera sample is not a decodable image")
    source_height, source_width = image.shape[:2]
    if max(source_width, source_height) > 640:
        scale = 640 / max(source_width, source_height)
        image = cv2.resize(
            image,
            (max(1, round(source_width * scale)), max(1, round(source_height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    encoded, jpeg = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not encoded or jpeg.nbytes > 10 * 1024 * 1024:
        raise MhsError(502, "invalid_camera_frame", "Camera frame could not be encoded within the limit")
    height, width = image.shape[:2]
    info = {
        "source": "go2_front_camera",
        "simulation": False,
        "width": width,
        "height": height,
        "source_width": source_width,
        "source_height": source_height,
        "received_at_utc": received_at,
        "request_elapsed_s": elapsed_s,
    }
    return {
        "blocks": [
            {
                "type": "image",
                "data": jpeg.tobytes(),
                "mimeType": "image/jpeg",
            },
            {"type": "text", "text": json.dumps(info)},
        ]
    }
