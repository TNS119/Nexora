import asyncio
import websockets
import json

async def simulate_call():
    uri = "ws://127.0.0.1:8000/ws/audio"
    print("🔌 Connecting to Nexora WebSocket Server...")
    
    async with websockets.connect(uri) as websocket:
        print("✅ Connected! Simulating live call audio stream...\n")
        
        for chunk_id in range(1, 4):
            print(f"📡 Sending Audio Chunk #{chunk_id}...")
            await websocket.send(f"audio_data_stream_chunk_{chunk_id}")
            
            # Updated: .recv() reads the incoming response payload
            response = await websocket.recv()
            data = json.loads(response)
            
            print(f"📊 Server Response:")
            print(f"   • Threat Score: {data['threat_score']}%")
            print(f"   • Acoustic Risk: {data['acoustic_risk']}%")
            print(f"   • Intent Risk: {data['intent_risk']}%")
            print(f"   • Alert Triggered: {data['alert']}\n")
            
            await asyncio.sleep(2)

asyncio.run(simulate_call())