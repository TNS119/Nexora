import os
import json
import asyncio
import base64
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv

from services.database import log_call_event
from core.ai_orchestrator import warm_up_engine, SessionThreatTracker

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Execute model warm-up on FastAPI startup to avoid cold-start latency
    warm_up_engine()
    yield

app = FastAPI(title="Nexora VoiceLock Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

async def trigger_telegram_alert(threat_score: float, reasoning: str):
    """Sends an instant push notification via Telegram Bot if threat > 80%."""
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID or TELEGRAM_BOT_TOKEN == "dummy_token_for_now":
        return

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    message = (
        f"🚨 *NEXORA CRITICAL SCAM ALERT* 🚨\n\n"
        f"⚠️ *Threat Score:* {threat_score:.1f}%\n"
        f"🔍 *Analysis:* {reasoning}\n"
        f"📱 *Action:* Emergency contacts notified."
    )
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown"
    }

    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json=payload)
            print("[Alert Success] Telegram alert dispatched successfully!")
        except Exception as e:
            print(f"[Alert Error] Failed to reach Telegram API: {e}")

@app.get("/")
def health_check():
    return {"status": "online", "system": "Nexora Backend Running"}

@app.websocket("/ws/audio")
async def audio_stream_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WebSocket] Client connected successfully")
    
    # Instantiate a dedicated threat tracker per connected call stream
    session_tracker = SessionThreatTracker()

    try:
        while True:
            # 1. Receive incoming WebSocket message (accepts raw binary or base64 text)
            message = await websocket.receive()
            
            audio_bytes = b""
            if "bytes" in message and message["bytes"]:
                audio_bytes = message["bytes"]
            elif "text" in message and message["text"]:
                text_data = message["text"]
                try:
                    audio_bytes = base64.b64decode(text_data)
                except Exception:
                    audio_bytes = text_data.encode("utf-8")

            if not audio_bytes:
                continue

            # 2. Delegate chunk processing to the session tracker
            ai_result = await session_tracker.process_chunk(audio_bytes)

            threat_score = ai_result["threat_score"]
            acoustic_risk = ai_result["acoustic_risk"]
            intent_risk = ai_result["intent_risk"]
            alert_triggered = ai_result["alert"]
            reasoning = ai_result["reasoning"]

            response_payload = {
                "threat_score": threat_score,
                "acoustic_risk": acoustic_risk,
                "intent_risk": intent_risk,
                "alert": alert_triggered,
                "transcript": ai_result.get("transcript", ""),
                "reasoning": reasoning,
            }

            # 3. Fire non-blocking Telegram alerts
            if alert_triggered:
                asyncio.create_task(
                    trigger_telegram_alert(threat_score, reasoning)
                )

            # 4. Fire non-blocking Supabase audit logs
            asyncio.create_task(
                log_call_event(
                    threat_score,
                    acoustic_risk,
                    intent_risk,
                    alert_triggered
                )
            )

            # 5. Send real-time evaluation back to frontend client
            await websocket.send_text(json.dumps(response_payload))

    except WebSocketDisconnect:
        print("[WebSocket] Client disconnected")