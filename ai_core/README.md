# Audio Threat Fusion Engine

Standalone Python implementation of the audio-risk pipeline from the blueprint:

- acoustic artifact scoring with `librosa`
- optional Groq Whisper transcription
- optional Groq Llama coercion/scam analysis
- weighted threat fusion into one backend-friendly payload

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

For Groq-powered transcription and semantic scoring:

```powershell
$env:GROQ_API_KEY="your_key_here"
```

Without `GROQ_API_KEY`, `analyze_audio_chunk` still runs acoustic scoring and uses a deterministic local semantic fallback when you pass `transcript_text`.

## Backend Usage

```python
from ai_engine import analyze_audio_chunk

result = analyze_audio_chunk("samples/ai_scam_01.wav")
print(result)
```

For a 500ms headerless signed 16-bit PCM chunk:

```python
result = analyze_audio_chunk(raw_bytes, raw_pcm=True, pcm_channels=1)
```

If your backend already has a transcript, pass it to skip transcription:

```python
result = analyze_audio_chunk(
    raw_bytes,
    raw_pcm=True,
    transcript_text="I'm in jail, send bail money right now and don't tell mom.",
)
```

Returned payload:

```python
{
    "acoustic_risk": 95,
    "intent_risk": 87,
    "transcript": "...",
    "keywords_found": ["legal threat", "money request"],
    "is_synthetic": True,
    "is_scam_pattern": True,
}
```

## How To Read Results

Use these fields to separate the two signals:

- `acoustic_risk`: audio-wave synthetic voice suspicion.
- `intent_risk`: transcript/content scam suspicion.
- `keywords_found`: scam or coercion triggers found in the transcript.
- `is_synthetic`: true when `acoustic_risk > 75`.
- `is_scam_pattern`: true when `intent_risk > 70`.

Example: a human recording that says "grandma, I had an accident, send 5000
rupees" should usually have `is_synthetic: false` and `is_scam_pattern: true`.

## Benchmark Folder

Put WAV files in a folder. The runner accepts either:

- `benchmark/real/*.wav`
- `benchmark/synthetic/*.wav`

or filename prefixes like `real_01.wav` and `ai_scam_01.wav`.

```powershell
python .\scripts\run_benchmark.py .\benchmark
```

To inspect only the local AI-vs-human acoustic layer without Groq:

```powershell
python .\scripts\inspect_acoustics.py .\benchmark\real\Human audio test 2.wav .\benchmark\synthetic\AI Audio test Nexora.wav
```

To simulate the live 500ms call-chunk path:

```powershell
python .\scripts\benchmark_realtime_chunks.py .\benchmark\synthetic\AI Audio test Nexora.wav
```

To replay the full benchmark folder through the realtime path and compare
human-vs-AI acoustic behavior:

```powershell
python .\scripts\run_realtime_benchmark.py .\benchmark
```

For backend streaming, create one analyzer per call and warm it up before the
call starts:

```python
from ai_engine import RealtimeThreatAnalyzer

analyzer = RealtimeThreatAnalyzer()
analyzer.warm_up()

while call_is_active:
    result = analyzer.push_chunk(raw_500ms_pcm_bytes)
    send_to_ui(result)
```

The realtime path analyzes a rolling audio window every 500ms. It avoids Groq
calls on every chunk; run Whisper/Llama on a larger 2-3 second speech buffer or
when the transcript changes.

Target calibration from the blueprint:

- real human clips: threat score below 25
- AI scam clips: threat score above 85
