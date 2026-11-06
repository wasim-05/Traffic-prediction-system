"""ML module: synthetic data generation, training, evaluation and prediction."""
import os
import datetime as dt
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

DIR = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(DIR, "data")
os.makedirs(DATA, exist_ok=True)
CSV = os.path.join(DATA, "traffic_dataset.csv")
MODEL = os.path.join(DATA, "traffic_rf.joblib")

WEATHER = {"Clear": 1.0, "Fog": 1.15, "Rain": 1.28, "Snow": 1.45, "Storm": 1.62}
WEATHER_P = [0.60, 0.10, 0.20, 0.05, 0.05]  # same order as WEATHER keys
FEATURES = ["hour", "day_of_week", "road_capacity", "speed_limit",
            "weather_factor", "current_volume", "current_speed", "horizon"]
LEVELS = ["Low", "Medium", "High", "Severe"]


def diurnal(hour, day):
    """Rush-hour demand curve (0=Sunday ... 6=Saturday), damped on weekends."""
    h, d = np.asarray(hour), np.asarray(day)
    x = np.where((h >= 7) & (h <= 9), .90,
        np.where((h >= 16) & (h <= 19), .95,
        np.where((h >= 10) & (h <= 15), .65, .35)))
    return np.where((d == 0) | (d == 6), x * .72, x)


def speed_for(ratio, limit):
    r = np.asarray(ratio, dtype=float)
    f = np.where(r > .9, .25, np.where(r > .7, .55, np.where(r > .45, .75, .94)))
    out = np.maximum(15, limit * f)
    return float(out) if out.ndim == 0 else out


def level(ratio):
    return "Severe" if ratio > .9 else "High" if ratio > .7 else "Medium" if ratio > .45 else "Low"


def simulate(cap, limit, hour, day, wx, rng):
    """One simulated (volume, speed) observation. SIMULATED, not a live feed."""
    base = cap * float(diurnal(hour, day)) * (0.9 + rng.uniform(-.1, .1))
    vol = int(np.clip(base * WEATHER[wx], 80, cap * 1.2))
    spd = int(max(15, speed_for(vol / cap, limit) + rng.normal(0, 3)))
    return vol, spd


def generate_dataset(n=6000, seed=42, path=CSV):
    rng = np.random.default_rng(seed)
    hour = rng.integers(0, 24, n)
    day = rng.integers(0, 7, n)
    cap = rng.choice([1600, 1800, 2000, 2200, 2500, 2600], n)
    lim = rng.choice([50, 60, 80, 90, 100], n)
    wx = rng.choice(list(WEATHER), n, p=WEATHER_P)
    wf = np.array([WEATHER[w] for w in wx])
    hz = rng.choice([15, 30, 60], n)
    base = cap * diurnal(hour, day) * (0.9 + rng.uniform(-.1, .1, n))
    cur = np.clip(base * wf, 80, cap * 1.2)
    mins = hour * 60 + hz
    fut = cap * diurnal(mins // 60 % 24, (day + mins // 1440) % 7) * (0.9 + rng.uniform(-.1, .1, n)) * wf
    a = hz / 60 * 0.7
    target = np.clip((1 - a) * cur + a * fut + rng.normal(0, 30, n), 100, cap * 1.2).astype(int)
    spd = np.maximum(15, speed_for(cur / cap, lim) + rng.normal(0, 3, n)).astype(int)
    df = pd.DataFrame(dict(hour=hour, day_of_week=day, road_capacity=cap, speed_limit=lim,
                           weather=wx, weather_factor=wf, current_volume=cur.astype(int),
                           current_speed=spd, horizon=hz, future_volume=target))
    df.to_csv(path, index=False)
    return df


_cache = None


def train(path=CSV):
    global _cache
    df = pd.read_csv(path) if os.path.exists(path) else generate_dataset(path=path)
    df = df.dropna(subset=FEATURES + ["future_volume"])
    X, y = df[FEATURES], df["future_volume"]
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42)
    m = RandomForestRegressor(n_estimators=100, max_depth=14, min_samples_split=4,
                              random_state=42, n_jobs=-1).fit(Xtr, ytr)
    p = m.predict(Xte)
    mae = mean_absolute_error(yte, p)
    metrics = dict(mae=round(float(mae), 2),
                   rmse=round(float(np.sqrt(mean_squared_error(yte, p))), 2),
                   r2=round(float(r2_score(yte, p)), 4),
                   accuracy=round(float((1 - mae / yte.mean()) * 100), 2),
                   baseline_mae=round(float(mean_absolute_error(yte, Xte["current_volume"])), 2),
                   n_train=len(Xtr), n_test=len(Xte),
                   trained_at=dt.datetime.now().isoformat(timespec="seconds"))
    imp = {f: round(float(i), 4) for f, i in zip(FEATURES, m.feature_importances_)}
    joblib.dump(dict(model=m, features=FEATURES, metrics=metrics, importances=imp), MODEL)
    _cache = None
    return metrics


def get_model():
    global _cache
    if _cache is None:
        if not os.path.exists(MODEL):
            train()
        _cache = joblib.load(MODEL)
    return _cache


def predict_many(rows):
    """rows: list of dicts with FEATURES. Returns [(volume, confidence%)]."""
    b = get_model()
    X = pd.DataFrame(rows)[b["features"]].values.astype(float)
    P = np.stack([t.predict(X) for t in b["model"].estimators_])
    mean, std = P.mean(0), P.std(0)
    conf = np.clip(100 * (1 - 2 * std / np.maximum(mean, 1)), 40, 99)
    return list(zip(mean.tolist(), conf.round(1).tolist()))


if __name__ == "__main__":
    generate_dataset()
    print(train())
