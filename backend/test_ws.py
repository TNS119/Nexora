import asyncio
import websockets
import json

async def test():
    async with websockets.connect('ws://localhost:8000/ws/audio') as ws:
        await ws.send(b'0' * 500)
        res = await ws.recv()
        print('Response:', res)

asyncio.run(test())
