# 🛰️ SPG4 Satellite Tracker

A full-stack satellite tracking app built with **FastAPI (Python)**, **React + Vite (TypeScript)**, **TailwindCSS**, and **CesiumJS**.  
It fetches orbital elements (TLE), visualises orbits in 3D, shows next visible passes, and displays key orbital parameters.

---

## ✨ Features
- 🌍 3D globe viewer with live satellite orbits (CesiumJS)
- 📡 Next visible pass predictions at your location
- 📊 Orbital elements dashboard (inclination, RAAN, eccentricity, etc.)
- ⚡ FastAPI backend with SGP4 for orbit propagation
- 🎨 TailwindCSS-styled React frontend
- 🐳 Fully dockerized — run anywhere with 1 command

---

## 🚀 Quick Start (with Docker)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / Mac)  
- [Docker Engine + Compose](https://docs.docker.com/engine/install/) (Linux)

### Run the project
Clone this repo and start both backend + frontend with:

```bash
docker compose up --build
```

---

## 🌍 Cesium Setup

The globe visualisation uses Cesium Ion for terrain and imagery.  
You’ll need your own (free) Cesium Ion access token.

### 🪄 Steps:
1. Sign up at **[Cesium Ion](https://ion.cesium.com/signup)**.  
2. Go to your [Access Tokens page](https://ion.cesium.com/tokens).  
3. Click **“Create New Token”** → copy your token.  
4. Paste it into a `.env.local` file in the `frontend/` directory with the following:

```bash
VITE_API_BASE=http://localhost:8000
VITE_CESIUM_ION_TOKEN=YOUR_CESIUM_TOKEN_HERE
```

5. Restart your frontend (if running):
```bash
npm run dev
```

This ensures your Cesium globe renders correctly when running locally.
