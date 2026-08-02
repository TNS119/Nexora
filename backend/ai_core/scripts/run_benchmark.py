from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_engine import EngineConfig, analyze_audio_chunk


def main() -> int:
    parser = argparse.ArgumentParser(description="Run audio threat analysis over a benchmark folder.")
    parser.add_argument("folder", type=Path, help="Folder containing .wav benchmark clips.")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of a compact table.")
    parser.add_argument("--alert-threshold", type=int, default=80)
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Run acoustic-only without Groq (empty transcript, coercion = 0).",
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
            alert_threshold=args.alert_threshold,
            language=config.language,
        )
    else:
        config = EngineConfig(
            groq_api_key=config.groq_api_key,
            transcription_model=config.transcription_model,
            chat_model=config.chat_model,
            sample_rate=config.sample_rate,
            acoustic_weight=config.acoustic_weight,
            coercion_weight=config.coercion_weight,
            alert_threshold=args.alert_threshold,
            language=config.language,
        )

    rows = []
    for path in files:
        transcript = load_sidecar_transcript(path)
        # Pass transcript_text=None when no sidecar exists and not offline,
        # so analyze_audio_chunk calls Groq Whisper for real transcription.
        if transcript is None and args.offline:
            transcript = ""
        result = analyze_audio_chunk(
            path,
            config=config,
            transcript_text=transcript,
            include_debug=True,
        )
        label = infer_label(path)
        rows.append({
            "file": str(path),
            "label": label,
            "threat": result["threat_score"],
            **result,
        })

    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        print(f"{'label':<10} {'threat':>6} {'acoustic':>8} {'coercion':>8} {'transcript':<50} file")
        for row in rows:
            transcript_preview = (row.get("transcript") or "")[:47]
            if len(row.get("transcript", "") or "") > 47:
                transcript_preview += "..."
            print(
                f"{row['label']:<10} {row['threat']:>6} "
                f"{row['acoustic_risk']:>8} {row['intent_risk']:>8} "
                f"{transcript_preview:<50} {row['file']}"
            )
    return 0


def infer_label(path: Path) -> str:
    parts = {part.lower() for part in path.parts}
    name = path.name.lower()
    if "real" in parts or name.startswith("real"):
        return "real"
    if "synthetic" in parts or "ai" in name or "scam" in name:
        return "synthetic"
    return "unknown"


def load_sidecar_transcript(path: Path) -> str | None:
    transcript_path = path.with_suffix(".txt")
    if transcript_path.exists():
        return transcript_path.read_text(encoding="utf-8").strip()
    return None


if __name__ == "__main__":
    raise SystemExit(main())
