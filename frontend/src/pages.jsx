import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { MapPin, Gauge, Car, TrendingUp, Bell, Download, Printer, RefreshCw } from 'lucide-react';
import { api, useFetch, settings, useAuth } from './api';

export const COLORS = { Low: '#22c55e', Medium: '#eab308', High: '#f97316', Severe: '#ef4444' };
const WEATHERS = ['Clear', 'Fog', 'Rain', 'Snow', 'Storm'];

/* ---------- UI primitives ---------- */
const Card = ({ title, children, className = '' }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 p-5 transition hover:shadow-md ${className}`}>
    {title && <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>}{children}
  </div>
);
const Badge = ({ level }) => <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white" style={{ background: COLORS[level] }}>{level}</span>;
const Loader = () => <div className="animate-pulse text-slate-400 py-8 text-center">Loading…</div>;
const Err = ({ m }) => m ? <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{m}</div> : null;
const Sim = () => <span className="text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-1">⚠ Simulated data, not a live traffic feed</span>;
const Head = ({ title, sub, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
    <div><h1 className="text-2xl font-bold text-blue-950">{title}</h1><p className="text-slate-500 text-sm">{sub}</p></div>
    <div className="flex items-center gap-2 flex-wrap">{children}<Sim /></div>
  </div>
);
const Kpi = ({ icon: Icon, label, value, sub, color = 'bg-blue-600' }) => (
  <Card><div className="flex items-center gap-4">
    <div className={`${color} text-white p-3 rounded-xl`}><Icon size={22} /></div>
    <div><div className="text-sm text-slate-500">{label}</div><div className="text-2xl font-bold">{value}</div>{sub && <div className="text-xs text-slate-400">{sub}</div>}</div>
  </div></Card>
);
const Select = ({ label, value, onChange, children }) => (
  <label className="text-sm text-slate-600 block">{label}
    <select value={value} onChange={e => onChange(e.target.value)} className="mt-1 block w-full border border-slate-200 rounded-lg px-3 py-2 bg-white">{children}</select>
  </label>
);
const Input = ({ label, ...p }) => (
  <label className="text-sm text-slate-600 block">{label}
    <input {...p} className="mt-1 block w-full border border-slate-200 rounded-lg px-3 py-2 bg-white" />
  </label>
);
const Btn = ({ children, className = '', ...p }) => (
  <button {...p} className={`bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition inline-flex items-center gap-2 ${className}`}>{children}</button>
);
const download = async (path, name) => {
  const b = await api(path); const u = URL.createObjectURL(b);
  const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
};

function MapView({ items, onSelect, height = 380 }) {
  const c = items.length ? [items.reduce((a, i) => a + i.lat, 0) / items.length, items.reduce((a, i) => a + i.lng, 0) / items.length] : [0, 0];
  return (
    <MapContainer center={c} zoom={11} style={{ height }} className="rounded-xl z-0">
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {items.map(i => (
        <CircleMarker key={i.id} center={[i.lat, i.lng]} radius={13}
          pathOptions={{ color: '#fff', weight: 2, fillColor: COLORS[i.level], fillOpacity: 0.9 }}
          eventHandlers={{ click: () => onSelect && onSelect(i) }}>
          <Popup><b>{i.name}</b><br />{i.level} · {i.volume} vph · {i.speed} km/h</Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

/* ---------- Login / Register ---------- */
export function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '', admin: false });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: f }); login(r.token, r.user); nav('/'); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 to-blue-700 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-2xl p-8 w-full max-w-sm space-y-4 shadow-xl fade-in">
        <div className="text-center"><div className="text-3xl">🚦</div><h1 className="text-xl font-bold text-blue-950">AI Traffic Prediction</h1></div>
        <div className="flex bg-slate-100 rounded-lg p-1 text-sm">
          {['login', 'register'].map(m => <button type="button" key={m} onClick={() => setMode(m)} className={`flex-1 py-1.5 rounded-md capitalize ${mode === m ? 'bg-white shadow font-medium' : 'text-slate-500'}`}>{m}</button>)}
        </div>
        {mode === 'register' && <Input label="Name" value={f.name} onChange={set('name')} required />}
        <Input label="Email" type="email" value={f.email} onChange={set('email')} required />
        <Input label="Password" type="password" value={f.password} onChange={set('password')} required minLength={6} />
        {mode === 'login' && <label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={f.admin} onChange={set('admin')} /> Sign in as administrator</label>}
        <Err m={err} />
        <Btn disabled={busy} className="w-full justify-center">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Btn>
      </form>
    </div>
  );
}

/* ---------- Dashboard ---------- */
export function Dashboard() {
  const w = settings();
  const { data, loading, error } = useFetch(`/overview?weather=${w.weather}`, w.refresh);
  if (!data) return loading ? <Loader /> : <Err m={error} />;
  const { kpis: k, items, alerts } = data;
  return (
    <div className="space-y-5">
      <Head title="Dashboard" sub={`City-wide traffic overview · weather scenario: ${w.weather}`} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon={MapPin} label="Monitored locations" value={k.locations} />
        <Kpi icon={Car} label="Avg traffic density" value={`${k.density}%`} sub="of road capacity" color="bg-sky-600" />
        <Kpi icon={Gauge} label="Avg vehicle speed" value={`${k.speed} km/h`} color="bg-indigo-600" />
        <Kpi icon={TrendingUp} label="Predicted congestion (30 min)" value={k.predicted_level} color="bg-orange-500" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Traffic density by location" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={items}><CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis unit="%" /><Tooltip />
              <Bar dataKey="density" radius={[6, 6, 0, 0]}>{items.map(i => <Cell key={i.id} fill={COLORS[i.level]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Traffic alerts">
          {alerts.length === 0 && <p className="text-sm text-slate-400">No active alerts.</p>}
          <ul className="space-y-2 max-h-72 overflow-y-auto">{alerts.map(a => (
            <li key={a.id} className="text-sm flex gap-2"><Bell size={16} className="mt-0.5 shrink-0" style={{ color: COLORS[a.level] }} /><span>{a.message}<br /><span className="text-xs text-slate-400">{a.created_at.replace('T', ' ')}</span></span></li>
          ))}</ul>
        </Card>
      </div>
      <Card title="Traffic map"><MapView items={items} height={340} /></Card>
    </div>
  );
}

/* ---------- Live monitoring ---------- */
export function Live() {
  const w = settings();
  const { data, loading, error } = useFetch(`/traffic/current?weather=${w.weather}`, w.refresh);
  const [s, setS] = useState(''); const [lv, setLv] = useState('All');
  if (!data) return loading ? <Loader /> : <Err m={error} />;
  const rows = data.items.filter(i => i.name.toLowerCase().includes(s.toLowerCase()) && (lv === 'All' || i.level === lv));
  return (
    <div className="space-y-4">
      <Head title="Live Traffic Monitoring" sub={`Auto-refreshes every ${w.refresh}s`} />
      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <Input label="Search roads and junctions" value={s} onChange={e => setS(e.target.value)} placeholder="e.g. Central" />
          <Select label="Density level" value={lv} onChange={setLv}>{['All', 'Low', 'Medium', 'High', 'Severe'].map(l => <option key={l}>{l}</option>)}</Select>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Location</th><th>Vehicles/h</th><th>Avg speed</th><th>Density</th><th>Level</th></tr></thead>
          <tbody>{rows.map(i => (
            <tr key={i.id} className="border-b last:border-0 hover:bg-slate-50"><td className="py-2.5 font-medium">{i.name}</td><td>{i.volume}</td><td>{i.speed} km/h</td><td>{i.density}%</td><td><Badge level={i.level} /></td></tr>
          ))}</tbody>
        </table>{rows.length === 0 && <p className="text-center text-slate-400 py-6">No matching locations.</p>}</div>
      </Card>
    </div>
  );
}

/* ---------- Prediction ---------- */
export function Prediction() {
  const w = settings();
  const locs = useFetch('/locations');
  const [loc, setLoc] = useState('');
  const id = loc || locs.data?.[0]?.id;
  const { data, loading, error } = useFetch(id ? `/predict?location_id=${id}&weather=${w.weather}` : null);
  return (
    <div className="space-y-4">
      <Head title="Traffic Prediction" sub="Random Forest forecast for the next 15, 30 and 60 minutes" />
      <Card><div className="max-w-sm"><Select label="Location" value={id || ''} onChange={setLoc}>{(locs.data || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></div></Card>
      <Err m={error || locs.error} />
      {loading && <Loader />}
      {data && (() => {
        const L = data.location; const chart = [{ t: 'Now', volume: L.volume }, ...L.predictions.map(p => ({ t: `+${p.horizon} min`, volume: p.volume }))];
        return (<>
          <div className="grid md:grid-cols-3 gap-4">{L.predictions.map(p => (
            <Card key={p.horizon}><div className="text-sm text-slate-500">In {p.horizon} minutes</div>
              <div className="text-3xl font-bold my-1">{p.volume} <span className="text-sm font-normal text-slate-400">vph</span></div>
              <Badge level={p.level} /><div className="text-sm mt-3 text-slate-600">Speed ≈ {p.speed} km/h</div>
              <div className="mt-2"><div className="text-xs text-slate-500">Confidence {p.confidence}%</div><div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-blue-600 rounded-full" style={{ width: `${p.confidence}%` }} /></div></div>
            </Card>))}
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Volume forecast" className="lg:col-span-2"><ResponsiveContainer width="100%" height={250}><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="t" /><YAxis /><Tooltip /><Line dataKey="volume" stroke="#2563eb" strokeWidth={3} dot={{ r: 5 }} /></LineChart></ResponsiveContainer></Card>
            <Card title="Historical peak hours">{data.peak_hours.map(p => <div key={p.hour} className="flex justify-between py-1.5 border-b last:border-0 text-sm"><span>{String(p.hour).padStart(2, '0')}:00</span><b>{p.volume} vph</b></div>)}</Card>
          </div>
        </>);
      })()}
    </div>
  );
}

/* ---------- Map ---------- */
export function TrafficMap() {
  const w = settings();
  const { data, loading, error } = useFetch(`/traffic/current?weather=${w.weather}`, w.refresh);
  const [sel, setSel] = useState(null);
  const pred = useFetch(sel ? `/predict?location_id=${sel.id}&weather=${w.weather}` : null);
  if (!data) return loading ? <Loader /> : <Err m={error} />;
  return (
    <div className="space-y-4">
      <Head title="Interactive Traffic Map" sub="Click a marker to see its prediction" />
      <div className="flex gap-4 text-sm flex-wrap">{Object.entries(COLORS).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-full" style={{ background: c }} />{k}</span>)}</div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 !p-2"><MapView items={data.items} onSelect={setSel} height={520} /></Card>
        <Card title={sel ? sel.name : 'Select a location'}>
          {!sel && <p className="text-sm text-slate-400">Choose a hotspot on the map.</p>}
          {sel && <div className="text-sm space-y-2"><div>Now: <Badge level={sel.level} /> {sel.volume} vph · {sel.speed} km/h</div>
            {pred.loading && <Loader />}
            {pred.data?.location.predictions.map(p => <div key={p.horizon} className="flex justify-between items-center border-t pt-2"><span>+{p.horizon} min</span><span>{p.volume} vph</span><Badge level={p.level} /></div>)}</div>}
        </Card>
      </div>
    </div>
  );
}

/* ---------- Analytics ---------- */
export function Analytics() {
  const locs = useFetch('/locations');
  const [days, setDays] = useState('7'); const [loc, setLoc] = useState(''); const [hf, setHf] = useState('0'); const [ht, setHt] = useState('23');
  const { data, loading, error } = useFetch(`/analytics?days=${days}&hour_from=${hf}&hour_to=${ht}${loc ? `&location_id=${loc}` : ''}`);
  const hrs = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="space-y-4">
      <Head title="Traffic Analytics" sub="Historical patterns, congested roads and rush hours" />
      <Card><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select label="Period" value={days} onChange={setDays}><option value="1">Daily (24 h)</option><option value="7">Weekly (7 days)</option><option value="30">Monthly (30 days)</option></Select>
        <Select label="Location" value={loc} onChange={setLoc}><option value="">All locations</option>{(locs.data || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
        <Select label="From hour" value={hf} onChange={setHf}>{hrs.map(h => <option key={h} value={h}>{h}:00</option>)}</Select>
        <Select label="To hour" value={ht} onChange={setHt}>{hrs.map(h => <option key={h} value={h}>{h}:59</option>)}</Select>
      </div></Card>
      <Err m={error} />{loading && <Loader />}
      {data && <>
        <Card title="AI traffic report"><p className="text-sm leading-relaxed">{data.report}</p></Card>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Average volume"><ResponsiveContainer width="100%" height={260}><LineChart data={data.series}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Line dataKey="volume" stroke="#2563eb" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></Card>
          <Card title="Average speed (km/h)"><ResponsiveContainer width="100%" height={260}><LineChart data={data.series}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis /><Tooltip /><Line dataKey="speed" stroke="#f97316" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></Card>
          <Card title="Most congested roads"><ResponsiveContainer width="100%" height={240}><BarChart data={data.top} layout="vertical" margin={{ left: 40 }}><XAxis type="number" unit="%" /><YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="density" fill="#1d4ed8" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></Card>
          <Card title="Rush-hour peaks">{data.peak_hours.map((p, i) => <div key={p.hour} className="flex justify-between py-2 border-b last:border-0"><span>#{i + 1} · {String(p.hour).padStart(2, '0')}:00</span><b>{p.volume} vph</b></div>)}</Card>
        </div>
      </>}
    </div>
  );
}

/* ---------- Alternative routes ---------- */
export function RoutesPage() {
  const w = settings();
  const locs = useFetch('/locations');
  const [src, setSrc] = useState(''); const [dst, setDst] = useState(''); const [go, setGo] = useState(null);
  const L = locs.data || [];
  const s = src || L[0]?.id, d = dst || L[1]?.id;
  const res = useFetch(go ? `/routes?src=${go.s}&dst=${go.d}&weather=${w.weather}` : null);
  return (
    <div className="space-y-4">
      <Head title="Alternative Route Suggestions" sub="Routes ranked by predicted travel time (30-minute forecast)" />
      <Card><div className="grid sm:grid-cols-3 gap-3 items-end">
        <Select label="Source" value={s || ''} onChange={setSrc}>{L.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
        <Select label="Destination" value={d || ''} onChange={setDst}>{L.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
        <Btn onClick={() => setGo({ s, d })} className="justify-center">Find routes</Btn>
      </div></Card>
      <Err m={res.error} />{res.loading && <Loader />}
      {res.data?.routes.map((r, i) => (
        <Card key={r.name} className={i === 0 ? 'ring-2 ring-blue-500' : ''}>
          <div className="flex flex-wrap justify-between gap-2"><div><b>{r.name}</b> {i === 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-2">Recommended</span>}
            <div className="text-sm text-slate-500">{r.stops.join(' → ')}</div></div>
            <div className="text-right"><div className="text-2xl font-bold">{r.minutes} min</div><div className="text-sm text-slate-500">{r.distance_km} km</div></div></div>
          <div className="mt-2 text-sm">Worst congestion on route: <Badge level={r.level} /></div>
        </Card>))}
    </div>
  );
}

/* ---------- Reports ---------- */
export function Reports() {
  const [days, setDays] = useState('7'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const { data, loading } = useFetch(`/analytics?days=${days}`);
  const dl = async () => { setBusy(true); setErr(''); try { await download(`/reports/csv?days=${days}`, `traffic_report_${days}d.csv`); } catch (e) { setErr(e.message); } setBusy(false); };
  return (
    <div className="space-y-4">
      <Head title="Traffic Reports" sub="Download CSV or save as PDF via your browser's print dialog" />
      <Card><div className="flex flex-wrap items-end gap-3">
        <div className="w-48"><Select label="Period" value={days} onChange={setDays}><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></Select></div>
        <Btn onClick={dl} disabled={busy}><Download size={16} /> Download CSV</Btn>
        <Btn onClick={() => window.print()} className="!bg-slate-700 hover:!bg-slate-800"><Printer size={16} /> Print / Save PDF</Btn>
      </div><Err m={err} /></Card>
      <Card title="AI-generated summary">{loading ? <Loader /> : <p className="text-sm leading-relaxed">{data?.report}</p>}
        {data && <ul className="mt-3 text-sm list-disc pl-5">{data.top.map(t => <li key={t.name}>{t.name}: {t.density}% avg density</li>)}</ul>}</Card>
    </div>
  );
}

/* ---------- Admin ---------- */
const EMPTY = { name: '', lat: '', lng: '', capacity: 2000, speed_limit: 60 };
export function Admin() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0); const [form, setForm] = useState(EMPTY); const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [n, setN] = useState(6000);
  const stats = useFetch(user.role === 'admin' ? '/admin/stats' : null, 0, tick);
  const locs = useFetch(user.role === 'admin' ? '/locations' : null, 0, tick);
  const hist = useFetch(user.role === 'admin' ? '/admin/predictions' : null, 0, tick);
  if (user.role !== 'admin') return <Err m="Administrator access required. Sign in with an admin account." />;
  const act = async fn => { setBusy(true); setMsg(''); try { await fn(); setTick(t => t + 1); } catch (e) { setMsg(e.message); } setBusy(false); };
  const save = e => { e.preventDefault(); act(async () => { await api(editId ? `/locations/${editId}` : '/locations', { method: editId ? 'PUT' : 'POST', body: form }); setForm(EMPTY); setEditId(null); }); };
  const M = stats.data?.metrics;
  return (
    <div className="space-y-4">
      <Head title="Admin Dashboard" sub="Locations, datasets, model and prediction history" />
      <Err m={msg || stats.error} />
      {stats.data && <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">{Object.entries(stats.data.counts).map(([k, v]) => <Card key={k}><div className="text-xs uppercase text-slate-500">{k}</div><div className="text-2xl font-bold">{v.toLocaleString()}</div></Card>)}</div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Model performance (system monitoring)">
          {M ? <div className="grid grid-cols-2 gap-2 text-sm">
            <div>MAE: <b>{M.mae} vph</b></div><div>RMSE: <b>{M.rmse}</b></div><div>R²: <b>{M.r2}</b></div><div>Accuracy: <b>{M.accuracy}%</b></div>
            <div>Baseline MAE: <b>{M.baseline_mae}</b></div><div>Uptime: <b>{Math.round(stats.data.uptime_s / 60)} min</b></div>
            <div className="col-span-2 text-xs text-slate-400">Trained {M.trained_at.replace('T', ' ')} · {M.n_train} train / {M.n_test} test</div>
          </div> : <Loader />}
        </Card>
        <Card title="Dataset and model">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-32"><Input label="Samples" type="number" min={500} max={50000} value={n} onChange={e => setN(e.target.value)} /></div>
            <Btn disabled={busy} onClick={() => act(() => api('/admin/retrain', { method: 'POST', body: { regenerate: true, n: +n } }))}><RefreshCw size={16} /> Regenerate and retrain</Btn>
            <Btn disabled={busy} onClick={() => act(() => api('/admin/retrain', { method: 'POST', body: {} }))} className="!bg-slate-700">Retrain only</Btn>
            <Btn onClick={() => download('/admin/dataset.csv', 'traffic_dataset.csv')} className="!bg-slate-700"><Download size={16} /> Dataset CSV</Btn>
          </div>
        </Card>
      </div>
      <Card title={editId ? 'Edit location' : 'Add location'}>
        <form onSubmit={save} className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <Input label="Latitude" type="number" step="any" value={form.lat} onChange={e => setForm({ ...form, lat: e.target.value })} required />
          <Input label="Longitude" type="number" step="any" value={form.lng} onChange={e => setForm({ ...form, lng: e.target.value })} required />
          <Input label="Capacity (vph)" type="number" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} required />
          <Input label="Speed limit" type="number" value={form.speed_limit} onChange={e => setForm({ ...form, speed_limit: e.target.value })} required />
          <div className="flex gap-2"><Btn disabled={busy}>{editId ? 'Update' : 'Add'}</Btn>{editId && <Btn type="button" className="!bg-slate-500" onClick={() => { setEditId(null); setForm(EMPTY); }}>Cancel</Btn>}</div>
        </form>
      </Card>
      <Card title="Traffic locations"><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Name</th><th>Lat/Lng</th><th>Capacity</th><th>Limit</th><th /></tr></thead>
        <tbody>{(locs.data || []).map(l => <tr key={l.id} className="border-b last:border-0"><td className="py-2">{l.name}</td><td>{l.lat.toFixed(3)}, {l.lng.toFixed(3)}</td><td>{l.capacity}</td><td>{l.speed_limit}</td>
          <td className="text-right space-x-3"><button className="text-blue-600" onClick={() => { setEditId(l.id); setForm(l); window.scrollTo(0, 0); }}>Edit</button>
            <button className="text-red-600" onClick={() => window.confirm(`Delete ${l.name}?`) && act(() => api(`/locations/${l.id}`, { method: 'DELETE' }))}>Delete</button></td></tr>)}</tbody>
      </table></div></Card>
      <Card title="Prediction history (latest 100)"><div className="overflow-x-auto max-h-80"><table className="w-full text-sm">
        <thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Time</th><th>Location</th><th>Horizon</th><th>Volume</th><th>Level</th><th>Confidence</th></tr></thead>
        <tbody>{(hist.data || []).map(p => <tr key={p.id} className="border-b last:border-0"><td className="py-1.5">{p.created_at.replace('T', ' ')}</td><td>{p.name}</td><td>{p.horizon} min</td><td>{p.predicted_volume}</td><td><Badge level={p.level} /></td><td>{p.confidence}%</td></tr>)}</tbody>
      </table></div></Card>
    </div>
  );
}

/* ---------- Settings ---------- */
export function SettingsPage() {
  const { user, logout } = useAuth();
  const [s, setS] = useState(settings()); const [saved, setSaved] = useState(false);
  const save = () => { localStorage.setItem('settings', JSON.stringify(s)); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <div className="space-y-4 max-w-xl">
      <Head title="Settings" sub={`Signed in as ${user.email}`} />
      <Card title="Preferences" className="space-y-4">
        <Select label="Simulated weather scenario" value={s.weather} onChange={v => setS({ ...s, weather: v })}>{WEATHERS.map(w => <option key={w}>{w}</option>)}</Select>
        <Select label="Auto-refresh interval" value={s.refresh} onChange={v => setS({ ...s, refresh: +v })}><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>60 seconds</option><option value={0}>Off</option></Select>
        <div className="flex items-center gap-3"><Btn onClick={save}>Save settings</Btn>{saved && <span className="text-green-600 text-sm">Saved ✓</span>}</div>
      </Card>
      <Card><Btn onClick={logout} className="!bg-red-600 hover:!bg-red-700">Sign out</Btn></Card>
    </div>
  );
}
