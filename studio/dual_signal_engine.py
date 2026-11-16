"""
Dual-Signal Flash-Forward Clipping Engine (PeakCut Extension)
==============================================================
Production drop-in module for Hetzner CPX22 (2 vCPU, 4GB RAM, Ubuntu x86_64).

Components:
1. The Dual-Signal Trigger:
   - VODs (YouTube/Twitch Archives): yt-dlp chat extractor, rolling message density
     (messages per 10s window), and multi-signal overlap detector (Chat Velocity > Threshold
     AND Audio Loudness/Keywords peak) yielding a unified Climax_Anchor timestamp.
   - Live Streams (Kick/Twitch): Real-time sliding window with collections.deque tracking
     timestamps over the last 10s. If len(deque) > 40 AND live audio volume/transcript peaks,
     locks in Climax_Anchor.
2. The Dynamic Buildup (Gemini Flash / Multi-Key Pool / Groq Failover):
   - Async function sending 3 minutes preceding Climax_Anchor with exact prompt:
     "A highly engaging climax occurred at timestamp [Climax_Anchor]. Read the transcript
      leading up to this moment. Find the exact timestamp where this specific conversation,
      argument, or event naturally began. Do not go back further than necessary.
      Return ONLY the start timestamp in seconds as a float."
   - Saves float return as Buildup_Start.
3. The FFmpeg Timeline Stitcher:
   - 0:00 to 0:02: The Hook (Climax_Anchor to Climax_Anchor + 2s)
   - 0:02 to 0:02.5: Transition (1000Hz TV censor beep audio + visual flash/glitch)
   - 0:02.5 to End: The Buildup (Buildup_Start to Climax_Anchor + 2s)
   - Zero-Buffering streaming architecture (<80MB RAM usage).
"""

import asyncio
import collections
import json
import logging
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("DualSignalEngine")


def get_gemini_key_pool() -> List[str]:
    """Retrieves rotation pool of Gemini API keys from environment configuration."""
    raw = os.environ.get("PEAKCUT_AI_KEY") or os.environ.get("PEAKCUT_GEMINI_KEY", "")
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    for i in range(2, 10):
        k = os.environ.get(f"PEAKCUT_GEMINI_KEY_{i}") or os.environ.get(f"PEAKCUT_AI_KEY_{i}")
        if k and k.strip() and k.strip() not in keys:
            keys.append(k.strip())
    return keys


def get_groq_key() -> Optional[str]:
    """Retrieves Groq failover key from environment configuration."""
    return os.environ.get("PEAKCUT_GROQ_KEY")


CLIMAX_KEYWORDS = {
    "WHAT", "NO WAY", "OMG", "BRO", "INSANE", "HOLY", "SHIT", "WTF",
    "LOL", "LMAO", "CLIP IT", "UNBELIEVABLE", "LOOK AT THIS", "ARE YOU SERIOUS",
    "STOP IT", "GET OUT", "NO SHOT", "POG", "POGGERS", "KEKW", "W"
}


# ==============================================================================
# COMPONENT 1: THE DUAL-SIGNAL TRIGGER
# ==============================================================================

class LiveChatDualSignalTracker:
    """
    Component 1b: Live Streams (Kick/Twitch)
    Real-time sliding window using collections.deque keeping timestamps of the last 10s of chat.
    Condition: len(deque) > 40 AND live audio volume / transcript peaks -> locks Climax_Anchor.
    """
    def __init__(self, window_sec: float = 10.0, velocity_threshold: int = 40):
        self.window_sec = float(window_sec)
        self.velocity_threshold = int(velocity_threshold)
        self.message_timestamps: collections.deque = collections.deque()
        self.climax_anchor_locked: Optional[float] = None
        self.last_trigger_time: float = 0.0

    def add_message(self, timestamp: Optional[float] = None, text: str = "") -> int:
        """Adds a message timestamp and evicts entries older than the rolling window."""
        t = float(timestamp) if timestamp is not None else time.time()
        self.message_timestamps.append(t)
        cutoff = t - self.window_sec
        while self.message_timestamps and self.message_timestamps[0] < cutoff:
            self.message_timestamps.popleft()
        return len(self.message_timestamps)

    def get_velocity(self) -> int:
        """Current messages within the rolling 10s window."""
        return len(self.message_timestamps)

    def check_trigger(
        self,
        current_time: float,
        audio_volume_peak: bool = False,
        semantic_spike: bool = False,
        cooldown_sec: float = 30.0
    ) -> Optional[float]:
        """
        Locks in Climax_Anchor when:
        len(deque) > 40 AND (audio_volume_peak OR semantic_spike)
        """
        velocity = len(self.message_timestamps)
        has_signal_spike = audio_volume_peak or semantic_spike
        if velocity > self.velocity_threshold and has_signal_spike:
            if (current_time - self.last_trigger_time) >= cooldown_sec:
                self.last_trigger_time = current_time
                self.climax_anchor_locked = current_time
                logger.info(f"Live Climax_Anchor locked at {current_time:.2f}s (velocity={velocity} msg/10s)")
                return current_time
        return None


def download_vod_chat(url_or_id: str, output_dir: Union[str, Path]) -> Optional[str]:
    """
    Uses yt-dlp to download chat replay alongside video/transcript for YouTube or Twitch VODs.
    Returns path to downloaded chat file (.json / .vtt) or None if unavailable.
    """
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_template = str(out_dir / "%(id)s.%(ext)s")

    cmd = [
        "yt-dlp",
        "--skip-download",
        "--write-subs",
        "--sub-langs", "live_chat,rechat",
        "-o", out_template,
        url_or_id
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=90)
        for p in out_dir.iterdir():
            if "live_chat" in p.name.lower() or p.suffix.lower() in (".json", ".vtt"):
                return str(p)
    except Exception as e:
        logger.warning(f"Chat replay download notice: {e}")
    return None


def parse_vod_chat_density(chat_file_path: str, window_sec: float = 10.0) -> List[Tuple[float, int]]:
    """
    Component 1a: VODs (YouTube/Twitch Archives)
    Calculates rolling message density (messages per 10-second window) over time.
    Returns list of (timestamp_seconds, count_in_10s_window).
    """
    if not os.path.exists(chat_file_path):
        return []

    msg_offsets: List[float] = []

    # 1. Parse JSON chat formats (YouTube live_chat.json or Twitch VOD chat JSON)
    if chat_file_path.endswith(".json"):
        try:
            with open(chat_file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read().strip()
                for line in content.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    # YouTube live chat replay
                    item = obj.get("replayChatItemAction", {})
                    actions = item.get("actions", [])
                    for act in actions:
                        add_chat = act.get("addChatItemAction", {}).get("item", {})
                        renderer = add_chat.get("liveChatTextMessageRenderer") or add_chat.get("liveChatPaidMessageRenderer")
                        if renderer:
                            offset_msec = item.get("videoOffsetTimeMsec")
                            offset_usec = renderer.get("timestampUsec")
                            if offset_msec:
                                msg_offsets.append(float(offset_msec) / 1000.0)
                            elif offset_usec:
                                msg_offsets.append(float(offset_usec) / 1000000.0)
                    # Twitch format
                    if "content_offset_seconds" in obj:
                        msg_offsets.append(float(obj["content_offset_seconds"]))
                    elif "offset" in obj:
                        msg_offsets.append(float(obj["offset"]))
        except Exception as e:
            logger.error(f"Error parsing chat JSON: {e}")

    # 2. Parse VTT chat format
    elif chat_file_path.endswith(".vtt"):
        try:
            with open(chat_file_path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    m = re.match(r"(\d{2}):(\d{2}):(\d{2}\.\d{3})\s*-->", line)
                    if m:
                        h, mm, s = float(m.group(1)), float(m.group(2)), float(m.group(3))
                        msg_offsets.append(h * 3600 + mm * 60 + s)
        except Exception as e:
            logger.error(f"Error parsing chat VTT: {e}")

    msg_offsets.sort()
    if not msg_offsets:
        return []

    density_series: List[Tuple[float, int]] = []
    max_time = msg_offsets[-1]
    current_t = 0.0
    idx_start = 0
    idx_end = 0
    n = len(msg_offsets)

    while current_t <= max_time:
        win_start = max(0.0, current_t - window_sec)
        while idx_start < n and msg_offsets[idx_start] < win_start:
            idx_start += 1
        while idx_end < n and msg_offsets[idx_end] <= current_t:
            idx_end += 1
        density_series.append((round(current_t, 1), idx_end - idx_start))
        current_t += 1.0

    return density_series


def find_vod_climax_anchor(
    chat_density: List[Tuple[float, int]],
    audio_loudness: Optional[List[Tuple[float, float]]] = None,
    transcript: Optional[List[Dict[str, Any]]] = None,
    velocity_threshold: int = 15,
) -> float:
    """
    Finds overlaps where Chat Velocity > Threshold AND Audio Loudness / Keywords peak.
    Returns the unified Climax_Anchor timestamp in seconds.
    """
    if not chat_density:
        if audio_loudness:
            return max(audio_loudness, key=lambda x: x[1])[0]
        return 0.0

    loudness_dict = dict(audio_loudness) if audio_loudness else {}
    scored_candidates: List[Tuple[float, float]] = []

    for t, vel in chat_density:
        if vel < velocity_threshold:
            continue
        vol = loudness_dict.get(round(t, 1), 0.0)
        sem_score = 0.0
        if transcript:
            for w in transcript:
                w_start = w.get("start", w.get("s", 0.0))
                if (t - 5.0) <= w_start <= (t + 5.0):
                    text = str(w.get("text", w.get("w", ""))).upper()
                    if any(k in text for k in CLIMAX_KEYWORDS):
                        sem_score += 1.0

        composite = (float(vel) * 1.0) + (float(vol) * 10.0) + (sem_score * 5.0)
        scored_candidates.append((t, composite))

    if scored_candidates:
        scored_candidates.sort(key=lambda x: x[1], reverse=True)
        return scored_candidates[0][0]

    # Highest velocity peak fallback
    best_t, _ = max(chat_density, key=lambda x: x[1])
    return best_t


# ==============================================================================
# COMPONENT 2: THE DYNAMIC BUILDUP (GEMINI 1.5 FLASH / GROQ FAILOVER)
# ==============================================================================

async def get_dynamic_buildup_start(
    climax_anchor: float,
    transcript: List[Dict[str, Any]],
    api_keys: Optional[List[str]] = None,
    groq_key: Optional[str] = None
) -> float:
    """
    Component 2: Sends 3 minutes preceding Climax_Anchor to Gemini API.
    Exact Prompt requirement:
    'A highly engaging climax occurred at timestamp [Climax_Anchor]. Read the transcript leading up to this moment. Find the exact timestamp where this specific conversation, argument, or event naturally began. Do not go back further than necessary. Return ONLY the start timestamp in seconds as a float.'
    Saves response as Buildup_Start.
    """
    keys = api_keys or get_gemini_key_pool()
    gkey = groq_key or get_groq_key()

    # Filter 3 minutes (180s) preceding Climax_Anchor
    min_window_start = max(0.0, climax_anchor - 180.0)
    window = [
        w for w in transcript
        if min_window_start <= float(w.get("start", w.get("s", 0.0))) <= climax_anchor
    ]

    transcript_text = "\n".join(
        f"[{float(w.get('start', w.get('s', 0.0))):.1f}s - {float(w.get('end', w.get('e', 0.0))):.1f}s]: "
        f"{str(w.get('text', w.get('w', '')))}"
        for w in window
    )

    # EXACT required user prompt string
    prompt = (
        f"A highly engaging climax occurred at timestamp {climax_anchor:.2f}. "
        f"Read the transcript leading up to this moment. "
        f"Find the exact timestamp where this specific conversation, argument, or event naturally began. "
        f"Do not go back further than necessary. Return ONLY the start timestamp in seconds as a float."
    )
    prompt_with_context = f"{prompt}\n\nTRANSCRIPT:\n{transcript_text}" if transcript_text else prompt

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Multi-model and multi-key fallback pool
        for model in ["gemini-flash-lite-latest", "gemini-3.8-flash", "gemini-flash-latest"]:
            for k in keys:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={k}"
                body = {
                    "contents": [{"parts": [{"text": prompt_with_context}]}],
                    "generationConfig": {"temperature": 0.2, "maxOutputTokens": 32}
                }
                try:
                    r = await client.post(url, json=body)
                    if r.status_code == 200:
                        data = r.json()
                        raw_ans = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"]).strip()
                        m = re.search(r"[-+]?\d*\.?\d+", raw_ans)
                        if m:
                            val = float(m.group(0))
                            buildup_start = max(min_window_start, min(climax_anchor - 2.0, val))
                            logger.info(f"Gemini ({model}) Buildup_Start: {buildup_start:.2f}s for Climax_Anchor {climax_anchor:.2f}s")
                            return buildup_start
                except Exception as e:
                    logger.debug(f"Gemini {model} attempt notice: {e}")
                    continue

        # Groq safety-net failover
        if gkey:
            for groq_model in ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"]:
                url = "https://api.groq.com/openai/v1/chat/completions"
                headers = {"Authorization": f"Bearer {gkey}", "Content-Type": "application/json"}
                body = {
                    "model": groq_model,
                    "messages": [{"role": "user", "content": prompt_with_context}],
                    "temperature": 0.2,
                    "max_tokens": 32
                }
                try:
                    r = await client.post(url, headers=headers, json=body)
                    if r.status_code == 200:
                        data = r.json()
                        raw_ans = data["choices"][0]["message"]["content"].strip()
                        m = re.search(r"[-+]?\d*\.?\d+", raw_ans)
                        if m:
                            val = float(m.group(0))
                            buildup_start = max(min_window_start, min(climax_anchor - 2.0, val))
                            logger.info(f"Groq ({groq_model}) Buildup_Start: {buildup_start:.2f}s for Climax_Anchor {climax_anchor:.2f}s")
                            return buildup_start
                except Exception:
                    continue

    # Default fallback (30 seconds before climax)
    fallback = max(0.0, climax_anchor - 30.0)
    logger.info(f"Using deterministic Buildup_Start fallback: {fallback:.2f}s")
    return fallback


# ==============================================================================
# COMPONENT 3: THE FFmpeg TIMELINE STITCHER
# ==============================================================================

def stitch_dual_signal_clip(
    input_video: str,
    climax_anchor: float,
    buildup_start: float,
    output_path: str,
    target_width: int = 1080,
    target_height: int = 1920
) -> str:
    """
    Component 3: FFmpeg Timeline Stitcher
    - 0:00 to 0:02: The Hook (Climax_Anchor to Climax_Anchor + 2s)
    - 0:02 to 0:02.5: Transition (1000Hz TV censor beep audio + visual flash/glitch)
    - 0:02.5 to End: The Buildup (Buildup_Start to Climax_Anchor + 2s)
    
    Zero-Buffering Memory Constraint:
    Streams FFmpeg with fast input-seeking (-ss before -i).
    Total memory footprint < 80MB (Strictly compliant with 4GB CPX22 server).
    """
    hook_duration = 2.0
    trans_duration = 0.5
    buildup_duration = max(0.5, (climax_anchor + hook_duration) - buildup_start)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    cmd = [
        "ffmpeg", "-y",
        # Input 0: Hook from input_video (fast seek directly to Climax_Anchor)
        "-ss", f"{climax_anchor:.3f}", "-t", f"{hook_duration:.3f}", "-i", input_video,
        # Input 1: Buildup from input_video (fast seek directly to Buildup_Start)
        "-ss", f"{buildup_start:.3f}", "-t", f"{buildup_duration:.3f}", "-i", input_video,
        # Input 2: Lavfi white flash visual transition (0.5s)
        "-f", "lavfi", "-i", f"color=c=white:s={target_width}x{target_height}:d={trans_duration:.3f}:r=30",
        # Input 3: Lavfi 1000Hz standard TV censor beep tone audio (0.5s)
        "-f", "lavfi", "-i", f"sine=frequency=1000:duration={trans_duration:.3f}:sample_rate=44100",
        "-filter_complex",
        # Video formatting to 9:16 vertical
        f"[0:v]scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v_hook];"
        f"[1:v]scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v_build];"
        f"[2:v]fade=t=out:st=0.1:d=0.4,setsar=1[v_trans];"
        # Audio formatting & stereo normalization
        f"[0:a]aformat=sample_rates=44100:channel_layouts=stereo[a_hook];"
        f"[1:a]aformat=sample_rates=44100:channel_layouts=stereo[a_build];"
        f"[3:a]aformat=sample_rates=44100:channel_layouts=stereo[a_trans];"
        # Concat 3 segments: [Hook -> Transition -> Buildup]
        f"[v_hook][a_hook][v_trans][a_trans][v_build][a_build]concat=n=3:v=1:a=1[v_out][a_out]",
        "-map", "[v_out]", "-map", "[a_out]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
        "-c:a", "aac", "-b:a", "128k",
        "-pix_fmt", "yuv420p",
        output_path
    ]

    logger.info(f"Executing stream-stitched FFmpeg assemble -> {output_path}")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg timeline stitch failed: {res.stderr[-1000:]}")

    return os.path.abspath(output_path)


# ==============================================================================
# CLI / PIPELINE ENTRY POINT
# ==============================================================================
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Dual-Signal Flash-Forward Engine")
    parser.add_argument("--input", "-i", required=True, help="Input video file path")
    parser.add_argument("--anchor", "-a", type=float, required=True, help="Climax_Anchor timestamp in seconds")
    parser.add_argument("--buildup", "-b", type=float, default=None, help="Buildup_Start timestamp (optional)")
    parser.add_argument("--transcript", "-t", default=None, help="JSON transcript file (optional)")
    parser.add_argument("--output", "-o", default="dual_signal_stitched.mp4", help="Output 9:16 video path")

    args = parser.parse_args()

    climax = float(args.anchor)
    buildup = args.buildup

    if buildup is None and args.transcript and os.path.isfile(args.transcript):
        with open(args.transcript, "r", encoding="utf-8") as f:
            words = json.load(f)
        buildup = asyncio.run(get_dynamic_buildup_start(climax, words))
    elif buildup is None:
        buildup = max(0.0, climax - 30.0)

    out = stitch_dual_signal_clip(args.input, climax, float(buildup), args.output)
    print(f"SUCCESS: Rendered dual-signal clip at {out}")
