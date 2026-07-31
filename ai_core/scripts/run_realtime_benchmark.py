from __future__ import annotations

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_engine import EngineConfig, RealtimeThreatAnalyzer, _load_audio
from scripts.run_benchmark import infer_label, load_sidecar_transcript


def main() -> int:
    parser = argparse.ArgumentParser(description="Replay a benchmark folder through the 500ms realtime path.")
    parser.add_argument("folder", type=Path, help="Folder containing benchmark audio files.")
    parser.add_argument("--chunk-ms", type=int, default=500)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Run acoustic-only without Groq transcription.",
    )
    args = parser.parse_args()

    files = sorted(args.folder.rglob("*.wav"))
    if not files:
        print(f"No .wav files found under {args.folder}", file=sys.stderr)
        return 1

    config = EngineConfig.from_env()
    if args.offline:
        config = EngineConfig(
            groq_api_key=None,
            sample_rate=config.sample_rate,
            acoustic_weight=config.acoustic_weight,
            coercion_weight=config.coercion_weight,
            language=config.language,
        )

    rows = []
    for path in files:
        # Use sidecar transcript if available; otherwise let Groq transcribe
        # (RealtimeThreatAnalyzer handles periodic Groq calls internally).
        transcript = load_sidecar_transcript(path)
        if transcript is None and args.offline:
            transcript = ""
        result = replay_file(path, config=config, transcript_text=transcript, chunk_ms=args.chunk_ms)
        rows.append({"label": infer_label(path), "file": str(path), **result})

    print(f"{'label':<10} {'threat':>6} {'acoustic':>8} {'intent':>8} {'category':<22} file")
    for row in rows:
        threat = max(row["acoustic_risk"], row["intent_risk"])
        category = threat_category(row["is_synthetic"], row["is_scam_pattern"])
        print(
            f"{row['label']:<10} {threat:>6} "
            f"{row['acoustic_risk']:>8} {row['intent_risk']:>8} "
            f"{category:<22} {row['file']}"
        )
    return 0


def replay_file(path: Path, *, config: EngineConfig, transcript_text: str | None, chunk_ms: int) -> dict:
    try:
        samples, sample_rate = _load_audio(path, sample_rate=16_000, raw_pcm=False, pcm_channels=1)
    except Exception as exc:
        analyzer = RealtimeThreatAnalyzer(config=EngineConfig(sample_rate=16_000, groq_api_key=None))
        analyzer.warm_up()
        result = analyzer.push_chunk(b"\x00\x00" * 8000, transcript_text=transcript_text)
        result["acoustic_error"] = str(exc)
        return result
    chunk_size = max(1, int(sample_rate * (chunk_ms / 1000.0)))
    analyzer = RealtimeThreatAnalyzer(config=config)
    analyzer.warm_up()

    last_result = None
    for start in range(0, len(samples), chunk_size):
        chunk = samples[start : start + chunk_size]
        if len(chunk) < chunk_size // 2:
            continue
        last_result = analyzer.push_chunk(float_chunk_to_pcm16(chunk), transcript_text=transcript_text)

    if last_result is None:
        last_result = analyzer.push_chunk(float_chunk_to_pcm16(samples), transcript_text=transcript_text)
    return last_result


def threat_category(is_synthetic: bool, is_scam_pattern: bool) -> str:
    if is_synthetic and is_scam_pattern:
        return "synthetic_voice_scam"
    if is_scam_pattern:
        return "scam_content"
    if is_synthetic:
        return "synthetic_voice"
    return "low_risk"


def float_chunk_to_pcm16(chunk) -> bytes:
    import numpy as np

    clipped = np.clip(chunk, -1.0, 1.0)
    return (clipped * 32767).astype("<i2").tobytes()


if __name__ == "__main__":
    raise SystemExit(main())
