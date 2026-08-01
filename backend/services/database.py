import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load secret environment variables from .env
load_dotenv()

# Sanitize environment variables by stripping whitespace and trailing slashes
raw_url = os.getenv("SUPABASE_URL", "")
raw_key = os.getenv("SUPABASE_KEY", "")

SUPABASE_URL = raw_url.strip().rstrip("/") if raw_url else None
SUPABASE_KEY = raw_key.strip() if raw_key else None

supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY and "your-project-id" not in SUPABASE_URL:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[Database] Supabase client initialized successfully.")
    except Exception as e:
        print(f"[Database Error] Failed to initialize Supabase: {e}")

async def log_call_event(threat_score: float, acoustic_risk: float, intent_risk: float, alert_triggered: bool):
    """Logs threat evaluation data into the Supabase PostgreSQL database asynchronously."""
    if not supabase:
        print("[Database Info] Supabase not configured. Skipping log entry.")
        return

    data = {
        "threat_score": float(threat_score),
        "acoustic_risk": float(acoustic_risk),
        "intent_risk": float(intent_risk),
        "alert_triggered": bool(alert_triggered)
    }

    try:
        # Insert data into the 'call_logs' table in public schema
        response = supabase.table("call_logs").insert(data).execute()
        print("[Database Success] Call event logged to Supabase:", response.data)
    except Exception as e:
        print(f"[Database Error] Failed to insert log row: {e}")