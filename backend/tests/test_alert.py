import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

async def send_test():
    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": "🚨 *NEXORA TEST ALERT:* VoiceLock emergency alert pipeline is live!",
        "parse_mode": "Markdown"
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        print("Response Code:", response.status_code)
        print("Response Body:", response.json())

asyncio.run(send_test())