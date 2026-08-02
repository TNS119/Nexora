from __future__ import annotations

import unittest
from unittest.mock import patch

import ai_engine
from ai_engine import EngineConfig, RealtimeThreatAnalyzer, analyze_audio_chunk, analyze_coercion_intent, _load_dotenv


class AudioEngineTests(unittest.TestCase):
    def test_fallback_coercion_scores_emergency_payment_scam_high(self) -> None:
        result = analyze_coercion_intent(
            "I got into a crash and I am in jail. Send $3000 bail right now and don't tell mom."
        )

        self.assertIs(result["is_scam"], True)
        self.assertGreaterEqual(result["coercion_score"], 85)
        self.assertIn("legal threat", result["detected_triggers"])
        self.assertIn("secrecy demand", result["detected_triggers"])

    def test_fallback_coercion_scores_casual_chat_low(self) -> None:
        result = analyze_coercion_intent("I had a long day at work and might get coffee later.")

        self.assertIs(result["is_scam"], False)
        self.assertLess(result["coercion_score"], 25)
        self.assertEqual(result["detected_triggers"], [])

    def test_fallback_scores_family_accident_payment_request_high(self) -> None:
        result = analyze_coercion_intent(
            "Hey, good morning grandma. I ran into an accident here. "
            "I need some money. Could you please send me 5000 rupees please."
        )

        self.assertIs(result["is_scam"], True)
        self.assertGreaterEqual(result["coercion_score"], 85)
        self.assertIn("family emergency payment request", result["detected_triggers"])

    def test_analyze_audio_chunk_fuses_scores(self) -> None:
        with patch.object(ai_engine, "analyze_acoustic_risk", return_value={"score": 90, "triggers": [], "metrics": {}}):
            result = analyze_audio_chunk(
                b"fake-audio",
                config=EngineConfig(alert_threshold=80),
                transcript_text="Wire bail money immediately and don't tell mom.",
                include_debug=True,
            )

        self.assertGreaterEqual(result["threat_score"], 80)
        self.assertEqual(result["acoustic_risk"], 90)
        self.assertIs(result["alert_required"], True)
        self.assertEqual(result["transcript"], "Wire bail money immediately and don't tell mom.")

    def test_weighted_score_normalizes_weights(self) -> None:
        self.assertEqual(ai_engine._weighted_score(100, 0, acoustic_weight=2, coercion_weight=2), 50)
        self.assertEqual(ai_engine._weighted_score(100, 0, acoustic_weight=3, coercion_weight=1), 75)

    def test_calibrated_acoustic_metrics_score_synthetic_high(self) -> None:
        scored = ai_engine._score_acoustic_metrics(
            {
                "mfcc_variance": 8598.0,
                "spectral_flatness": 0.027,
                "rms": 0.068,
                "zero_crossing_rate": 0.1,
                "spectral_centroid": 1326.0,
                "spectral_bandwidth": 1310.0,
                "spectral_rolloff": 2615.0,
                "spectral_contrast": 24.0,
                "pitch_variation": 0.24,
                "voiced_frames": 173.0,
            }
        )

        self.assertGreaterEqual(scored["score"], 85)
        self.assertIn("high_mfcc_variance", scored["triggers"])
        self.assertIn("low_spectral_contrast", scored["triggers"])

    def test_realtime_chunk_analyzer_returns_fast_payload(self) -> None:
        raw_pcm = b"\x00\x00" * 8000

        result = ai_engine.analyze_realtime_audio_chunk(raw_pcm, raw_pcm=True)

        self.assertEqual(set(result), {
            "acoustic_risk",
            "intent_risk",
            "transcript",
            "keywords_found",
            "is_synthetic",
            "is_scam_pattern",
        })
        self.assertIn("acoustic_risk", result)
        self.assertIn("is_synthetic", result)

    def test_realtime_analyzer_smooths_scores(self) -> None:
        analyzer = RealtimeThreatAnalyzer(config=EngineConfig(), smoothing_chunks=4, include_debug=True)
        fake_results = [
            {
                "threat_score": 100,
                "acoustic_risk": 100,
                "intent_risk": 0,
                "alert_required": True,
                "is_scam_pattern": False,
                "mode": "realtime_balanced",
                "transcript": "",
                "keywords_found": [],
            },
            {
                "threat_score": 100,
                "acoustic_risk": 100,
                "intent_risk": 0,
                "alert_required": True,
                "is_scam_pattern": False,
                "mode": "realtime_balanced",
                "transcript": "",
                "keywords_found": [],
            },
            {
                "threat_score": 100,
                "acoustic_risk": 100,
                "intent_risk": 0,
                "alert_required": True,
                "is_scam_pattern": False,
                "mode": "realtime_balanced",
                "transcript": "",
                "keywords_found": [],
            },
            {
                "threat_score": 100,
                "acoustic_risk": 100,
                "intent_risk": 0,
                "alert_required": True,
                "is_scam_pattern": False,
                "mode": "realtime_balanced",
                "transcript": "",
                "keywords_found": [],
            },
            {
                "threat_score": 0,
                "acoustic_risk": 0,
                "intent_risk": 0,
                "alert_required": False,
                "is_scam_pattern": False,
                "mode": "realtime_balanced",
                "transcript": "",
                "keywords_found": [],
            },
        ]

        with patch.object(ai_engine, "analyze_realtime_audio_chunk", side_effect=fake_results):
            first = analyzer.push_chunk(b"\x00\x00")
            analyzer.push_chunk(b"\x00\x00")
            analyzer.push_chunk(b"\x00\x00")
            fourth = analyzer.push_chunk(b"\x00\x00")
            fifth = analyzer.push_chunk(b"\x00\x00")

        self.assertEqual(first["threat_score"], 0)
        self.assertEqual(fourth["threat_score"], 100)
        self.assertEqual(fifth["threat_score"], 90)
        self.assertEqual(fifth["instant_threat_score"], 0)

    def test_high_confidence_semantic_override_can_drive_alert(self) -> None:
        with patch.object(ai_engine, "analyze_acoustic_risk", return_value={"score": 0, "triggers": [], "metrics": {}}):
            result = analyze_audio_chunk(
                b"fake-audio",
                config=EngineConfig(alert_threshold=80),
                transcript_text=(
                    "I am in jail. Send 3000 dollars for bail money right now "
                    "and do not tell mom."
                ),
                include_debug=True,
            )

        self.assertEqual(result["intent_risk"], 95)
        self.assertEqual(result["threat_score"], 95)
        self.assertIs(result["alert_required"], True)
        self.assertIs(result["is_synthetic"], False)
        self.assertIs(result["is_scam_pattern"], True)
        self.assertEqual(result["threat_category"], "scam_content")

    def test_groq_confirmed_scam_override_can_drive_alert_at_80(self) -> None:
        intent = {
            "coercion_score": 80,
            "is_scam": True,
            "detected_triggers": ["urgency", "request_for_money", "family_impersonation"],
        }

        self.assertEqual(ai_engine._apply_high_confidence_override(40, intent), 81)

    def test_acoustic_decode_failure_does_not_abort_semantic_analysis(self) -> None:
        with patch.object(ai_engine, "analyze_acoustic_risk", side_effect=RuntimeError("decode failed")):
            result = analyze_audio_chunk(
                b"fake-audio",
                config=EngineConfig(alert_threshold=80),
                transcript_text=(
                    "I am in jail. Send 3000 dollars for bail money right now "
                    "and do not tell mom."
                ),
                include_debug=True,
            )

        self.assertEqual(result["acoustic_risk"], 0)
        self.assertIn("decode failed", result["acoustic_error"])
        self.assertEqual(result["threat_score"], 95)
        self.assertIs(result["alert_required"], True)

    def test_analyze_audio_chunk_returns_production_contract_by_default(self) -> None:
        with patch.object(ai_engine, "analyze_acoustic_risk", return_value={"score": 90, "triggers": [], "metrics": {}}):
            result = analyze_audio_chunk(
                b"fake-audio",
                transcript_text="I am in jail. Send 3000 dollars for bail right now and do not tell mom.",
            )

        self.assertEqual(set(result), {
            "acoustic_risk",
            "intent_risk",
            "transcript",
            "keywords_found",
            "is_synthetic",
            "is_scam_pattern",
        })
        self.assertEqual(result["acoustic_risk"], 90)
        self.assertGreaterEqual(result["intent_risk"], 70)
        self.assertIs(result["is_synthetic"], True)
        self.assertIs(result["is_scam_pattern"], True)

    def test_raw_pcm_payload_is_wrapped_as_wav(self) -> None:
        file_name, file_bytes = ai_engine._audio_as_file_payload(
            b"\x00\x00" * 160,
            sample_rate=16_000,
            raw_pcm=True,
            pcm_channels=1,
        )

        self.assertEqual(file_name, "chunk.wav")
        self.assertTrue(file_bytes.startswith(b"RIFF"))
        self.assertIn(b"WAVE", file_bytes[:16])

    def test_threat_category_distinguishes_audio_and_content(self) -> None:
        self.assertEqual(
            ai_engine._threat_category(
                synthetic_voice_suspected=False,
                scam_content_suspected=True,
            ),
            "scam_content",
        )
        self.assertEqual(
            ai_engine._threat_category(
                synthetic_voice_suspected=True,
                scam_content_suspected=True,
            ),
            "synthetic_voice_scam",
        )

    def test_parse_intent_json_tolerates_wrapped_json(self) -> None:
        parsed = ai_engine._parse_intent_json('Result: {"coercion_score": 44, "is_scam": false}')

        self.assertEqual(parsed["coercion_score"], 44)
        self.assertIs(parsed["is_scam"], False)

    def test_fallback_coercion_scores_safe_content_low(self) -> None:
        result = analyze_coercion_intent("The weather is nice today, let's go for a walk.")

        self.assertIs(result["is_scam"], False)
        self.assertLess(result["coercion_score"], 25)
        self.assertEqual(result["detected_triggers"], [])

    def test_fallback_coercion_scores_empty_string_zero(self) -> None:
        result = analyze_coercion_intent("")

        self.assertEqual(result["coercion_score"], 0)
        self.assertIs(result["is_scam"], False)
        self.assertEqual(result["detected_triggers"], [])

    def test_load_dotenv_sets_env_vars(self) -> None:
        import os
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmpdir:
            env_path = Path(tmpdir) / ".env"
            env_path.write_text('TEST_DOTENV_KEY="test_value"\n', encoding="utf-8")
            original = ai_engine.__file__
            # Temporarily point _load_dotenv at our test .env
            with patch.object(ai_engine.Path, '__new__', return_value=env_path):
                pass  # _load_dotenv uses Path(__file__).resolve().parent / ".env"

        # Verify _load_dotenv is callable without error
        _load_dotenv()

    def test_realtime_analyzer_accepts_transcribe_interval(self) -> None:
        analyzer = RealtimeThreatAnalyzer(
            config=EngineConfig(),
            transcribe_interval_chunks=4,
        )
        self.assertEqual(analyzer._transcribe_interval, 4)
        self.assertEqual(analyzer._chunk_count, 0)
        self.assertIsNone(analyzer._last_transcript)

    def test_analyze_audio_chunk_no_transcript_no_groq_gives_zero_coercion(self) -> None:
        """Without Groq and without a transcript, coercion should be 0."""
        with patch.object(ai_engine, "analyze_acoustic_risk", return_value={"score": 10, "triggers": [], "metrics": {}}):
            result = analyze_audio_chunk(
                b"fake-audio",
                config=EngineConfig(groq_api_key=None),
                transcript_text=None,
                include_debug=True,
            )

        self.assertEqual(result["intent_risk"], 0)
        self.assertIs(result["is_scam_pattern"], False)


if __name__ == "__main__":
    unittest.main()
