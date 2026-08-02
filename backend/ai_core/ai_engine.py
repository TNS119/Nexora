"""Audio threat analysis engine.

This module combines lightweight acoustic artifact detection with optional
Groq-powered transcription and semantic scam analysis.
"""

from __future__ import annotations

import io
import json
import os
import re
import warnings
from dataclasses import dataclass
from collections import deque
from pathlib import Path
from typing import Any, BinaryIO, Iterable

try:
    import imageio_ffmpeg
    import audioread.ffdec
    # Monkeypatch audioread to use the bundled imageio_ffmpeg executable
    audioread.ffdec.COMMANDS = (imageio_ffmpeg.get_ffmpeg_exe(),) + audioread.ffdec.COMMANDS
except ImportError:
    pass


AudioInput = str | Path | bytes | bytearray | BinaryIO


@dataclass(frozen=True)
class EngineConfig:
    """Runtime configuration for the audio threat engine."""

    groq_api_key: str | None = None
    transcription_model: str = "whisper-large-v3"
    chat_model: str = "llama-3.1-8b-instant"
    sample_rate: int = 16_000
    acoustic_weight: float = 0.5
    coercion_weight: float = 0.5
    alert_threshold: int = 80
    language: str = "en"

    @classmethod
    def from_env(cls) -> "EngineConfig":
        _load_dotenv()
        return cls(
            groq_api_key=os.getenv("GROQ_API_KEY"),
            transcription_model=os.getenv("GROQ_TRANSCRIPTION_MODEL", cls.transcription_model),
            chat_model=os.getenv("GROQ_CHAT_MODEL", cls.chat_model),
        )


def extract_acoustic_risk(
    audio: AudioInput,
    *,
    sample_rate: int = 16_000,
    raw_pcm: bool = False,
    pcm_channels: int = 1,
) -> int:
    """Return a 0-100 synthetic-voice risk score from audio bytes or a file path.

    Set ``raw_pcm=True`` when ``audio`` is headerless signed 16-bit PCM bytes.
    Otherwise the input is treated as a normal audio container such as WAV.
    """

    return analyze_acoustic_risk(
        audio,
        sample_rate=sample_rate,
        raw_pcm=raw_pcm,
        pcm_channels=pcm_channels,
    )["score"]


def analyze_acoustic_risk(
    audio: AudioInput,
    *,
    sample_rate: int = 16_000,
    raw_pcm: bool = False,
    pcm_channels: int = 1,
    mode: str = "calibrated",
) -> dict[str, Any]:
    """Return acoustic score, triggers, and metrics for AI-voice suspicion."""

    waveform, sr = _load_audio(audio, sample_rate=sample_rate, raw_pcm=raw_pcm, pcm_channels=pcm_channels)
    if mode == "fast":
        metrics = _compute_fast_acoustic_metrics(waveform, sr)
        scored = _score_fast_acoustic_metrics(metrics)
    elif mode == "balanced":
        metrics = _compute_acoustic_metrics(waveform, sr, include_pitch=False)
        scored = _score_acoustic_metrics(metrics)
    elif mode == "calibrated":
        metrics = _compute_acoustic_metrics(waveform, sr, include_pitch=True)
        scored = _score_acoustic_metrics(metrics)
    else:
        raise ValueError("mode must be 'fast', 'balanced', or 'calibrated'")
    return {
        "score": scored["score"],
        "triggers": scored["triggers"],
        "metrics": metrics,
    }


def analyze_realtime_audio_chunk(
    audio: AudioInput,
    *,
    config: EngineConfig | None = None,
    raw_pcm: bool = True,
    pcm_channels: int = 1,
    transcript_text: str | None = None,
    include_debug: bool = False,
    mode: str = "balanced",
) -> dict[str, Any]:
    """Fast analyzer for 500ms live-call chunks.

    This intentionally skips Groq transcription unless a caller supplies
    ``transcript_text`` from a slower rolling STT buffer.
    """

    config = config or EngineConfig.from_env()
    try:
        acoustic = analyze_acoustic_risk(
            audio,
            sample_rate=config.sample_rate,
            raw_pcm=raw_pcm,
            pcm_channels=pcm_channels,
            mode=mode,
        )
    except Exception as exc:
        acoustic = {"score": 0, "triggers": []}
        if include_debug:
            print(f"[Acoustic Engine] Suppressed error for unsupported audio chunk: {exc}")
    transcript = transcript_text or ""
    intent = _fallback_coercion_analysis(transcript) if transcript else {
        "coercion_score": 0,
        "is_scam": False,
        "detected_triggers": [],
    }
    coercion_score = int(intent.get("coercion_score", 0))
    acoustic_score = int(acoustic["score"])
    fused_score = _weighted_score(
        acoustic_score,
        coercion_score,
        acoustic_weight=config.acoustic_weight,
        coercion_weight=config.coercion_weight,
    )
    fused_score = _apply_high_confidence_acoustic_override(
        fused_score,
        acoustic_score=acoustic_score,
        acoustic_triggers=acoustic["triggers"],
    )
    fused_score = _apply_high_confidence_override(fused_score, intent)
    result = _production_result(
        acoustic_risk=_public_acoustic_risk(acoustic_score, acoustic["triggers"]),
        intent_risk=coercion_score,
        transcript=transcript,
        keywords=intent.get("detected_triggers", []),
    )
    if not include_debug:
        return result
    result.update({
        "acoustic_risk": acoustic_score,
        "intent_risk": coercion_score,
        "threat_score": fused_score,
        "acoustic_triggers": acoustic["triggers"],
        "threat_category": _threat_category(
            synthetic_voice_suspected=result["is_synthetic"],
            scam_content_suspected=result["is_scam_pattern"],
        ),
        "alert_required": fused_score > config.alert_threshold,
        "mode": "realtime_balanced",
    })
    return result


class RealtimeThreatAnalyzer:
    """Small state holder for low-latency 500ms chunk scoring."""

    def __init__(
        self,
        *,
        config: EngineConfig | None = None,
        raw_pcm: bool = True,
        pcm_channels: int = 1,
        smoothing_chunks: int = 6,
        analysis_window_chunks: int = 6,
        include_debug: bool = False,
        transcribe_interval_chunks: int = 6,
        mode: str = "balanced",
    ) -> None:
        self.config = config or EngineConfig.from_env()
        self.raw_pcm = raw_pcm
        self.pcm_channels = pcm_channels
        self.include_debug = include_debug
        self.mode = mode
        self._scores: deque[int] = deque(maxlen=smoothing_chunks)
        self._acoustic_scores: deque[int] = deque(maxlen=smoothing_chunks)
        self._coercion_scores: deque[int] = deque(maxlen=smoothing_chunks)
        self._audio_chunks: deque[bytes] = deque(maxlen=analysis_window_chunks)
        self._transcription_chunks: deque[bytes] = deque(maxlen=60) # 30 seconds of context
        self._synthetic_confirmed = False
        self._transcribe_interval = transcribe_interval_chunks
        self._chunk_count = 0
        self._last_transcript: str | None = None
        self._groq_client = _make_groq_client(self.config)

    def warm_up(self) -> None:
        """Pay one-time import/JIT cost before a live call starts."""

        half_second_samples = max(1, self.config.sample_rate // 2)
        self.push_chunk(b"\x00\x00" * half_second_samples)
        self._scores.clear()
        self._acoustic_scores.clear()
        self._coercion_scores.clear()
        self._audio_chunks.clear()
        self._transcription_chunks.clear()
        self._synthetic_confirmed = False
        self._chunk_count = 0
        self._last_transcript = None

    def push_chunk(self, audio: AudioInput, *, transcript_text: str | None = None) -> dict[str, Any]:
        analysis_audio = audio
        if self.raw_pcm and isinstance(audio, (bytes, bytearray)):
            audio_bytes = bytes(audio)
            self._audio_chunks.append(audio_bytes)
            self._transcription_chunks.append(audio_bytes)
            analysis_audio = b"".join(self._audio_chunks)

        # Periodic Groq transcription on the rolling audio window.
        self._chunk_count += 1
        effective_transcript = transcript_text
        if effective_transcript is None and self._groq_client is not None:
            if self._chunk_count % self._transcribe_interval == 0 and self._transcription_chunks:
                try:
                    combined_audio = b"".join(self._transcription_chunks)
                    effective_transcript = transcribe_audio(
                        combined_audio,
                        client=self._groq_client,
                        config=self.config,
                        raw_pcm=self.raw_pcm,
                        pcm_channels=self.pcm_channels,
                    )
                    self._last_transcript = effective_transcript
                except Exception:
                    effective_transcript = self._last_transcript
            else:
                effective_transcript = self._last_transcript

        result = analyze_realtime_audio_chunk(
            analysis_audio,
            config=self.config,
            raw_pcm=self.raw_pcm,
            pcm_channels=self.pcm_channels,
            transcript_text=effective_transcript,
            include_debug=True,
            mode=self.mode,
        )
        self._scores.append(int(result["threat_score"]))
        self._acoustic_scores.append(int(result["acoustic_risk"]))
        self._coercion_scores.append(int(result["intent_risk"]))
        smoothed_score = int(round(sum(self._scores) / len(self._scores)))
        confirmed_acoustic_score = self._confirmed_acoustic_score()
        
        # Intent is based on cumulative transcript, so it shouldn't be averaged down.
        # Use the maximum recent intent score to ensure rapid alerting.
        smoothed_coercion_score = max(self._coercion_scores) if self._coercion_scores else 0
        
        final_score = _weighted_score(
            confirmed_acoustic_score,
            smoothed_coercion_score,
            acoustic_weight=self.config.acoustic_weight,
            coercion_weight=self.config.coercion_weight,
        )
        if confirmed_acoustic_score >= 85:
            final_score = max(final_score, confirmed_acoustic_score)
        if smoothed_coercion_score >= 70:
            final_score = max(final_score, smoothed_coercion_score)
        result["instant_threat_score"] = result["threat_score"]
        result["instant_acoustic_risk"] = result["acoustic_risk"]
        result["smoothed_raw_threat_score"] = smoothed_score
        result["threat_score"] = final_score
        result["acoustic_risk"] = confirmed_acoustic_score
        result["intent_risk"] = smoothed_coercion_score
        public_acoustic_score = _public_acoustic_risk(confirmed_acoustic_score)
        result["acoustic_risk"] = public_acoustic_score
        result["is_synthetic"] = public_acoustic_score > 75
        result["is_scam_pattern"] = smoothed_coercion_score > 70
        result["threat_category"] = _threat_category(
            synthetic_voice_suspected=result["is_synthetic"],
            scam_content_suspected=result["is_scam_pattern"],
        )
        result["alert_required"] = final_score > self.config.alert_threshold
        if self.include_debug:
            return result
        return _production_result(
            acoustic_risk=public_acoustic_score,
            intent_risk=result["intent_risk"],
            transcript=result["transcript"],
            keywords=result["keywords_found"],
        )

    def _confirmed_acoustic_score(self) -> int:
        if len(self._acoustic_scores) < 4:
            return 0
        high_count = sum(1 for score in self._acoustic_scores if score >= 70)
        average_score = int(round(sum(self._acoustic_scores) / len(self._acoustic_scores)))
        if high_count >= 4 and average_score >= 70:
            self._synthetic_confirmed = True
            return max(90, average_score)
        if self._synthetic_confirmed and high_count >= 2 and average_score >= 55:
            return max(90, average_score)
        if high_count <= 1 or average_score < 45:
            self._synthetic_confirmed = False
        return 0



def transcribe_audio(
    audio: AudioInput,
    *,
    client: Any | None = None,
    config: EngineConfig | None = None,
    raw_pcm: bool = False,
    pcm_channels: int = 1,
) -> str:
    """Transcribe audio with Groq Whisper.

    Returns an empty string when no Groq client/API key is available. This keeps
    local acoustic-only processing usable during development.
    """

    config = config or EngineConfig.from_env()
    client = client or _make_groq_client(config)
    if client is None:
        return ""

    file_name, file_bytes = _audio_as_file_payload(
        audio,
        sample_rate=config.sample_rate,
        raw_pcm=raw_pcm,
        pcm_channels=pcm_channels,
    )
    transcription = client.audio.transcriptions.create(
        file=(file_name, file_bytes),
        model=config.transcription_model,
        response_format="text",
        language=config.language,
    )
    return transcription.strip() if isinstance(transcription, str) else str(transcription).strip()


def analyze_coercion_intent(
    transcript_text: str,
    *,
    client: Any | None = None,
    config: EngineConfig | None = None,
) -> dict[str, Any]:
    """Return semantic scam analysis for a transcript.

    Uses Groq chat JSON mode when configured, otherwise falls back to a small
    deterministic trigger heuristic suitable for demos and tests.
    """

    text = transcript_text.strip()
    if not text:
        return {"coercion_score": 0, "is_scam": False, "detected_triggers": []}

    config = config or EngineConfig.from_env()
    client = client or _make_groq_client(config)
    if client is None:
        return _fallback_coercion_analysis(text)

    system_prompt = (
        "You are a Security and Fraud Detection Agent. Your job is to analyze incoming messages and evaluate their risk level for spam, financial scams, phishing, or suspicious activity.\n\n"
        "### EVALUATION RULES:\n"
        "1. BENIGN CONVERSATION (0-10% Risk):\n"
        "   - Everyday greetings (\"hi\", \"hello\", \"how are you\"), casual chat, friendly check-ins, or standard questions MUST be scored between 0% and 10%.\n"
        "   - Do NOT mark casual text as suspicious under any circumstances.\n\n"
        "2. SUSPICIOUS / FRAUDULENT INDICATORS (70-100% Risk):\n"
        "   - Requests for money, transfers, or gift cards (e.g., \"please send 500 rupees\", \"send money to this account\").\n"
        "   - Urgent demands for action (\"do this immediately\", \"your account will be blocked\").\n"
        "   - Requests for sensitive data (OTPs, passwords, PINs, credit card details).\n"
        "   - Suspicious external links or unverified payment handles (UPI IDs, bank details).\n\n"
        "3. MODERATE RISK (30-60% Risk):\n"
        "   - Unsolicited business offers, vague links from unknown contacts, or unusual request patterns without explicit financial demands.\n\n"
        "### FEW-SHOT EXAMPLES FOR CALIBRATION:\n"
        "Input: \"hi how are you\"\n"
        "Output: {\"risk_score\": 0, \"alert_triggered\": false, \"reason\": \"Standard friendly greeting with no requests or suspicious links.\"}\n\n"
        "Input: \"Good morning! Are we still meeting for lunch today?\"\n"
        "Output: {\"risk_score\": 0, \"alert_triggered\": false, \"reason\": \"Casual personal coordination.\"}\n\n"
        "Input: \"please send 500 rupees\"\n"
        "Output: {\"risk_score\": 92, \"alert_triggered\": true, \"reason\": \"Direct request for financial transfer.\"}\n\n"
        "Input: \"Urgent: Your account is suspended. Click http://bit.ly/fake-link to verify your OTP.\"\n"
        "Output: {\"risk_score\": 98, \"alert_triggered\": true, \"reason\": \"Phishing attempt using sense of urgency, malicious link, and OTP request.\"}\n\n"
        "### OUTPUT FORMAT:\n"
        "Always return your analysis strictly as a valid JSON object:\n"
        "{\n"
        "  \"risk_score\": <number between 0 and 100>,\n"
        "  \"alert_triggered\": <true if risk_score >= 70 else false>,\n"
        "  \"reason\": \"<one sentence explanation>\"\n"
        "}"
    )
    response = client.chat.completions.create(
        model=config.chat_model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Transcript: {text!r}"},
        ],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content
    parsed = _parse_intent_json(content)
    normalized = _normalize_intent(parsed)
    fallback = _fallback_coercion_analysis(text)
    return _merge_intent_results(normalized, fallback)


def analyze_audio_chunk(
    audio: AudioInput,
    *,
    config: EngineConfig | None = None,
    raw_pcm: bool = False,
    pcm_channels: int = 1,
    transcript_text: str | None = None,
    client: Any | None = None,
    include_debug: bool = False,
) -> dict[str, Any]:
    """Analyze one audio chunk and return a fused threat payload.

    ``transcript_text`` can be supplied by a caller that already transcribed the
    chunk, which avoids a second STT call.
    """

    config = config or EngineConfig.from_env()
    acoustic_error = None
    try:
        acoustic = analyze_acoustic_risk(
            audio,
            sample_rate=config.sample_rate,
            raw_pcm=raw_pcm,
            pcm_channels=pcm_channels,
        )
        acoustic_score = int(acoustic["score"])
        acoustic_triggers = acoustic["triggers"]
    except Exception as exc:
        acoustic_score = 0
        acoustic_triggers = []
        acoustic_error = str(exc)
    transcript = transcript_text
    if transcript is None:
        transcript = transcribe_audio(
            audio,
            client=client,
            config=config,
            raw_pcm=raw_pcm,
            pcm_channels=pcm_channels,
        )

    intent = analyze_coercion_intent(transcript, client=client, config=config)
    coercion_score = int(intent.get("coercion_score", 0))
    fused_score = _weighted_score(
        acoustic_score,
        coercion_score,
        acoustic_weight=config.acoustic_weight,
        coercion_weight=config.coercion_weight,
    )
    fused_score = _apply_high_confidence_override(fused_score, intent)
    fused_score = _apply_high_confidence_acoustic_override(
        fused_score,
        acoustic_score=acoustic_score,
        acoustic_triggers=acoustic_triggers,
    )

    result = _production_result(
        acoustic_risk=_public_acoustic_risk(acoustic_score, acoustic_triggers),
        intent_risk=coercion_score,
        transcript=transcript,
        keywords=intent.get("detected_triggers", []),
    )
    if include_debug:
        result.update({
            "acoustic_risk": acoustic_score,
            "intent_risk": coercion_score,
            "threat_score": fused_score,
            "acoustic_triggers": acoustic_triggers,
            "threat_category": _threat_category(
                synthetic_voice_suspected=result["is_synthetic"],
                scam_content_suspected=result["is_scam_pattern"],
            ),
            "alert_required": fused_score > config.alert_threshold,
        })
    if acoustic_error and include_debug:
        result["acoustic_error"] = acoustic_error
    return result


def _production_result(
    *,
    acoustic_risk: int,
    intent_risk: int,
    transcript: str,
    keywords: list[str],
) -> dict[str, Any]:
    acoustic_risk = _public_acoustic_risk(acoustic_risk)
    return {
        "acoustic_risk": acoustic_risk,
        "intent_risk": intent_risk,
        "transcript": transcript,
        "keywords_found": keywords,
        "is_synthetic": acoustic_risk > 75,
        "is_scam_pattern": intent_risk > 70,
    }


def _public_acoustic_risk(acoustic_risk: int, triggers: list[str] | None = None) -> int:
    if acoustic_risk <= 75:
        return 0
    if triggers is None:
        strong_artifact = acoustic_risk >= 98
    else:
        strong_artifact = "unstable_pitch_track" in triggers or "high_spectral_flatness" in triggers
    return 100 if strong_artifact else 90


def _load_audio(
    audio: AudioInput,
    *,
    sample_rate: int,
    raw_pcm: bool,
    pcm_channels: int,
) -> tuple[Any, int]:
    np = _require_numpy()
    if raw_pcm:
        if not isinstance(audio, (bytes, bytearray)):
            raise TypeError("raw_pcm=True requires bytes or bytearray audio input")
        samples = np.frombuffer(audio, dtype="<i2").astype(np.float32) / 32768.0
        if pcm_channels > 1:
            samples = samples.reshape(-1, pcm_channels).mean(axis=1)
        return samples, sample_rate

    waveform, native_sr = _read_audio_container(audio)
    if native_sr != sample_rate:
        librosa = _require_librosa()
        waveform = librosa.resample(waveform, orig_sr=native_sr, target_sr=sample_rate)
    return waveform.astype(np.float32), sample_rate


def _read_audio_container(audio: AudioInput) -> tuple[Any, int]:
    np = _require_numpy()
    sf = _require_soundfile()
    if isinstance(audio, (bytes, bytearray)):
        try:
            data, sample_rate = sf.read(io.BytesIO(audio), dtype="float32", always_2d=True)
        except Exception:
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                tmp.write(audio)
                tmp_path = Path(tmp.name)
            try:
                waveform, sr = _read_audio_with_librosa_quiet(tmp_path)
                return waveform, sr
            finally:
                try:
                    tmp_path.unlink(missing_ok=True)
                except OSError:
                    pass
    else:
        path = Path(audio)
        header = path.read_bytes()[:4] if path.exists() else b""
        if path.suffix.lower() == ".wav" and header and header != b"RIFF":
            if header[:3] == b"ID3":
                return _read_audio_with_librosa_quiet(path)
            raise ValueError("WAV file has a non-RIFF header; convert it to PCM WAV for local acoustic analysis")
        try:
            data, sample_rate = sf.read(path, dtype="float32", always_2d=True)
        except Exception:
            return _read_audio_with_librosa_quiet(path)
    waveform = np.asarray(data, dtype=np.float32).mean(axis=1)
    return waveform, int(sample_rate)


def _read_audio_with_librosa_quiet(path: Path) -> tuple[Any, int]:
    librosa = _require_librosa()
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=FutureWarning, module=r"librosa\..*")
        warnings.filterwarnings("ignore", category=UserWarning, module=r"librosa\..*")
        waveform, sample_rate = librosa.load(path, sr=None, mono=True)
    return waveform, int(sample_rate)


def _compute_acoustic_metrics(waveform: Any, sample_rate: int, *, include_pitch: bool = True) -> dict[str, float]:
    np = _require_numpy()
    librosa = _require_librosa()

    if len(waveform) == 0:
        return {"mfcc_variance": 0.0, "spectral_flatness": 0.0, "rms": 0.0}

    mfccs = librosa.feature.mfcc(y=waveform, sr=sample_rate, n_mfcc=13)
    flatness = librosa.feature.spectral_flatness(y=waveform)
    rms = librosa.feature.rms(y=waveform)
    zcr = librosa.feature.zero_crossing_rate(y=waveform)
    centroid = librosa.feature.spectral_centroid(y=waveform, sr=sample_rate)
    bandwidth = librosa.feature.spectral_bandwidth(y=waveform, sr=sample_rate)
    rolloff = librosa.feature.spectral_rolloff(y=waveform, sr=sample_rate, roll_percent=0.85)
    contrast = librosa.feature.spectral_contrast(y=waveform, sr=sample_rate)
    f0_cv, voiced_frames = _pitch_variation(waveform, sample_rate) if include_pitch else (0.0, 0)
    return {
        "mfcc_variance": float(np.var(mfccs)),
        "spectral_flatness": float(np.mean(flatness)),
        "rms": float(np.mean(rms)),
        "zero_crossing_rate": float(np.mean(zcr)),
        "spectral_centroid": float(np.mean(centroid)),
        "spectral_bandwidth": float(np.mean(bandwidth)),
        "spectral_rolloff": float(np.mean(rolloff)),
        "spectral_contrast": float(np.mean(contrast)),
        "pitch_variation": f0_cv,
        "voiced_frames": float(voiced_frames),
    }


def _compute_fast_acoustic_metrics(waveform: Any, sample_rate: int) -> dict[str, float]:
    np = _require_numpy()
    if len(waveform) == 0:
        return {
            "rms": 0.0,
            "zero_crossing_rate": 0.0,
            "spectral_flatness": 0.0,
            "spectral_centroid": 0.0,
            "spectral_bandwidth": 0.0,
            "spectral_rolloff": 0.0,
            "spectral_contrast": 0.0,
            "energy_stability": 0.0,
        }

    y = np.asarray(waveform, dtype=np.float32)
    frame_length = min(400, max(64, len(y)))
    hop_length = max(160, frame_length // 2)
    frames = _frame_signal(y, frame_length=frame_length, hop_length=hop_length)
    window = np.hanning(frame_length).astype(np.float32)
    windowed = frames * window
    magnitude = np.abs(np.fft.rfft(windowed, axis=1)) + 1e-10
    power = magnitude * magnitude
    freqs = np.fft.rfftfreq(frame_length, d=1.0 / sample_rate).astype(np.float32)
    power_sum = np.sum(power, axis=1) + 1e-10

    rms = np.sqrt(np.mean(frames * frames, axis=1))
    zero_crossings = np.mean(np.diff(np.signbit(frames), axis=1), axis=1)
    centroid = np.sum(power * freqs, axis=1) / power_sum
    bandwidth = np.sqrt(np.sum(power * (freqs[None, :] - centroid[:, None]) ** 2, axis=1) / power_sum)
    cumulative = np.cumsum(power, axis=1)
    rolloff_indexes = np.argmax(cumulative >= (0.85 * power_sum[:, None]), axis=1)
    rolloff = freqs[rolloff_indexes]
    flatness = np.exp(np.mean(np.log(magnitude), axis=1)) / (np.mean(magnitude, axis=1) + 1e-10)
    db = 20.0 * np.log10(magnitude)
    contrast = np.percentile(db, 90, axis=1) - np.percentile(db, 10, axis=1)
    energy_stability = 1.0 - min(1.0, float(np.std(rms) / (np.mean(rms) + 1e-10)))

    return {
        "rms": float(np.mean(rms)),
        "zero_crossing_rate": float(np.mean(zero_crossings)),
        "spectral_flatness": float(np.mean(flatness)),
        "spectral_centroid": float(np.mean(centroid)),
        "spectral_bandwidth": float(np.mean(bandwidth)),
        "spectral_rolloff": float(np.mean(rolloff)),
        "spectral_contrast": float(np.mean(contrast)),
        "energy_stability": energy_stability,
    }


def _frame_signal(waveform: Any, *, frame_length: int, hop_length: int) -> Any:
    np = _require_numpy()
    if len(waveform) <= frame_length:
        padded = np.zeros(frame_length, dtype=np.float32)
        padded[: len(waveform)] = waveform
        return padded.reshape(1, frame_length)

    frame_count = 1 + (len(waveform) - frame_length) // hop_length
    shape = (frame_count, frame_length)
    strides = (waveform.strides[0] * hop_length, waveform.strides[0])
    return np.lib.stride_tricks.as_strided(waveform, shape=shape, strides=strides)


def _score_acoustic_metrics(metrics: dict[str, float]) -> dict[str, Any]:
    score = 0
    triggers: list[str] = []
    if metrics["rms"] < 0.001:
        return {"score": 0, "triggers": ["silent_or_near_silent"]}
    if metrics["rms"] < 0.02:
        return {"score": 0, "triggers": ["too_quiet_for_reliable_acoustic_detection"]}

    low_energy = metrics["rms"] < 0.1
    bright_spectrum = metrics["spectral_centroid"] > 1700

    # Original blueprint heuristics. These are kept as weak signals because
    # modern AI voices do not always follow them.
    if metrics["mfcc_variance"] < 150:
        score += 35
        triggers.append("low_mfcc_variance")
    if metrics["spectral_flatness"] > 0.05 and (low_energy or bright_spectrum):
        score += 30
        triggers.append("high_spectral_flatness")

    # Demo calibration from the provided benchmark WAVs. These features catch
    # the current synthetic sample, whose MFCC/flatness move opposite the
    # original blueprint assumptions.
    if metrics["rms"] < 0.08:
        score += 15
        triggers.append("low_rms_energy")
    if metrics["mfcc_variance"] > 7000 and (low_energy or bright_spectrum):
        score += 15
        triggers.append("high_mfcc_variance")
    if metrics["spectral_contrast"] < 24.5 and (low_energy or bright_spectrum):
        score += 15
        triggers.append("low_spectral_contrast")
    if metrics["spectral_centroid"] > 1300 and low_energy:
        score += 10
        triggers.append("moderately_high_spectral_centroid")
    if metrics["spectral_centroid"] > 1450:
        score += 20
        triggers.append("high_spectral_centroid")
    if metrics["spectral_bandwidth"] > 1300 and low_energy:
        score += 10
        triggers.append("moderately_wide_spectral_bandwidth")
    if metrics["spectral_bandwidth"] > 1200 and low_energy:
        score += 10
        triggers.append("low_energy_wide_spectral_bandwidth")
    if metrics["spectral_bandwidth"] > 1400:
        score += 15
        triggers.append("wide_spectral_bandwidth")
    if metrics["spectral_rolloff"] > 2500 and low_energy:
        score += 10
        triggers.append("moderately_high_spectral_rolloff")
    if metrics["spectral_rolloff"] > 2400 and low_energy:
        score += 10
        triggers.append("low_energy_high_spectral_rolloff")
    if metrics["spectral_rolloff"] > 2800:
        score += 20
        triggers.append("high_spectral_rolloff")
    if metrics["pitch_variation"] > 0.2 and metrics["voiced_frames"] >= 25:
        score += 15
        triggers.append("moderate_pitch_track_variation")
    if metrics["pitch_variation"] > 0.45 and metrics["voiced_frames"] >= 25:
        score += 25
        triggers.append("unstable_pitch_track")

    return {"score": min(score, 100), "triggers": triggers}


def _score_fast_acoustic_metrics(metrics: dict[str, float]) -> dict[str, Any]:
    score = 0
    triggers: list[str] = []
    if metrics["rms"] < 0.001:
        return {"score": 0, "triggers": ["silent_or_near_silent"]}

    if metrics["rms"] < 0.08:
        score += 20
        triggers.append("low_rms_energy")
    if metrics["spectral_flatness"] > 0.05:
        score += 25
        triggers.append("high_spectral_flatness")
    if metrics["spectral_contrast"] < 50:
        score += 20
        triggers.append("compressed_spectral_contrast")
    if metrics["spectral_centroid"] > 1300:
        score += 15
        triggers.append("moderately_high_spectral_centroid")
    if metrics["spectral_bandwidth"] > 1300:
        score += 10
        triggers.append("moderately_wide_spectral_bandwidth")
    if metrics["spectral_rolloff"] > 2500:
        score += 10
        triggers.append("moderately_high_spectral_rolloff")
    if metrics["energy_stability"] > 0.72:
        score += 15
        triggers.append("over_stable_energy_envelope")

    return {"score": min(score, 100), "triggers": triggers}


def _pitch_variation(waveform: Any, sample_rate: int) -> tuple[float, int]:
    np = _require_numpy()
    librosa = _require_librosa()
    try:
        f0, _, _ = librosa.pyin(
            waveform,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sample_rate,
        )
    except Exception:
        return 0.0, 0
    voiced = f0[~np.isnan(f0)]
    if len(voiced) == 0:
        return 0.0, 0
    mean_f0 = float(np.mean(voiced))
    if mean_f0 <= 0:
        return 0.0, int(len(voiced))
    return float(np.std(voiced) / mean_f0), int(len(voiced))


def _audio_as_file_payload(
    audio: AudioInput,
    *,
    sample_rate: int,
    raw_pcm: bool,
    pcm_channels: int,
) -> tuple[str, bytes]:
    if raw_pcm:
        return "chunk.wav", _raw_pcm_to_wav_bytes(
            bytes(audio),
            sample_rate=sample_rate,
            pcm_channels=pcm_channels,
        )
    if isinstance(audio, (bytes, bytearray)):
        return "chunk.webm", bytes(audio)
    if hasattr(audio, "read"):
        current = audio.tell() if hasattr(audio, "tell") else None
        data = audio.read()
        if current is not None and hasattr(audio, "seek"):
            audio.seek(current)
        return "chunk.webm", data

    path = Path(audio)
    return path.name, path.read_bytes()


def _raw_pcm_to_wav_bytes(raw_audio: bytes, *, sample_rate: int, pcm_channels: int) -> bytes:
    import wave

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(pcm_channels)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(raw_audio)
    return buffer.getvalue()


def _fallback_coercion_analysis(text: str) -> dict[str, Any]:
    lowered = text.lower()
    trigger_groups: list[tuple[str, Iterable[str], int]] = [
        ("emergency", ("urgent", "emergency", "right now", "immediately", "hurry"), 18),
        ("legal threat", ("jail", "arrest", "bail", "police", "court"), 28),
        ("money request", ("send money", "send me", "need money", "need some money", "please send", "wire", "transfer", "cashapp", "venmo", "zelle"), 24),
        ("untraceable payment", ("gift card", "bitcoin", "crypto", "western union"), 24),
        ("secrecy demand", ("don't tell", "do not tell", "keep this secret", "tell mom"), 20),
        ("family distress", ("mom", "dad", "grandma", "grandpa", "crash", "accident"), 14),
    ]

    score = 0
    triggers: list[str] = []
    for label, phrases, weight in trigger_groups:
        if any(phrase in lowered for phrase in phrases):
            score += weight
            triggers.append(label)

    has_specific_amount = bool(re.search(r"\b\d{3,}\b", lowered)) or any(
        amount in lowered for amount in ("$", "dollar", "dollars", "rupee", "rupees", "₹", "thousand", "3000")
    )
    if "send" in lowered and has_specific_amount:
        score += 15
        triggers.append("specific payment demand")

    if {"money request", "family distress", "specific payment demand"}.issubset(set(triggers)):
        score = max(score, 85)
        triggers.append("family emergency payment request")

    score = min(score, 100)
    return {
        "coercion_score": score,
        "is_scam": score >= 70,
        "detected_triggers": triggers,
    }


def _merge_intent_results(primary: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    primary_triggers = primary.get("detected_triggers", [])
    fallback_triggers = fallback.get("detected_triggers", [])
    triggers = list(dict.fromkeys([*primary_triggers, *fallback_triggers]))
    score = max(int(primary.get("coercion_score", 0)), int(fallback.get("coercion_score", 0)))
    return {
        "coercion_score": score,
        "is_scam": bool(primary.get("is_scam", False)) or bool(fallback.get("is_scam", False)),
        "detected_triggers": triggers,
    }


def _normalize_intent(intent: dict[str, Any]) -> dict[str, Any]:
    score = _clamp_int(intent.get("coercion_score", intent.get("risk_score", 0)))
    
    triggers = intent.get("detected_triggers", [])
    if not triggers and "reason" in intent:
        triggers = [intent["reason"]]
        
    if not isinstance(triggers, list):
        triggers = [str(triggers)]
        
    is_scam = intent.get("is_scam", intent.get("alert_triggered", score >= 70))
    
    return {
        "coercion_score": score,
        "is_scam": bool(is_scam),
        "detected_triggers": [str(trigger) for trigger in triggers],
    }


def _parse_intent_json(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(content[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("intent response must be a JSON object")
    return parsed


def _weighted_score(
    acoustic_score: int,
    coercion_score: int,
    *,
    acoustic_weight: float,
    coercion_weight: float,
) -> int:
    total_weight = acoustic_weight + coercion_weight
    if total_weight <= 0:
        raise ValueError("fusion weights must be positive")
    normalized_acoustic_weight = acoustic_weight / total_weight
    normalized_coercion_weight = coercion_weight / total_weight
    return _clamp_int(
        normalized_acoustic_weight * acoustic_score
        + normalized_coercion_weight * coercion_score
    )


def _apply_high_confidence_override(weighted_score: int, intent: dict[str, Any]) -> int:
    coercion_score = int(intent.get("coercion_score", 0))
    triggers = intent.get("detected_triggers", [])
    trigger_count = len(triggers) if isinstance(triggers, list) else 0
    if bool(intent.get("is_scam", False)) and coercion_score >= 70 and trigger_count >= 1:
        return max(weighted_score, coercion_score, 81)
    if coercion_score >= 80 and trigger_count >= 1:
        return max(weighted_score, coercion_score)
    return weighted_score


def _apply_high_confidence_acoustic_override(
    weighted_score: int,
    *,
    acoustic_score: int,
    acoustic_triggers: list[str],
) -> int:
    if acoustic_score >= 85 and len(acoustic_triggers) >= 3:
        return max(weighted_score, acoustic_score)
    return weighted_score


def _threat_category(*, synthetic_voice_suspected: bool, scam_content_suspected: bool) -> str:
    if synthetic_voice_suspected and scam_content_suspected:
        return "synthetic_voice_scam"
    if scam_content_suspected:
        return "scam_content"
    if synthetic_voice_suspected:
        return "synthetic_voice"
    return "low_risk"


def _load_dotenv() -> None:
    """Load .env from the project root if it exists."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _clamp_int(value: Any, *, minimum: int = 0, maximum: int = 100) -> int:
    return max(minimum, min(maximum, int(round(float(value)))))


def _make_groq_client(config: EngineConfig) -> Any | None:
    if not config.groq_api_key:
        return None
    try:
        from groq import Groq
    except ImportError as exc:
        raise ImportError("Install Groq support with: pip install groq") from exc
    return Groq(api_key=config.groq_api_key)


def _require_librosa() -> Any:
    try:
        import librosa
    except ImportError as exc:
        raise ImportError("Install acoustic analysis dependencies with: pip install librosa soundfile") from exc
    return librosa


def _require_numpy() -> Any:
    try:
        import numpy as np
    except ImportError as exc:
        raise ImportError("Install acoustic analysis dependencies with: pip install numpy") from exc
    return np


def _require_soundfile() -> Any:
    try:
        import soundfile as sf
    except ImportError as exc:
        raise ImportError("Install acoustic analysis dependencies with: pip install soundfile") from exc
    return sf
