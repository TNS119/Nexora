from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_engine import analyze_acoustic_risk


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect local acoustic AI-voice signals.")
    parser.add_argument("audio", type=Path, nargs="+", help="Audio files to inspect.")
    args = parser.parse_args()

    for path in args.audio:
        print(f"\n{path}")
        result = analyze_acoustic_risk(path)
        print(json.dumps(result, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
