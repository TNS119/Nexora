# VoiceLock AI 🛡️

**Real-Time Synthetic Voice & Coercive Scam Call Intervention Engine**

[![Track: AI / Security & Defense](https://img.shields.io/badge/Hackathon_Track-AI_%2F_Security-emerald?style=for-the-badge)](https://github.com)
[![Architecture: Event--Driven WS](https://img.shields.io/badge/Architecture-Event--Driven_WS-blue?style=for-the-badge)](https://github.com)
[![Frontend: Next.js 14+](https://img.shields.io/badge/Frontend-Next.js_14%2B-black?style=for-the-badge)](https://nextjs.org)
[![Backend: FastAPI + Librosa](https://img.shields.io/badge/Backend-FastAPI_%2B_Librosa-009688?style=for-the-badge)](https://fastapi.tiangolo.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

> Modern voice-cloning AI can clone a family member's voice with just 3 seconds of sample audio. VoiceLock AI listens to live call audio in real time and stops the scam **before money leaves the victim's account.**

---

## 📑 Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution — Step by Step](#2-solution--step-by-step)
3. [Key Features of the Solution](#3-key-features-of-the-solution)
4. [AI Tech Stack Used](#4-ai-tech-stack-used)
5. [Expected Benefits](#5-expected-benefits)
6. [Real-Life Example Use Case](#6-real-life-example-use-case)
7. [Getting Started](#7-getting-started)
8. [Judge's Evaluation & Rubric Alignment](#-judges-evaluation--rubric-alignment)
9. [Roadmap](#-roadmap)
10. [Team](#-team)
11. [License](#-license)

---

## 1. Problem Statement

Modern generative-AI voice-cloning tools can replicate a family member's voice from just a few seconds of sample audio. When paired with coercive social-engineering scripts (*"Grandma, I'm in jail, wire money now"*), traditional caller ID and blocklists offer no protection.

Victims — often elderly or otherwise vulnerable — are manipulated under extreme urgency and cannot audibly distinguish a synthetic clone from a genuine human voice before executing irreversible financial transfers. By the time a scam is reported, the money is already gone.

---

## 2. Solution — Step by Step

1. The client app captures live call audio (microphone or line-in) and slices it into continuous **500ms binary chunks**.
2. Chunks are streamed in real time to the backend over a **full-duplex WebSocket** connection — no polling, no REST overhead.
3. An **Acoustic Feature Engine** (Librosa / MFCC / STFT) analyzes each chunk for synthetic vocoder artifacts and spectral anomalies.
4. In parallel, incoming audio is transcribed (Groq Whisper) and scanned by an LLM (Groq Llama 3) for coercion, urgency, and financial-fraud language patterns.
5. Both signals are fused into a single composite **Threat Score (0–100%)** every 500ms and pushed back to the client as JSON.
6. The frontend HUD updates instantly — gauge color, transcript feed, and trigger badges — with zero page reloads.
7. If the score crosses the critical threshold (80%+), the UI fires a full-screen flashing alert and offers a one-tap emergency action.

```
                        Full-Duplex WebSocket
┌─────────────────────────┐   ws://localhost:8000/ws   ┌──────────────────────────────┐
│    Next.js Client       │ ─────────────────────────> │       FastAPI Server         │
│                          │   500ms Binary Blobs       │                              │
│  • MediaRecorder API     │                            │  1. Acoustic Feature Engine  │
│  • Dynamic HUD Gauge     │ <───────────────────────── │     (Librosa / MFCC / STFT)  │
│  • Waveform Animator     │    Threat Telemetry JSON   │  2. Intent Coercion Engine   │
└─────────────────────────┘                            │     (Groq Whisper + Llama 3) │
                                                         └──────────────────────────────┘
```

---

## 3. Key Features of the Solution

- **Sub-second, dual-engine threat detection** — acoustic + semantic signals fused into one live score.
- **Dynamic 3-tier visual HUD:**

  | State | Range | Behavior |
  | :--- | :--- | :--- |
  | 🟢 Safe | 0% – 49% | Natural vocal cadence; no coercion detected. |
  | 🟡 Suspicious | 50% – 79% | Spectral flattening *or* urgent financial keywords flagged. |
  | 🔴 Critical Alert | 80% – 100% | Synthetic artifacts + demand for secrecy, bail, or untraceable funds. |

- **Live transcript feed** with real-time trigger-badge highlighting (e.g., `[!] Bail Request`, `[!] Urgent Wire Transfer`).
- **One-tap emergency action button** that notifies a trusted contact instantly.
- **Deterministic demo/simulation mode** for reliable, reproducible live testing without live hardware dependencies.
- **Zero-cloud, low-latency architecture** built for real-time intervention, not after-the-fact analysis.

---

## 4. AI Tech Stack Used

| Layer | Technology |
| :--- | :--- |
| Frontend | Next.js 14 (React), Tailwind CSS, Web Audio API, `MediaRecorder` |
| Backend | FastAPI (Python), WebSockets (`asyncio`), Pydantic |
| Acoustic Analysis | `librosa`, `numpy` — MFCC / spectral / zero-crossing-rate feature extraction |
| Speech-to-Text | Groq API — `whisper-large-v3` |
| Semantic Risk Scoring | Groq API — `llama-3.1-8b-instant` |
| Data & Logging | Supabase (immutable call threat logging) |

---

## 5. Expected Benefits

- **Prevents financial loss** by intervening before a transaction occurs, not after a scam is reported.
- **Protects vulnerable populations** (elderly, non-technical users) without requiring them to learn new behavior.
- **Reduces reliance on victims' own judgment** under high psychological pressure.
- **Creates an auditable threat log** for post-call reporting to family or authorities.
- **Generalizes beyond the demo** — the same architecture applies to telecom-level call screening, VoIP/browser extensions, and assistive hardware.

---

## 6. Real-Life Example Use Case

Meera, 72, receives a call that sounds exactly like her grandson's voice: *"Grandma, I'm in jail and I need bail money right now — please don't tell mom."*

In a traditional scenario, panic and trust would lead her to wire money within minutes. With VoiceLock AI running on her phone:

- The **acoustic engine** detects micro-artifacts inconsistent with a real human voice within the first few seconds of the call.
- The **semantic engine** flags the bail request and secrecy demand as high-risk coercion patterns.
- The **Threat Score crosses 80%** before Meera even finishes the call, triggering a critical alert that tells her to stop and verify.

That handful of seconds is enough for her to hang up and call her grandson directly — confirming he's safe at home, and that no money should ever have been sent.

---

## 7. Getting Started

### Prerequisites

- Node.js (v18+)
- Python (v3.10+)

### 1. Launch the Backend Server

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create your .env file
echo "GROQ_API_KEY=your_key_here" > .env
echo "SUPABASE_URL=your_url" >> .env
echo "SUPABASE_KEY=your_key" >> .env

# Start WebSocket server
uvicorn main:app --reload --port 8000
```

### 2. Launch the Next.js HUD

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in Chrome or Edge to view the Active Call HUD.

### Live Demo Flow

**Flow 1 — Human Voice Baseline:** Click *Answer Call*, speak naturally. The waveform pulses and the Threat Gauge stays in the green Safe state (0–20%).

**Flow 2 — AI Voice Impersonation Alert:** Click *Answer Call* and trigger the built-in scam simulation. Watch the gauge climb past 50%, breach 80%, and trigger the flashing Critical Alert state with live trigger badges. Click *End Call* — the final threat percentage stays locked on screen as an audit trail.

---

## 🏆 Judge's Evaluation & Rubric Alignment

| Rubric Pillar | How VoiceLock AI Delivers |
| :--- | :--- |
| **Innovation & Novelty** | Moves beyond "post-call analysis" to **live, sub-second intervention**, fusing acoustic and semantic detection into one score. |
| **Technical Execution** | Low-latency 500ms binary audio streaming over native WebSockets; dynamic HUD driven entirely by real-time JSON payloads. |
| **Practical Applicability** | Feasible for telecom integration, mobile assistive apps, or elderly-protection hardware — no specialized equipment required. |
| **Demo Engineering** | Deterministic scam-simulation pipeline guarantees reproducible evaluation without live hardware dependencies. |

---

## 🗺️ Roadmap

- [ ] On-device acoustic pre-filtering to cut cloud inference costs
- [ ] Multi-language coercion-pattern detection
- [ ] Native mobile (iOS/Android) call-screen integration
- [ ] Caregiver/family dashboard for shared threat history
- [ ] Telecom-grade SIP trunk integration for carrier-level deployment

---

## 👥 Team

Built in 36 hours by a 3-person team spanning frontend, backend, and AI/ML engineering.

| Role | Focus Area |
| :--- | :--- |
| Frontend & UI Lead | Call HUD, audio capture, live threat dashboard |
| Backend & Systems Architect | WebSocket server, threat fusion logic, alerting |
| AI Engine & Signal Processing | Acoustic modeling, transcription, coercion scoring |

---

<p align="center"><i>VoiceLock AI — because the last line of defense against a scam should be smarter than a hunch.</i></p>
