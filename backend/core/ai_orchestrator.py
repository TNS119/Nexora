import asyncio
from concurrent.futures import ThreadPoolExecutor

# Import Person C's engine (or fall back gracefully to mock if not yet installed)
try:
    from ai_core.ai_engine import RealtimeThreatAnalyzer, EngineConfig, transcribe_audio, analyze_coercion_intent
    config = EngineConfig.from_env()
    analyzer = RealtimeThreatAnalyzer(
        config=config,
        mode="fast",
        transcribe_interval_chunks=1,
        raw_pcm=False,
    )
    HAS_AI_ENGINE = True
except ImportError as exc:
    print(f"[AI Engine Info] Running in dev fallback mode because import failed: {exc}")
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
        self.audio_buffer = bytearray()
        self.latest_intent_score = 0
        self.latest_intent_triggers = []
        self.chunk_count = 0

    async def process_chunk(self, audio_chunk_bytes: bytes) -> dict:
        """Processes a raw 500ms audio chunk in <5ms while offloading STT to background workers."""
        self.chunk_count += 1
        self.audio_buffer.extend(audio_chunk_bytes)
        combined_audio_bytes = bytes(self.audio_buffer)

        if HAS_AI_ENGINE and analyzer:
            # 1. Instant Acoustic + Intent evaluation using current rolling transcript (<5ms)
            result = analyzer.push_chunk(
                combined_audio_bytes,
                transcript_text=self.latest_transcript
            )

            # 2. Fire-and-forget background transcription task (throttled to avoid Groq rate limits)
            if self.chunk_count % 4 == 0 or len(self.audio_buffer) > 500000:
                executor.submit(self._run_background_transcription, combined_audio_bytes)

            # Update the current transcript if the engine returns one immediately.
            if result.get("transcript"):
                self.latest_transcript = str(result["transcript"])

            # 3. Inject the background Groq LLM intent score into the fast acoustic response
            if self.latest_intent_score > result.get("intent_risk", 0):
                result["intent_risk"] = self.latest_intent_score

            acoustic_risk = float(result.get("acoustic_risk", 0.0))
            intent_risk = float(result.get("intent_risk", 0.0))
            
            # Reconstruct threat_score since _production_result omits it
            threat_score = float(result.get("threat_score", max(acoustic_risk, intent_risk)))

            reasoning = str(result.get("reasoning", "Acoustic or intent threat detected."))

            print(f"[Debug] Transcript: {self.latest_transcript} | Intent Score: {intent_risk} | Overall: {threat_score}")

            triggers = self.latest_intent_triggers if self.latest_intent_triggers else result.get("triggers", [])

            return {
                "threat_score": threat_score,
                "acoustic_risk": acoustic_risk,
                "intent_risk": intent_risk,
                "transcript": self.latest_transcript,
                "alert": threat_score > 80.0,
                "reasoning": reasoning,
                "triggers": triggers if threat_score > 50 else []
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
                # Replace the entire rolling transcript snippet for context
                self.latest_transcript = text.strip()
                
                # Execute custom Groq LLM Intent analysis
                intent_result = analyze_coercion_intent(self.latest_transcript, config=config)
                self.latest_intent_score = intent_result.get("coercion_score", 0)
                self.latest_intent_triggers = intent_result.get("detected_triggers", [])
        except Exception as e:
            print(f"[Transcription Error] {e}")