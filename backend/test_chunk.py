import asyncio
from core.ai_orchestrator import SessionThreatTracker

async def main():
    tracker = SessionThreatTracker()
    result = await tracker.process_chunk(b'0' * 15)
    print("Result:", result)

asyncio.run(main())
