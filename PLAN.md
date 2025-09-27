# SynapseNet – Interactive 3D Hardware Atlas & Chaos Survival Challenge

## 🚀 Overview

SynapseNet is an **interactive, AI-powered 3D dashboard** that reimagines what it means to be connected.  
We simulate hardware systems (CPUs, GPUs, memory, switches, interconnects like PCIe/NVLink/CXL) as a **living digital nervous system**.

- In **Learning Mode**, the system is an **explorable 3D atlas**:

  - Users can grab and move nodes (via hand gestures or mouse).
  - Removing or rerouting nodes shows real-time changes in latency, throughput, and resilience.
  - Acts as a **teaching tool** for people learning how hardware components communicate.

- In **Chaos Mode**, the system becomes a **survival challenge**:
  - An adversarial AI injects failures, overloads, and anomalies.
  - Users must use hand gestures (Cut, Heal, Reroute, Shield) to keep the system alive for 60s.
  - The system fights back dynamically; resilience score determines win/lose.

This project is **fun, visually stunning, and useful**. It’s both a learning platform and a performance piece.

---

## 🎯 Core Goals

1. **Reimagine connection**: Make hardware interactions feel alive and explorable.
2. **Make AI the star**: AI injects chaos, detects anomalies, predicts failures, and reroutes intelligently.
3. **Enable interactivity**: Users control the system via gestures (computer vision) or fallback keyboard.
4. **Provide quantifiable results**: Metrics show resilience, throughput, downtime, and learning feedback.
5. **Deliver wow factor**: Judges see glowing 3D visuals, live chaos battles, and immersive sound.

---

## 🧩 Features

### 1. Telemetry Simulation

- Nodes: CPUs, GPUs, memory banks, switches.
- Links: PCIe, NVLink, CXL, Fabric.
- Metrics per link: latency, bandwidth, errors, utilization, status.
- Procedural simulation (AR(1) + Poisson spikes).
- Chaos injection: random degradation bursts.

### 2. Learning Mode (Atlas)

- 3D cluster rendered as glowing galaxy.
- Hover over a node → tooltip explaining its role.
- Remove a node → bandwidth redistributes, latency spikes.
- Move nodes → visual + metric changes update in real time.
- Side panel explains “what just happened” in plain English.

### 3. Chaos Mode (Survival Challenge)

- AI adversary injects anomalies:
  - Latency spikes
  - Link overloads
  - Node isolation
- Player uses gestures:
  - ✊ Cut → isolate bad link
  - ✋ Heal → repair link
  - 👉 Reroute → force traffic around issue
  - 🙌 Shield → global resilience boost
- Difficulty:
  - Easy = turn-based, 5s to respond
  - Medium = hybrid, shorter windows
  - Hard = real-time continuous attacks
- Win = survive 60s with resilience > threshold.

### 4. Computer Vision Controls

- Powered by **MediaPipe Hands** or **TensorFlow.js handpose**.
- Gestures detected:
  - ✊ closed fist
  - ✋ open palm
  - 👉 index finger extended
  - 🙌 both hands open
- Mapped to backend control routes.
- Keyboard fallback: C, H, R, S.

### 5. 3D Visualization

- **React + Three.js + react-three-fiber**.
- Nodes = spheres with glowing emissive shaders.
- Links = curved tubes with flowing particle trails.
- Particles = data packets moving along connections.
- Animations:
  - Red edges = flicker + sparks
  - Heal = glowing wave
  - Reroute = wormhole effect
  - Shield = radial bloom
- Background = cosmic gradient (dark → blue/teal glows).

### 6. Metrics & Feedback

- Resilience Gauge (0–100).
- Downtime %, Recovery time, Throughput gain %.
- Event log (AI attack, player action, resolution).
- Floating score deltas (+8, -10) near gauge.
- Post-game summary screen.

### 7. Audio Layer

- **Tone.js** for sound design.
- Healthy system = ambient harmony.
- Attack = glitch/distortion.
- Heal = chord resolution.
- Reroute = arpeggio sweep.
- Win/Lose = triumphant vs. collapse sound.

---

## 🛠️ Tech Stack

**Backend**

- Python 3.11
- FastAPI + WebSockets
- Uvicorn
- Numpy, Pandas
- Scikit-learn (IsolationForest for anomalies)
- pyserial (for optional Arduino/DE10 telemetry)
- Prophet/PyTorch (stretch: predictive reroute)
- Dockerized

**Frontend**

- Next.js (TypeScript, App Router)
- Tailwind CSS
- Three.js + react-three-fiber + drei
- Zustand (state management)
- Cytoscape.js (for simple 2D graph view)
- Recharts (metrics panel)
- Framer Motion (animations)
- Tone.js (audio)

**Computer Vision**

- TensorFlow.js (browser handpose model)
- OR MediaPipe Hands (Python bridge → WS events)

**Deployment**

- Docker Compose: backend + frontend
- Configurable via `.env`

---

## 📂 Repo Structure

synapsenet/
├── backend/
│ ├── src/
│ │ ├── main.py # FastAPI entry
│ │ ├── schemas.py # TelemetryFrame, ActionLog, Scorecard
│ │ ├── providers/ # Data sources
│ │ │ ├── sim.py
│ │ │ ├── arduino.py
│ │ │ └── de10lite.py
│ │ ├── anomaly/ # Detection algorithms
│ │ │ ├── rolling.py
│ │ │ └── isolation_forest.py
│ │ ├── optimize/ # Rerouting
│ │ │ ├── rules.py
│ │ │ └── qlearn.py
│ │ ├── kpi/scorecard.py # Metrics
│ │ ├── replay/ # Pre-canned demo traces
│ │ └── util/
│ └── tests/
│
├── frontend/
│ ├── src/
│ │ ├── app/dashboard/ # Main UI
│ │ ├── components/ # NervousGraph, GalaxyView, MetricsPanel, etc.
│ │ ├── lib/ # ws.ts, schema.ts
│ │ └── styles/ # Tailwind config
│
├── research/ # Notes, models, experiments
├── docker-compose.yml
├── README.md
└── .env.example

---

## ⚙️ Setup

### Backend

```bash
cd backend
uv init --name synapsenet-backend
uv add fastapi "uvicorn[standard]" pydantic
uv add numpy pandas scikit-learn
uv add pyserial python-dotenv orjson
uv run uvicorn src.main:app --reload --port 8000
```

cd frontend
npx create-next-app@latest . --typescript --eslint --tailwind --src-dir --app --import-alias "@/\*"
npm i three @react-three/fiber @react-three/drei zustand cytoscape react-cytoscapejs recharts framer-motion tone
npm run dev
