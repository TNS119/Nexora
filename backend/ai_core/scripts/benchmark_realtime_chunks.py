from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import soundfile as sf

from ai_engine import EngineConfig, RealtimeThreatAnalyzer, _load_audio


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure fast 500ms realtime chunk analysis.")
    parser.add_argument("audio", type=Path, help="Audio file to split into chunks.")
    parser.add_argument("--chunk-ms", type=int, default=500)
    parser.add_argument("--no-warm-up", action="store_true", help="Include one-time library warmup in first chunk timing.")
    args = parser.parse_args()

    try:
        samples, sample_rate = sf.read(args.audio, dtype="float32", always_2d=True)
        mono = samples.mean(axis=1)
    except Exception:
        mono, sample_rate = _load_audio(args.audio, sample_rate=16_000, raw_pcm=False, pcm_channels=1)
    chunk_size = max(1, int(sample_rate * (args.chunk_ms / 1000.0)))
    analyzer = RealtimeThreatAnalyzer(
        config=EngineConfig(sample_rate=sample_rate),
        raw_pcm=True,
        pcm_channels=1,
        include_debug=True,
    )
    if not args.no_warm_up:
        analyzer.warm_up()

    rows = []
    for index, start in enumerate(range(0, len(mono), chunk_size), start=1):
        chunk = mono[start : start + chunk_size]
        if len(chunk) < chunk_size // 2:
            continue
        raw_pcm = float_chunk_to_pcm16(chunk)
        started = time.perf_counter()
        result = analyzer.push_chunk(raw_pcm)
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        rows.append(
            {
                "chunk": index,
                "elapsed_ms": round(elapsed_ms, 3),
                "instant_threat_score": result["instant_threat_score"],
                "smoothed_threat_score": result["threat_score"],
                "instant_acoustic_risk": result["instant_acoustic_risk"],
                "smoothed_acoustic_risk": result["acoustic_risk"],
                "is_synthetic": result["is_synthetic"],
            }
        )

    print(json.dumps(rows, indent=2))
    if rows:
        avg_ms = sum(row["elapsed_ms"] for row in rows) / len(rows)
        print(f"\nchunks={len(rows)} avg_ms={avg_ms:.3f} max_ms={max(row['elapsed_ms'] for row in rows):.3f}")
    return 0


def float_chunk_to_pcm16(chunk) -> bytes:
    import numpy as np

    clipped = np.clip(chunk, -1.0, 1.0)
    return (clipped * 32767).astype("<i2").tobytes()


if __name__ == "__main__":
    raise SystemExit(main())
