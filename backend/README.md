# ROADLAB API (Raspberry Pi 5)

Self-hosted Node.js + Fastify + SQLite backend for user profiles and **light ride summaries**.
Frontend (Vercel) talks to this API over Cloudflare Tunnel.

**Pi storage rule:** the API keeps only workout summary rows (date, duration, distance, avg/max power & HR, speed, route label, optional elevation gain). Full GPS tracks, Mapillary, and FIT/GPX files stay on the client — the server does **not** store track points or activity files.

## Stack

- Node.js 20+
- Fastify
- better-sqlite3
- bcryptjs + JWT (Bearer header and optional httpOnly cookie)

Default listen: `http://127.0.0.1:8788`

## 1) Install Node (Pi 5 / Debian)

```bash
# Option A — NodeSource 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential python3

# Option B — nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen shell, then:
nvm install 22
```

`better-sqlite3` needs a compiler (`build-essential`) on first `npm install`.

## 2) Install & start

```bash
cd ~/newtrainer/backend   # or your clone path
cp .env.example .env
nano .env                 # set JWT_SECRET + COOKIE_SECURE=true for HTTPS tunnel
npm install
npm start
```

Smoke check:

```bash
curl -s http://127.0.0.1:8788/api/health
# {"ok":true,"service":"roadlab-api",...}
```

Data files (gitignored):

- `backend/data/roadlab.sqlite` — profiles, rooms, ride **summaries** only

> Note: `backend/data/rides/` is **not used**. Older installs that stored `.fit` / `.gpx` there are cleaned on API startup (paths nulled, files removed). Download FIT/GPX from the browser after each ride instead.

## 3) systemd unit (optional)

`/etc/systemd/system/roadlab-api.service`:

```ini
[Unit]
Description=ROADLAB API
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/newtrainer/backend
EnvironmentFile=/home/pi/newtrainer/backend/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now roadlab-api
sudo systemctl status roadlab-api
```

Adjust `User`, paths, and Node binary (`which node`) for your Pi.

## 4) Cloudflare Tunnel

You already tunnel other hostnames (`sre`, `tools`). Add one more public hostname:

| Public hostname | Service |
|-----------------|---------|
| `newtrainer-api.trihonor.com` | `http://localhost:8788` |

Zero Trust → Networks → Tunnels → your tunnel → Public Hostname → Add:

- **Subdomain:** `newtrainer-api`
- **Domain:** `trihonor.com`
- **Type:** HTTP
- **URL:** `localhost:8788`

DNS will be managed by Cloudflare. After save:

```bash
curl -s https://newtrainer-api.trihonor.com/api/health
```

Production `.env` on Pi:

```env
PORT=8788
HOST=127.0.0.1
JWT_SECRET=<long-random-secret>
COOKIE_SECURE=true
```

API stays bound to localhost; only Cloudflare Tunnel exposes it.

## 5) Vercel env

In the ROADLAB Vercel project:

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://newtrainer-api.trihonor.com` |

Redeploy the frontend after setting the variable.

Local Vite (optional):

```env
# frontend .env
VITE_API_URL=http://127.0.0.1:8788
```

If `VITE_API_URL` is unset, the app stays local-only (no cloud profile / save summary).

## Auth notes

- Register / login return a JWT; the SPA stores it and sends `Authorization: Bearer …`
- Cookie is also set for same-site / tunnel setups (`COOKIE_SECURE=true` + HTTPS)
- Login is lightly rate-limited

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/health` | no |
| POST | `/api/auth/register` | no |
| POST | `/api/auth/login` | no |
| POST | `/api/auth/logout` | no |
| GET | `/api/me` | yes |
| PATCH | `/api/me/profile` | yes |
| GET | `/api/rides` | yes (summaries) |
| POST | `/api/rides` | yes (JSON summary fields only) |
| GET | `/api/rides/:id` | yes |
| GET | `/api/rides/:id/download/:kind` | yes → **410** `FILES_NOT_STORED` (no server files) |
| POST | `/api/rooms` | yes (body: `{ route }` — host creates lobby) |
| POST | `/api/rooms/join` | yes (body: `{ code }`) |
| GET | `/api/rooms/:id` | yes (members only) |
| POST | `/api/rooms/:id/start` | yes (host) |
| POST | `/api/rooms/:id/leave` | yes |
| POST | `/api/rooms/:id/end` | yes (host) |
| GET | `/ws/rooms/:id?token=…` | JWT query or cookie |

## Group rides

Shared A→B rooms for up to **20** riders. Host creates a room from a built route; others join by code; host starts; clients send light telemetry over WebSocket (~1–2 Hz) and receive peer positions for map markers. No Mapillary/street imagery in group mode (frontend).

WebSocket (same host as REST — works behind Cloudflare Tunnel HTTP→`localhost:8788`):

- Client → server: `{ type:'telemetry', lat, lng, distance_m, speed_kmh, power, hr, cadence }`
- Server → clients: `{ type:'peers', riders:[…] }`, plus `member_join`, `member_leave`, `start`, `end`

Join is rejected with `409` / `ROOM_FULL` when the room already has 20 members.
