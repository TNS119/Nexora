import asyncio
from concurrent.futures import ThreadPoolExecutor

# Import Person C's engine (or fall back gracefully to mock if not yet installed)
try:
    from ai_core.ai_engine import RealtimeThreatAnalyzer, EngineConfig, transcribe_audio
    config = EngineConfig.from_env()
    analyzer = RealtimeThreatAnalyzer(
        config=config,
        mode="fast",
        transcribe_interval_chunks=1,
    )
    HAS_AI_ENGINE = True
except ImportError:
    HAS_AI_ENGINE = False
    config = None
    analyzer = None

# Background thread pool executor for non-blocking transcription
executor = ThreadPoolExecutor(max_workers=2)

def warm_up_engine():
    """Warms up model weights during server startup to eliminate cold-start latency."""
    if HAS_AI_ENGINE and analyzer:
        try:
            analyzer.warm_up()
            print("[AI Engine] RealtimeThreatAnalyzer warmed up successfully.")
        except Exception as e:
            print(f"[AI Engine Error] Model warm-up failed: {e}")
    else:
        print("[AI Engine Info] Running in dev fallback mode (ai_engine package not installed).")

class SessionThreatTracker:
    """Manages rolling transcript context and dual-track scoring per active WebSocket stream."""
    def __init__(self):
        self.latest_transcript = ""

    async def process_chunk(self, audio_chunk_bytes: bytes) -> dict:
        """Processes a raw 500ms audio chunk in <5ms while offloading STT to background workers."""
        if HAS_AI_ENGINE and analyzer:
            # 1. Instant Acoustic + Intent evaluation using current rolling transcript (<5ms)
            result = analyzer.push_chunk(
                audio_chunk_bytes,
                transcript_text=self.latest_transcript
            )

            # 2. Fire-and-forget background transcription task
            executor.submit(self._run_background_transcription, audio_chunk_bytes)

            # Update the current transcript if the engine returns one immediately.
            if result.get("transcript"):
                self.latest_transcript = str(result["transcript"])

            threat_score = float(result.get("threat_score", 0.0))
            acoustic_risk = float(result.get("acoustic_risk", 0.0))
            intent_risk = float(result.get("intent_risk", 0.0))
            reasoning = str(result.get("reasoning", "Acoustic or intent threat detected."))

            return {
                "threat_score": threat_score,
                "acoustic_risk": acoustic_risk,
                "intent_risk": intent_risk,
                "transcript": self.latest_transcript,
                "alert": threat_score > 80.0,
                "reasoning": reasoning,
                "triggers": result.get("triggers", ["Urgent Financial Request", "Voice Anomaly Detected"]) if threat_score > 50 else []
            }
        else:
            # Fallback mock engine for local testing before Person C installs ai_engine
            await asyncio.sleep(0.005)
            mock_transcript = "Grandma, I'm in jail and need money for bail right now..."
            self.latest_transcript = mock_transcript
            return {
                "threat_score": 88.5,
                "acoustic_risk": 92.0,
                "intent_risk": 85.0,
                "transcript": mock_transcript,
                "alert": True,
                "reasoning": "Mock evaluation: High-urgency coercive language & spectral anomaly detected.",
                "triggers": ["Bail Request", "Urgent Wire Transfer", "Voice Anomaly"]
            }

    def _run_background_transcription(self, audio_chunk_bytes: bytes):
        """Runs Whisper/LLM transcription in a separate thread without blocking the WebSocket loop."""
        try:
            text = transcribe_audio(audio_chunk_bytes, config=config)
            if text:
                # Append new transcript snippet for subsequent audio chunk context
                self.latest_transcript = f"{self.latest_transcript} {text}".strip()
        except Exception as e:
            print(f"[Transcription Error] {e}")