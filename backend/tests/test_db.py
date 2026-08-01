import os
import asyncio
from dotenv import load_dotenv
from services.database import log_call_event, supabase

load_dotenv()

print(f"🔍 SUPABASE_URL: {os.getenv('SUPABASE_URL')}")
print(f"🔍 Supabase Client Status: {'Initialized' if supabase else 'NOT Initialized'}\n")

async def test_direct_insert():
    print("🚀 Attempting direct insert into Supabase...")
    await log_call_event(
        threat_score=88.5,
        acoustic_risk=90.0,
        intent_risk=87.0,
        alert_triggered=True
    )

asyncio.run(test_direct_insert())