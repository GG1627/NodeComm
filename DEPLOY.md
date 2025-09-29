## Deploying SynapseNet

### Images

- Backend: build from `backend/Dockerfile`
- Frontend: build from `frontend/Dockerfile`

### Environment

- Backend CORS: set `FRONTEND_ORIGINS` to comma-separated origins (e.g. `https://app.example.com`)
- Frontend WebSocket: set `NEXT_PUBLIC_WS_URL` to your backend WS endpoint (e.g. `wss://api.example.com/ws`)

### Local compose

```bash
docker compose up --build
```

### Render.com

1. Fastest path with Render Blueprint (recommended)

   - Push this repo to GitHub
   - In Render, click New + Blueprint and select this repo
   - Render will read `render.yaml` and create two services
   - Set env vars:
     - For backend: `FRONTEND_ORIGINS=https://<frontend-domain>`
     - For frontend: `NEXT_PUBLIC_WS_URL=wss://<backend-domain>/ws`
   - Click Apply. Deploys start automatically.

2. Manual setup

   Create a Web Service for backend

   - Build command: `docker build -t synapsenet-backend -f backend/Dockerfile .`
   - Start command: `python -m uvicorn src.main:app --host 0.0.0.0 --port 8000`
   - Expose port 8000
   - Env: `FRONTEND_ORIGINS=https://your-frontend-domain`

3. Create a Web Service for frontend
   - Build command: `docker build -t synapsenet-frontend -f frontend/Dockerfile .`
   - Start command: `npm start`
   - Expose port 3000
   - Env: `NEXT_PUBLIC_WS_URL=wss://<backend-host>/ws`

### Railway.app

- Create two services from the Dockerfiles. Set the same env vars as above.

### Fly.io

- Create two apps, deploy each Dockerfile. Configure `NEXT_PUBLIC_WS_URL` to the backend app’s `wss://` URL and `FRONTEND_ORIGINS` to the frontend URL.

### Healthchecks

- Backend HTTP: `GET /` → 200 with JSON
- Backend WS: connect to `/ws` and send `{ "type": "ping" }` expecting `{ "type": "pong" }`
- Frontend HTTP: `GET /` → 200

### Notes

- If using TLS/HTTPS, prefer `wss://` for the WebSocket URL.
- For large `backend/models`, mount a volume or download on startup rather than baking into the image.
