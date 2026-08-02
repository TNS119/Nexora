"""Quick test to check if the acoustic engine can actually process WebM audio bytes."""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from ai_core.ai_engine import analyze_acoustic_risk, _read_audio_container, _load_audio, EngineConfig

# Create a tiny WebM-like test: record 2 seconds of silence as WAV first
import numpy as np
import io
import soundfile as sf

# Test 1: Can we even load a simple WAV?
print("=== Test 1: WAV bytes ===")
sr = 16000
duration = 2
t = np.linspace(0, duration, sr * duration, dtype=np.float32)
# Generate a simple sine wave (440 Hz) to simulate some voice
waveform = 0.3 * np.sin(2 * np.pi * 440 * t).astype(np.float32)

buf = io.BytesIO()
sf.write(buf, waveform, sr, format='WAV')
wav_bytes = buf.getvalue()
print(f"WAV bytes length: {len(wav_bytes)}")

try:
    result = analyze_acoustic_risk(wav_bytes, sample_rate=sr)
    print(f"WAV acoustic result: score={result['score']}, triggers={result['triggers']}")
except Exception as e:
    print(f"WAV ERROR: {type(e).__name__}: {e}")

# Test 2: Try to load WebM bytes via _read_audio_container
print("\n=== Test 2: WebM bytes via temp file ===")
# Create a minimal WebM file using ffmpeg
try:
    import imageio_ffmpeg
    import subprocess
    import tempfile
    
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    print(f"FFmpeg exe: {ffmpeg_exe}")
    
    # Write WAV to temp, convert to WebM
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_tmp:
        sf.write(wav_tmp.name, waveform, sr)
        wav_path = wav_tmp.name
    
    webm_path = wav_path.replace(".wav", ".webm")
    result = subprocess.run(
        [ffmpeg_exe, "-y", "-i", wav_path, "-c:a", "libopus", webm_path],
        capture_output=True, text=True
    )
    print(f"FFmpeg convert result: returncode={result.returncode}")
    if result.returncode != 0:
        print(f"FFmpeg stderr: {result.stderr[:500]}")
    else:
        webm_bytes = open(webm_path, "rb").read()
        print(f"WebM bytes length: {len(webm_bytes)}")
        print(f"WebM header: {webm_bytes[:4].hex()}")
        
        try:
            wf, file_sr = _read_audio_container(webm_bytes)
            print(f"WebM load SUCCESS: waveform shape={wf.shape}, sr={file_sr}")
            
            acoustic = analyze_acoustic_risk(webm_bytes, sample_rate=sr)
            print(f"WebM acoustic result: score={acoustic['score']}, triggers={acoustic['triggers']}")
        except Exception as e:
            print(f"WebM load ERROR: {type(e).__name__}: {e}")
    
    os.unlink(wav_path)
    if os.path.exists(webm_path):
        os.unlink(webm_path)
        
except Exception as e:
    print(f"Test 2 ERROR: {type(e).__name__}: {e}")

# Test 3: Check what happens with raw browser WebM chunks
print("\n=== Test 3: Check analyze_acoustic_risk error handling ===")
from ai_core.ai_engine import analyze_realtime_audio_chunk
try:
    result = analyze_realtime_audio_chunk(
        wav_bytes,
        raw_pcm=False,
        transcript_text="please send 500 rupees",
        include_debug=True,
        mode="fast",
    )
    print(f"Realtime result: threat_score={result.get('threat_score')}, acoustic_risk={result.get('acoustic_risk')}, intent_risk={result.get('intent_risk')}")
    print(f"Acoustic triggers: {result.get('acoustic_triggers')}")
except Exception as e:
    print(f"Realtime ERROR: {type(e).__name__}: {e}")
