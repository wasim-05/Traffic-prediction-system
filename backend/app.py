"""AI Traffic Prediction System: Flask API."""
import os, io, csv, math, time, sqlite3, datetime as dt
from functools import wraps
import jwt
import numpy as np
from dotenv import load_dotenv
from flask import Flask, request, jsonify, g, Response, send_file
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import ml

load_dotenv()
SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
DB_PATH = os.getenv("DB_PATH", os.path.join(ml.DATA, "traffic.db"))
CENTER = (float(os.getenv("MAP_CENTER_LAT", 40.7128)), float(os.getenv("MAP_CENTER_LNG", -74.0060)))
STARTED = time.time()

app = Flask(__name__)
CORS(app, origins=os.getenv("CORS_ORIGINS", "*").split(","))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, password_hash TEXT);
CREATE TABLE IF NOT EXISTS traffic_locations(id INTEGER PRIMARY KEY, name TEXT, lat REAL, lng REAL, capacity INTEGER, speed_limit INTEGER);
CREATE TABLE IF NOT EXISTS historical_traffic_data(id INTEGER PRIMARY KEY, location_id INTEGER, ts TEXT, hour INTEGER, day_of_week INTEGER, weather TEXT, volume INTEGER, speed INTEGER);
CREATE INDEX IF NOT EXISTS idx_hist ON historical_traffic_data(location_id, ts);
CREATE TABLE IF NOT EXISTS traffic_predictions(id INTEGER PRIMARY KEY, location_id INTEGER, horizon INTEGER, predicted_volume INTEGER, level TEXT, confidence REAL, weather TEXT, created_at TEXT, user_email TEXT);
CREATE TABLE IF NOT EXISTS traffic_alerts(id INTEGER PRIMARY KEY, location_id INTEGER, message TEXT, level TEXT, created_at TEXT);
"""
DEMO = [("Central Avenue", 0, 0, 2600, 60), ("Harbor Bridge", -.02, .03, 2200, 80),
        ("Ring Road North", .04, 0, 2500, 90), ("Market Street Junction", .01, -.03, 1800, 50),
        ("Airport Expressway", -.04, -.04, 2600, 100), ("University Road", .03, .04, 1600, 50),
        ("Riverside Drive", -.03, .01, 2000, 60), ("Tech Park Link", .05, .05, 2200, 80)]


def dow(t):  # 0 = Sunday
    return (t.weekday() + 1) % 7


def fill_history(c):
    """Fill SIMULATED hourly history (up to 30 days) through the current hour."""
    now = dt.datetime.now().replace(minute=0, second=0, microsecond=0)
    rng = np.random.default_rng(7)
    for lid, cap, lim in c.execute("SELECT id,capacity,speed_limit FROM traffic_locations").fetchall():
        last = c.execute("SELECT MAX(ts) FROM historical_traffic_data WHERE location_id=?", (lid,)).fetchone()[0]
        t = dt.datetime.fromisoformat(last) + dt.timedelta(hours=1) if last else now - dt.timedelta(days=30)
        t = max(t, now - dt.timedelta(days=30))
        rows = []
        while t <= now:
            wx = str(rng.choice(list(ml.WEATHER), p=ml.WEATHER_P))
            v, s = ml.simulate(cap, lim, t.hour, dow(t), wx, rng)
            rows.append((lid, t.isoformat(timespec="seconds"), t.hour, dow(t), wx, v, s))
            t += dt.timedelta(hours=1)
        c.executemany("INSERT INTO historical_traffic_data(location_id,ts,hour,day_of_week,weather,volume,speed) VALUES(?,?,?,?,?,?,?)", rows)
    c.commit()


def init_db():
    c = sqlite3.connect(DB_PATH)
    c.executescript(SCHEMA)
    if not c.execute("SELECT 1 FROM admins").fetchone():
        c.execute("INSERT INTO admins(name,email,password_hash) VALUES(?,?,?)",
                  ("Administrator", os.getenv("ADMIN_EMAIL", "admin@example.com").lower(),
                   generate_password_hash(os.getenv("ADMIN_PASSWORD", "ChangeMe123!"))))
    if not c.execute("SELECT 1 FROM traffic_locations").fetchone():
        c.executemany("INSERT INTO traffic_locations(name,lat,lng,capacity,speed_limit) VALUES(?,?,?,?,?)",
                      [(n, CENTER[0] + a, CENTER[1] + b, cap, lim) for n, a, b, cap, lim in DEMO])
    c.commit()
    fill_history(c)
    c.close()


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_):
    d = g.pop("db", None)
    if d:
        d.close()


def q(sql, args=(), one=False):
    rows = [dict(r) for r in db().execute(sql, args).fetchall()]
    return (rows[0] if rows else None) if one else rows


def run(sql, args=()):
    cur = db().execute(sql, args)
    db().commit()
    return cur.lastrowid


def auth(role=None):
    def deco(fn):
        @wraps(fn)
        def wrap(*a, **k):
            try:
                g.user = jwt.decode(request.headers.get("Authorization", "")[7:], SECRET, algorithms=["HS256"])
            except Exception:
                return jsonify(error="Unauthorized"), 401
            if role and g.user["role"] != role:
                return jsonify(error="Admin access required"), 403
            return fn(*a, **k)
        return wrap
    return deco


def issue(u, role):
    tok = jwt.encode({"sub": str(u["id"]), "email": u["email"], "name": u["name"], "role": role,
                      "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=12)}, SECRET, algorithm="HS256")
    return jsonify(token=tok, user=dict(id=u["id"], name=u["name"], email=u["email"], role=role))


# ---------- auth ----------
@app.post("/api/auth/register")
def register():
    j = request.get_json(force=True)
    name, email, pw = j.get("name", "").strip(), j.get("email", "").strip().lower(), j.get("password", "")
    if not name or "@" not in email or len(pw) < 6:
        return jsonify(error="Name, valid email and a password of 6+ characters are required"), 400
    if q("SELECT 1 FROM users WHERE email=?", (email,)):
        return jsonify(error="Email already registered"), 409
    uid = run("INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)",
              (name, email, generate_password_hash(pw), dt.datetime.now().isoformat(timespec="seconds")))
    return issue(dict(id=uid, name=name, email=email), "user")


@app.post("/api/auth/login")
def login():
    j = request.get_json(force=True)
    table = "admins" if j.get("admin") else "users"
    u = q(f"SELECT * FROM {table} WHERE email=?", (j.get("email", "").strip().lower(),), one=True)
    if not u or not check_password_hash(u["password_hash"], j.get("password", "")):
        return jsonify(error="Invalid email or password"), 401
    return issue(u, "admin" if table == "admins" else "user")


# ---------- traffic core (data here is SIMULATED) ----------
def weather_arg():
    w = request.args.get("weather", "Clear")
    return w if w in ml.WEATHER else "Clear"


def current(loc, weather, now):
    rng = np.random.default_rng(loc["id"] * 1_000_003 + int(now.timestamp() // 300))
    return ml.simulate(loc["capacity"], loc["speed_limit"], now.hour, dow(now), weather, rng)


def snapshot(weather, horizons=(30,)):
    now = dt.datetime.now()
    locs = q("SELECT * FROM traffic_locations ORDER BY name")
    rows, cur = [], {}
    for l in locs:
        v, s = cur[l["id"]] = current(l, weather, now)
        for h in horizons:
            rows.append(dict(hour=now.hour, day_of_week=dow(now), road_capacity=l["capacity"],
                             speed_limit=l["speed_limit"], weather_factor=ml.WEATHER[weather],
                             current_volume=v, current_speed=s, horizon=h))
    res = ml.predict_many(rows) if rows else []
    i, items = 0, []
    for l in locs:
        v, s = cur[l["id"]]
        preds = []
        for h in horizons:
            pv, conf = res[i]; i += 1
            r = pv / l["capacity"]
            preds.append(dict(horizon=h, volume=round(pv), level=ml.level(r), confidence=conf,
                              speed=round(ml.speed_for(r, l["speed_limit"]))))
        items.append(dict(**l, volume=v, speed=s, density=round(v / l["capacity"] * 100),
                          level=ml.level(v / l["capacity"]), predictions=preds))
    return items


def peak_hours(where="1=1", args=()):
    return q(f"SELECT h.hour AS hour, ROUND(AVG(h.volume)) AS volume FROM historical_traffic_data h WHERE {where} GROUP BY h.hour ORDER BY volume DESC LIMIT 3", args)


@app.get("/api/health")
def health():
    return jsonify(status="ok", data_source="simulated")


@app.get("/api/overview")
@auth()
def overview():
    items = snapshot(weather_arg(), (30,))
    for i in items:
        p = i["predictions"][0]
        if p["level"] in ("High", "Severe"):
            recent = (dt.datetime.now() - dt.timedelta(minutes=30)).isoformat(timespec="seconds")
            if not q("SELECT 1 FROM traffic_alerts WHERE location_id=? AND level=? AND created_at>=?", (i["id"], p["level"], recent)):
                run("INSERT INTO traffic_alerts(location_id,message,level,created_at) VALUES(?,?,?,?)",
                    (i["id"], f"{i['name']}: {p['level']} congestion predicted within 30 min (~{p['volume']} vph)",
                     p["level"], dt.datetime.now().isoformat(timespec="seconds")))
    n = max(len(items), 1)
    avg_pred = sum(i["predictions"][0]["volume"] / i["capacity"] for i in items) / n
    alerts = q("SELECT a.*, l.name FROM traffic_alerts a JOIN traffic_locations l ON l.id=a.location_id ORDER BY a.id DESC LIMIT 10")
    return jsonify(source="simulated", items=items, alerts=alerts, kpis=dict(
        locations=len(items), density=round(sum(i["density"] for i in items) / n),
        speed=round(sum(i["speed"] for i in items) / n), predicted_level=ml.level(avg_pred)))


@app.get("/api/traffic/current")
@auth()
def traffic_current():
    return jsonify(source="simulated", items=snapshot(weather_arg(), (30,)))


@app.get("/api/predict")
@auth()
def predict():
    lid = request.args.get("location_id", type=int)
    item = next((i for i in snapshot(weather_arg(), (15, 30, 60)) if i["id"] == lid), None)
    if not item:
        return jsonify(error="Unknown location"), 404
    now = dt.datetime.now().isoformat(timespec="seconds")
    for p in item["predictions"]:
        run("INSERT INTO traffic_predictions(location_id,horizon,predicted_volume,level,confidence,weather,created_at,user_email) VALUES(?,?,?,?,?,?,?,?)",
            (lid, p["horizon"], p["volume"], p["level"], p["confidence"], weather_arg(), now, g.user["email"]))
    return jsonify(source="simulated", location=item, peak_hours=peak_hours("h.location_id=?", (lid,)))


@app.get("/api/analytics")
@auth()
def analytics():
    days = request.args.get("days", 7, type=int)
    hf, ht = request.args.get("hour_from", 0, type=int), request.args.get("hour_to", 23, type=int)
    loc = request.args.get("location_id", type=int)
    since = (dt.datetime.now() - dt.timedelta(days=days)).isoformat(timespec="seconds")
    where, args = "h.ts>=? AND h.hour BETWEEN ? AND ?", [since, hf, ht]
    if loc:
        where += " AND h.location_id=?"; args.append(loc)
    key = "h.hour" if days <= 1 else "substr(h.ts,1,10)"
    series = q(f"SELECT {key} AS label, ROUND(AVG(h.volume)) AS volume, ROUND(AVG(h.speed)) AS speed FROM historical_traffic_data h WHERE {where} GROUP BY label ORDER BY label", args)
    top = q(f"SELECT l.name, ROUND(AVG(h.volume*100.0/l.capacity)) AS density FROM historical_traffic_data h JOIN traffic_locations l ON l.id=h.location_id WHERE {where} GROUP BY l.id ORDER BY density DESC LIMIT 5", args)
    peaks = peak_hours(where, args)
    report = "Not enough historical data for this selection."
    if top and peaks and series:
        hrs = ", ".join(f"{p['hour']:02d}:00" for p in peaks)
        report = (f"Over the last {days} day(s), {top[0]['name']} was the most congested road "
                  f"(average density {int(top[0]['density'])}% of capacity). Peak traffic hours: {hrs}. "
                  f"Average speed was {int(sum(s['speed'] for s in series) / len(series))} km/h. "
                  f"Consider rerouting traffic from {top[0]['name']} during peak hours. (Based on simulated history.)")
    return jsonify(source="simulated", series=series, top=top, peak_hours=peaks, report=report)


def hav(a, b):
    p = math.pi / 180
    x = math.sin((b["lat"] - a["lat"]) * p / 2) ** 2 + math.cos(a["lat"] * p) * math.cos(b["lat"] * p) * math.sin((b["lng"] - a["lng"]) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


@app.get("/api/routes")
@auth()
def routes():
    s, d = request.args.get("src", type=int), request.args.get("dst", type=int)
    items = {i["id"]: i for i in snapshot(weather_arg(), (30,))}
    if s not in items or d not in items or s == d:
        return jsonify(error="Choose two different locations"), 400
    cands = [("Direct", [s, d])] + [(f"Via {items[k]['name']}", [s, k, d]) for k in items if k not in (s, d)]
    out = []
    for name, path in cands:
        km = mins = 0.0
        for a, b in zip(path, path[1:]):
            dist = hav(items[a], items[b]) * 1.3
            sp = max(10, (items[a]["predictions"][0]["speed"] + items[b]["predictions"][0]["speed"]) / 2)
            km += dist; mins += dist / sp * 60
        worst = max((items[i]["predictions"][0]["level"] for i in path), key=ml.LEVELS.index)
        out.append(dict(name=name, stops=[items[i]["name"] for i in path], distance_km=round(km, 1), minutes=round(mins), level=worst))
    out.sort(key=lambda r: r["minutes"])
    return jsonify(source="simulated", routes=out[:3])


@app.get("/api/reports/csv")
@auth()
def report_csv():
    days = request.args.get("days", 7, type=int)
    since = (dt.datetime.now() - dt.timedelta(days=days)).isoformat(timespec="seconds")
    rows = q("SELECT l.name AS location, h.ts, h.weather, h.volume, h.speed, ROUND(h.volume*100.0/l.capacity) AS density_pct FROM historical_traffic_data h JOIN traffic_locations l ON l.id=h.location_id WHERE h.ts>=? ORDER BY h.ts", (since,))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=["location", "ts", "weather", "volume", "speed", "density_pct"])
    w.writeheader(); w.writerows(rows)
    return Response(buf.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=traffic_report.csv"})


# ---------- locations & admin ----------
@app.get("/api/locations")
@auth()
def locations():
    return jsonify(q("SELECT * FROM traffic_locations ORDER BY name"))


def loc_payload():
    try:
        j = request.get_json(force=True)
        return (j["name"].strip(), float(j["lat"]), float(j["lng"]), int(j["capacity"]), int(j["speed_limit"]))
    except Exception:
        return None


@app.post("/api/locations")
@auth("admin")
def add_location():
    p = loc_payload()
    if not p or not p[0]:
        return jsonify(error="Invalid location data"), 400
    lid = run("INSERT INTO traffic_locations(name,lat,lng,capacity,speed_limit) VALUES(?,?,?,?,?)", p)
    fill_history(db())
    return jsonify(id=lid), 201


@app.put("/api/locations/<int:lid>")
@auth("admin")
def edit_location(lid):
    p = loc_payload()
    if not p:
        return jsonify(error="Invalid location data"), 400
    run("UPDATE traffic_locations SET name=?,lat=?,lng=?,capacity=?,speed_limit=? WHERE id=?", p + (lid,))
    return jsonify(ok=True)


@app.delete("/api/locations/<int:lid>")
@auth("admin")
def del_location(lid):
    for t in ("historical_traffic_data", "traffic_predictions", "traffic_alerts"):
        run(f"DELETE FROM {t} WHERE location_id=?", (lid,))
    run("DELETE FROM traffic_locations WHERE id=?", (lid,))
    return jsonify(ok=True)


@app.get("/api/admin/stats")
@auth("admin")
def admin_stats():
    c = lambda t: q(f"SELECT COUNT(*) AS n FROM {t}", one=True)["n"]
    b = ml.get_model()
    return jsonify(counts=dict(users=c("users"), locations=c("traffic_locations"), history=c("historical_traffic_data"),
                               predictions=c("traffic_predictions"), alerts=c("traffic_alerts")),
                   metrics=b["metrics"], importances=b["importances"], uptime_s=round(time.time() - STARTED))


@app.get("/api/admin/predictions")
@auth("admin")
def admin_predictions():
    return jsonify(q("SELECT p.*, l.name FROM traffic_predictions p JOIN traffic_locations l ON l.id=p.location_id ORDER BY p.id DESC LIMIT 100"))


@app.post("/api/admin/retrain")
@auth("admin")
def retrain():
    j = request.get_json(silent=True) or {}
    if j.get("regenerate"):
        ml.generate_dataset(n=max(500, min(int(j.get("n", 6000)), 50000)))
    return jsonify(ml.train())


@app.get("/api/admin/dataset.csv")
@auth("admin")
def dataset():
    if not os.path.exists(ml.CSV):
        ml.generate_dataset()
    return send_file(ml.CSV, mimetype="text/csv", as_attachment=True, download_name="traffic_dataset.csv")


init_db()
ml.get_model()

if __name__ == "__main__":
    app.run(port=int(os.getenv("PORT", 5000)), debug=os.getenv("FLASK_DEBUG") == "1")
