from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_engine import analyze_audio_chunk, analyze_coercion_intent, transcribe_audio


DEFAULT_TRANSCRIPT = (
    "I am in jail. Send 3000 dollars for bail money right now and do not tell mom."
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run safe live tests against the Groq API.")
    parser.add_argument("--audio", type=Path, help="Optional audio file to test Groq Whisper transcription.")
    parser.add_argument(
        "--transcript",
        default=DEFAULT_TRANSCRIPT,
        help="Transcript text for live Llama coercion analysis.",
    )
    args = parser.parse_args()

    load_dotenv(Path(".env"))
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("GROQ_API_KEY is not set. Set it in this shell or create a local .env file.")
        return 2

    print(f"GROQ_API_KEY detected; length={len(api_key)}")

    print("\n[1/2] Live Llama coercion analysis")
    intent = analyze_coercion_intent(args.transcript)
    print(json.dumps(intent, indent=2))

    if args.audio:
        print("\n[2/2] Live Whisper transcription + full fusion")
        transcript = transcribe_audio(args.audio)
        print(f"Transcript: {transcript!r}")
        result = analyze_audio_chunk(args.audio, transcript_text=transcript)
        print(json.dumps(result, indent=2))
    else:
        print("\n[2/2] Whisper skipped; pass --audio path\\to\\clip.wav to test transcription.")

    return 0


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


if __name__ == "__main__":
    raise SystemExit(main())
