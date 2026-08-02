# Nexora

Nexora is a production-ready real-time voice threat detection platform designed for fraud prevention and call safety. It combines a FastAPI backend with a Next.js frontend to deliver live threat scoring, transcript feed, alert triggers, and notification support during active call sessions.

## What this project does

- Receives live audio chunks from the browser over WebSocket
- Processes each audio chunk with a voice threat engine
- Maintains rolling transcript context for higher accuracy
- Streams threat scores, transcript updates, and trigger metadata back to the frontend
- Sends alert notifications via Telegram for critical calls
- Logs call events to Supabase for audit and analytics

## Production-ready characteristics

- `FastAPI` backend with WebSocket `/ws/audio` endpoint
- Configurable CORS policy using `ALLOWED_ORIGINS`
- Environment-driven Telegram and Supabase integration
- Non-blocking background transcription thread pool
- Mock fallback mode for local development when AI engine is unavailable
- Separate frontend production build and run workflow

## Repo structure

- `backend/`
  - `main.py` — FastAPI application and WebSocket endpoint
  - `core/ai_orchestrator.py` — session tracking, scoring, and transcript management
  - `services/database.py` — Supabase audit logging helper
  - `.env.example` — environment template
  - `requirements.txt` — backend Python dependencies
- `frontend/`
  - `app/page.tsx` — main user-facing UI
  - `app/hooks/useMicrophone.ts` — microphone capture hook
  - `app/hooks/useWebSocket.ts` — WebSocket client hook
  - `components/` — UI components and live dashboard layout
  - `package.json` — frontend dependencies and scripts

## Prerequisites

- Python 3.11+ (recommended)
- Node 20+ / npm 10+
- `uvicorn` for backend app hosting
- `next` for frontend build and production server
- Optional: `ai_core.ai_engine` package for real threat inference

## Backend setup (production-ready)

1. Create and activate a virtual environment:

```bash
python -m venv .venv
.venv\Scripts\activate
```

2. Install backend dependencies:

```bash
pip install -r backend/requirements.txt
```

3. Create `.env` from the example and configure production values:

```bash
cd backend
copy .env.example .env
```

4. Set production environment values in `backend/.env`:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `ALLOWED_ORIGINS` (example: `https://your-frontend-domain.com`)

> **Security note:** Do not leave `ALLOWED_ORIGINS` as `*` in production. Restrict it to your actual frontend origin.

5. Run the backend in production mode:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

For higher availability, deploy behind a reverse proxy like Nginx or a process manager such as `gunicorn` + `uvicorn.workers.UvicornWorker`.

## Frontend setup (production-ready)

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Build the frontend assets:

```bash
npm run build
```

3. Start the production server:

```bash
npm run start
```

4. Access the frontend at:

```text
http://localhost:3000
```

## Local development

### Backend dev mode

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend dev mode

```bash
cd frontend
npm run dev
```

Use `ALLOWED_ORIGINS=http://localhost:3000` while developing locally.

## Deployment checklist

- [ ] Confirm backend `.env` is configured with production secret values
- [ ] Set `ALLOWED_ORIGINS` to the frontend domain only
- [ ] Install `ai_core.ai_engine` if you want real inference instead of mock fallback
- [ ] Configure TLS/HTTPS for frontend and backend endpoints
- [ ] Enable monitoring or logs for WebSocket connections and alert delivery
- [ ] Verify Supabase audit logs are being recorded correctly

## How it works

1. The browser captures audio from the microphone or demo stream.
2. The frontend sends audio chunks to `/ws/audio` via WebSocket.
3. `SessionThreatTracker` processes each chunk and optionally updates the rolling transcript.
4. The backend returns a payload with:
   - threat score
   - acoustic risk
   - intent risk
   - transcript text
   - alert flag
   - detected trigger categories
5. Critical alerts trigger a Telegram notification and Supabase audit log.

## Environment variables

Add or update these values in `backend/.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
SUPABASE_URL=your_supabase_url_here
SUPABASE_KEY=your_supabase_key_here
ALLOWED_ORIGINS=https://your-frontend-domain.com
```

## Notes

- The backend uses a mock threat engine when `ai_core.ai_engine` is unavailable.
- The `frontend` uses Next.js 16 and React 19.
- The WebSocket endpoint is intended for real-time audio streaming and must be reachable from the browser.

## Troubleshooting

- If the frontend cannot connect, verify `ALLOWED_ORIGINS` and backend host/port.
- If transcription is missing, ensure the AI engine package is installed or review mock mode behavior.
- If alerts fail, confirm Telegram credentials and network access.

## Recommended next steps

- Add tests for WebSocket audio handling and backend response payloads
- Add frontend error handling for connection failures and transcript latency
- Harden production deployment with TLS and a reverse proxy
- Enable observability for alert delivery and session tracking

