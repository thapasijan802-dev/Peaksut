"""
Flash-Forward Hook Video Stitching Engine (Phase 2)
===================================================
Engineered for PeakCut integration.
Generates retention-optimized short-form clips:
  - 0:00 - 0:02: Segment A (Climax hook with SFX overlay at 00:00)
  - 0:02 - End : Segment B (Chronological context build-up leading back through climax)

Author: Antigravity Pipeline
"""

import json
import logging
import os
import subprocess
import sys
from typing import Dict, Optional, Tuple

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("FlashForwardEngine")


def get_media_properties(file_path: str) -> Dict[str, any]:
    """
    Extracts video and audio stream properties using ffprobe.
    Returns duration, width, height, fps, and audio sample rate.
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path,
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        probe_data = json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        logger.error(f"ffprobe failed on {file_path}: {e.stderr}")
        raise RuntimeError(f"Failed to probe file: {file_path}") from e

    properties = {
        "duration": float(probe_data.get("format", {}).get("duration", 0.0)),
        "width": 1920,
        "height": 1080,
        "fps": 30.0,
        "sample_rate": 48000,
        "has_video": False,
        "has_audio": False,
    }

    for stream in probe_data.get("streams", []):
        codec_type = stream.get("codec_type")
        if codec_type == "video" and not properties["has_video"]:
            properties["has_video"] = True
            properties["width"] = int(stream.get("width", 1920))
            properties["height"] = int(stream.get("height", 1080))

            # Parse framerate (e.g., "60/1", "30000/1001", "30/1")
            r_frame_rate = stream.get("r_frame_rate", "30/1")
            if "/" in r_frame_rate:
                num, den = r_frame_rate.split("/")
                properties["fps"] = round(float(num) / float(den), 3) if float(den) > 0 else 30.0
            else:
                properties["fps"] = float(r_frame_rate)

        elif codec_type == "audio" and not properties["has_audio"]:
            properties["has_audio"] = True
            properties["sample_rate"] = int(stream.get("sample_rate", 48000))

    return properties


def build_flash_forward_filter(
    rel_a_start: float,
    rel_a_end: float,
    rel_b_start: float,
    rel_b_end: float,
    hook_duration: float,
    sfx_volume: float = 1.0,
    hook_orig_volume: float = 0.8,
    sample_rate: int = 48000,
) -> str:
    """
    Constructs the exact FFmpeg filter_complex string:
      1. Trims Segment A (Hook) & Segment B (Context) from input 0.
      2. Resets presentation timestamps (PTS-STARTPTS).
      3. Normalizes audio to stereo @ target sample rate.
      4. Overlays SFX (input 1) onto Segment A audio starting at 00:00:00.
      5. Concatenates Segment A and Segment B into a single continuous stream.
    """
    filter_complex = (
        # --- 1. Video Segment A (The Hook) ---
        f"[0:v]trim=start={rel_a_start:.3f}:end={rel_a_end:.3f},setpts=PTS-STARTPTS[vA];"
        # --- 2. Audio Segment A (Raw Hook Audio) ---
        f"[0:a]atrim=start={rel_a_start:.3f}:end={rel_a_end:.3f},asetpts=PTS-STARTPTS,"
        f"aformat=sample_rates={sample_rate}:channel_layouts=stereo,volume={hook_orig_volume:.2f}[aA_orig];"
        # --- 3. SFX Audio (Impact / Bass drop at 00:00) ---
        f"[1:a]atrim=start=0:end={hook_duration:.3f},asetpts=PTS-STARTPTS,"
        f"aformat=sample_rates={sample_rate}:channel_layouts=stereo,volume={sfx_volume:.2f}[sfx];"
        # --- 4. Mix SFX with Hook Audio ---
        f"[aA_orig][sfx]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aA];"
        # --- 5. Video Segment B (The Context) ---
        f"[0:v]trim=start={rel_b_start:.3f}:end={rel_b_end:.3f},setpts=PTS-STARTPTS[vB];"
        # --- 6. Audio Segment B (Context Audio) ---
        f"[0:a]atrim=start={rel_b_start:.3f}:end={rel_b_end:.3f},asetpts=PTS-STARTPTS,"
        f"aformat=sample_rates={sample_rate}:channel_layouts=stereo[aB];"
        # --- 7. Final Concatenation [Hook -> Context] ---
        f"[vA][aA][vB][aB]concat=n=2:v=1:a=1[outv][outa]"
    )
    return filter_complex


def render_flash_forward_clip(
    input_video: str,
    anchor_time: float,
    sfx_path: str,
    output_video: str,
    hook_duration: float = 2.0,
    context_lead_in: float = 20.0,
    context_lead_out: float = 10.0,
    sfx_volume: float = 1.0,
    hook_orig_volume: float = 0.8,
    preset: str = "fast",
    crf: int = 18,
) -> str:
    """
    Renders a Flash-Forward hook clip from an anchor timestamp.

    Parameters:
      input_video     : Path to original source video.
      anchor_time     : Timestamp in seconds of the climax/peak intensity.
      sfx_path        : Path to impact/bass-drop sound effect (.mp3/.wav).
      output_video    : Path where stitched output video will be saved.
      hook_duration   : Duration of the hook in seconds (default: 2.0s).
      context_lead_in : Seconds before climax to start the context (default: 20.0s).
      context_lead_out: Seconds after climax to continue playing context (default: 10.0s).
      sfx_volume      : Multiplier for SFX track (default: 1.0).
      hook_orig_volume: Multiplier for original audio during hook (default: 0.8).
      preset          : x264 encoding preset (default: "fast").
      crf             : Constant Rate Factor quality level (default: 18).

    Returns:
      Absolute path to the generated output video.
    """
    if not os.path.exists(input_video):
        raise FileNotFoundError(f"Input video not found: {input_video}")
    if not os.path.exists(sfx_path):
        raise FileNotFoundError(f"SFX file not found: {sfx_path}")

    # Inspect source properties to match resolution, framerate, and sample rate
    meta = get_media_properties(input_video)
    total_duration = meta["duration"]
    fps = meta["fps"]
    sample_rate = meta["sample_rate"]

    logger.info(
        f"Source Video: {meta['width']}x{meta['height']} @ {fps}fps | Duration: {total_duration:.2f}s"
    )

    # Calculate absolute timestamps
    a_start = max(0.0, anchor_time)
    a_end = a_start + hook_duration
    if total_duration > 0:
        a_end = min(total_duration, a_end)

    b_start = max(0.0, anchor_time - context_lead_in)
    b_end = anchor_time + context_lead_out
    if total_duration > 0:
        b_end = min(total_duration, b_end)

    logger.info(f"Segment A (Hook)   : {a_start:.2f}s -> {a_end:.2f}s (dur: {a_end - a_start:.2f}s)")
    logger.info(f"Segment B (Context): {b_start:.2f}s -> {b_end:.2f}s (dur: {b_end - b_start:.2f}s)")

    # Cloud VPS Optimization (4GB RAM safe):
    # If the video is long (e.g., 2+ hour VOD), avoid decoding from 00:00:00 by fast-seeking input 0
    # to 5 seconds before the earliest required timestamp.
    min_required_ts = min(a_start, b_start)
    seek_window = max(0.0, min_required_ts - 5.0) if min_required_ts > 10.0 else 0.0

    # Adjust filter timestamps relative to seek_window
    rel_a_start = a_start - seek_window
    rel_a_end = a_end - seek_window
    rel_b_start = b_start - seek_window
    rel_b_end = b_end - seek_window

    filter_complex_str = build_flash_forward_filter(
        rel_a_start=rel_a_start,
        rel_a_end=rel_a_end,
        rel_b_start=rel_b_start,
        rel_b_end=rel_b_end,
        hook_duration=hook_duration,
        sfx_volume=sfx_volume,
        hook_orig_volume=hook_orig_volume,
        sample_rate=sample_rate,
    )

    # Build FFmpeg command
    cmd = ["ffmpeg", "-y"]

    # Pre-input fast seek (O(1) seek for long VODs)
    if seek_window > 0:
        cmd.extend(["-ss", f"{seek_window:.3f}"])

    cmd.extend([
        "-i", input_video,
        "-i", sfx_path,
        "-filter_complex", filter_complex_str,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264",
        "-preset", preset,
        "-crf", str(crf),
        "-pix_fmt", "yuv420p",
        "-r", str(fps),          # Lock CFR to prevent downstream sync drift in PeakCut
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", str(sample_rate),
        output_video,
    ])

    logger.info(f"Executing FFmpeg stitching command...")
    logger.debug(f"Command: {' '.join(cmd)}")

    os.makedirs(os.path.dirname(os.path.abspath(output_video)), exist_ok=True)
    process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    if process.returncode != 0:
        logger.error(f"FFmpeg failed with code {process.returncode}:\n{process.stderr}")
        raise RuntimeError(f"FFmpeg stitching failed: {process.stderr[-1000:]}")

    logger.info(f"Successfully generated Flash-Forward clip: {output_video}")
    return os.path.abspath(output_video)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Flash-Forward Hook Video Stitcher for PeakCut Pipeline"
    )
    parser.add_argument("--input", "-i", required=True, help="Path to original source video")
    parser.add_argument("--anchor", "-a", type=float, required=True, help="Anchor Time (climax) in seconds")
    parser.add_argument("--sfx", "-s", required=True, help="Path to impact/bass-drop SFX (.mp3/.wav)")
    parser.add_argument("--output", "-o", default="flash_forward_output.mp4", help="Output video path")
    parser.add_argument("--hook-dur", type=float, default=2.0, help="Hook duration in seconds (default: 2.0)")
    parser.add_argument("--lead-in", type=float, default=20.0, help="Context lead-in duration (default: 20.0s)")
    parser.add_argument("--lead-out", type=float, default=10.0, help="Context lead-out duration (default: 10.0s)")
    parser.add_argument("--sfx-vol", type=float, default=1.0, help="SFX volume multiplier (default: 1.0)")
    parser.add_argument("--orig-vol", type=float, default=0.8, help="Original hook audio volume (default: 0.8)")

    args = parser.parse_args()

    render_flash_forward_clip(
        input_video=args.input,
        anchor_time=args.anchor,
        sfx_path=args.sfx,
        output_video=args.output,
        hook_duration=args.hook_dur,
        context_lead_in=args.lead_in,
        context_lead_out=args.lead_out,
        sfx_volume=args.sfx_vol,
        hook_orig_volume=args.orig_vol,
    )


def stitch_clip_with_hook(
    src_video: str,
    hook_rel_start: float,
    hook_rel_end: float,
    ctx_rel_start: float,
    ctx_rel_end: float,
    output_path: str,
    sfx_path: str = "/app/studio/impact.mp3",
    sfx_volume: float = 0.75,
) -> str:
    """Stitches a 1.5 - 2.5s cold-open climax hook at 0:00 with impact SFX, followed by full context story."""
    hook_dur = hook_rel_end - hook_rel_start
    if sfx_path and os.path.isfile(sfx_path):
        filter_complex = (
            f"[0:v]trim=start={hook_rel_start:.3f}:end={hook_rel_end:.3f},setpts=PTS-STARTPTS[vA];"
            f"[0:a]atrim=start={hook_rel_start:.3f}:end={hook_rel_end:.3f},asetpts=PTS-STARTPTS,"
            f"aformat=sample_rates=48000:channel_layouts=stereo,volume=0.85[aA_orig];"
            f"[1:a]atrim=start=0:end={hook_dur:.3f},asetpts=PTS-STARTPTS,"
            f"aformat=sample_rates=48000:channel_layouts=stereo,volume={sfx_volume:.2f}[sfx];"
            f"[aA_orig][sfx]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aA];"
            f"[0:v]trim=start={ctx_rel_start:.3f}:end={ctx_rel_end:.3f},setpts=PTS-STARTPTS[vB];"
            f"[0:a]atrim=start={ctx_rel_start:.3f}:end={ctx_rel_end:.3f},asetpts=PTS-STARTPTS,"
            f"aformat=sample_rates=48000:channel_layouts=stereo[aB];"
            f"[vA][aA][vB][aB]concat=n=2:v=1:a=1[outv][outa]"
        )
        inputs = ["-i", src_video, "-i", sfx_path]
    else:
        filter_complex = (
            f"[0:v]trim=start={hook_rel_start:.3f}:end={hook_rel_end:.3f},setpts=PTS-STARTPTS[vA];"
            f"[0:a]atrim=start={hook_rel_start:.3f}:end={hook_rel_end:.3f},asetpts=PTS-STARTPTS,"
            f"aformat=sample_rates=48000:channel_layouts=stereo[aA];"
            f"[0:v]trim=start={ctx_rel_start:.3f}:end={ctx_rel_end:.3f},setpts=PTS-STARTPTS[vB];"
            f"[0:a]atrim=start={ctx_rel_start:.3f}:end={ctx_rel_end:.3f},asetpts=PTS-STARTPTS,"
            f"aformat=sample_rates=48000:channel_layouts=stereo[aB];"
            f"[vA][aA][vB][aB]concat=n=2:v=1:a=1[outv][outa]"
        )
        inputs = ["-i", src_video]

    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        output_path
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return output_path
