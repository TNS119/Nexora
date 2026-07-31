import os
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv

# Load secret environment variables from .env file
load_dotenv()

app = FastAPI(title="Nexora VoiceLock Engine")

# Enable CORS so Frontend (Next.js) can connect without browser security blocks
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
        print("[Alert Info] Telegram credentials missing or placeholder. Skipping alert.")
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
    """HTTP endpoint to confirm server status."""
    return {"status": "online", "system": "Nexora Backend Running"}

@app.websocket("/ws/audio")
async def audio_stream_endpoint(websocket: WebSocket):
    """WebSocket endpoint handling real-time audio streams & threat fusion."""
    await websocket.accept()
    print("[WebSocket] Client connected successfully")

    try:
        while True:
            # 1. Receive incoming stream message from Frontend (Person A)
            client_data = await websocket.receive_text()
            
            # --- THREAT FUSION LOGIC ---
            # (Replace these placeholders with real imports from Person C's AI module later)
            acoustic_risk = 95.0   # Spectral vocoder anomaly score
            intent_risk = 89.0     # Coercive NLP scam phrase score
            
            # Threat Fusion Matrix Formula: (0.5 * Acoustic) + (0.5 * Coercion)
            fused_threat_score = (0.5 * acoustic_risk) + (0.5 * intent_risk)
            
            # Formatted JSON payload matching your exact team specification contract
            response_payload = {
                "threat_score": round(fused_threat_score, 1),
                "acoustic_risk": round(acoustic_risk, 1),
                "intent_risk": round(intent_risk, 1),
                "alert": fused_threat_score > 80.0
            }

            # 2. Trigger async Telegram alert if threat score exceeds 80%
            if fused_threat_score > 80.0:
                asyncio.create_task(
                    trigger_telegram_alert(
                        fused_threat_score,
                        "High spectral phase anomaly + Urgent wire transfer language detected."
                    )
                )

            # 3. Stream real-time telemetry back to Frontend
            await websocket.send_text(json.dumps(response_payload))

    except WebSocketDisconnect:
        print("[WebSocket] Client disconnected")