# 🚦 AI Traffic Prediction System

Full-stack traffic monitoring and prediction dashboard.

- **Frontend:** React 18 + Vite + Tailwind CSS + Recharts + Leaflet (OpenStreetMap)
- **Backend:** Python Flask REST API with JWT authentication
- **ML:** scikit-learn Random Forest regression (15/30/60-minute horizons) with confidence scores
- **Database:** SQLite (single file, zero setup)

> ⚠️ **Data honesty:** there is no live traffic feed in this project. All traffic figures, history and
> "current" conditions are **simulated** by `backend/ml.py`, and the UI labels them as such on every page.
> To use real data, replace `current()` and the history seed in `backend/app.py` with a real feed or sensor import.

## Project structure

```
ai-traffic-prediction/
├── backend/
│   ├── app.py              # Flask API (auth, traffic, predictions, analytics, routes, reports, admin)
│   ├── ml.py               # Data generation, training, evaluation, prediction
│   ├── requirements.txt
│   ├── .env.example
│   └── data/traffic_dataset.csv   # Sample training dataset (6,000 rows)
└── frontend/
    ├── package.json, vite.config.js, tailwind.config.js, postcss.config.js, index.html
    └── src/ (main.jsx, App.jsx, api.js, pages.jsx, index.css)
```

## Setup

**Requirements:** Python 3.10+ and Node.js 18+.

### 1. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then edit JWT_SECRET and ADMIN_PASSWORD
python app.py                    # http://localhost:5000
```
On first start the API creates the SQLite database, seeds 8 demo locations and 30 days of simulated
history, and trains the model (a few seconds). To train manually: `python ml.py`.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev                      # http://localhost:5173
```
Vite proxies `/api` to `localhost:5000`. For production set `VITE_API_URL` (see `frontend/.env.example`)
and run `npm run build`.

### Login
- **Admin:** the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `backend/.env` (defaults `admin@example.com` / `ChangeMe123!`; tick *Sign in as administrator*). **Change these before deploying.**
- **User:** register from the login page.

## Environment variables (`backend/.env`)

| Variable | Purpose | Default |
|---|---|---|
| `JWT_SECRET` | Token signing key (**set a long random value**) | dev placeholder |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Seeded admin account | see above |
| `CORS_ORIGINS` | Comma-separated allowed origins | `*` |
| `MAP_CENTER_LAT`, `MAP_CENTER_LNG` | Centre for the demo locations | New York |
| `PORT`, `DB_PATH` | Server port, SQLite path | `5000`, `backend/data/traffic.db` |

## API endpoints (all except auth/health require `Authorization: Bearer <token>`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | Sign up / sign in (`admin: true` for admins) |
| GET | `/api/overview` | KPIs, per-location status, alerts |
| GET | `/api/traffic/current` | Current (simulated) conditions |
| GET | `/api/predict?location_id=` | 15/30/60-min predictions + confidence |
| GET | `/api/analytics?days=&location_id=&hour_from=&hour_to=` | Charts data, peak hours, AI report |
| GET | `/api/routes?src=&dst=` | Alternative routes with travel times |
| GET | `/api/reports/csv?days=` | CSV download |
| GET/POST/PUT/DELETE | `/api/locations` | Locations (writes: admin only) |
| GET | `/api/admin/stats`, `/api/admin/predictions` | System metrics, prediction history |
| POST | `/api/admin/retrain` | Retrain (optionally `{"regenerate": true, "n": 6000}`) |
| GET | `/api/admin/dataset.csv` | Download training dataset |

`weather=Clear|Fog|Rain|Snow|Storm` can be passed to the traffic and prediction endpoints.

## Database tables
`users`, `admins`, `traffic_locations`, `historical_traffic_data`, `traffic_predictions`, `traffic_alerts`.

## Not included (planned extensions)
LSTM model, Gemini API reports (the "AI report" is currently template-based), Google Maps,
Firebase/MongoDB (SQLite is used instead), real-time push alerts, and native PDF export (use *Print / Save PDF*).

## Uploading to GitHub
```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/ai-traffic-prediction.git
git push -u origin main
```
`.gitignore` already excludes `.env`, `node_modules`, the SQLite DB and the trained model.
