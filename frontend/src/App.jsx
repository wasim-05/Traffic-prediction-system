import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet } from 'react-router-dom';
import { LayoutDashboard, Activity, TrendingUp, Map as MapIcon, BarChart3, Route as RouteIcon, FileText, ShieldCheck, Settings as Cog, LogOut, Menu, X } from 'lucide-react';
import { AuthContext, useAuth } from './api';
import * as P from './pages';

const NAV = [
  ['/', 'Dashboard', LayoutDashboard], ['/live', 'Live Monitoring', Activity], ['/prediction', 'Prediction', TrendingUp],
  ['/map', 'Traffic Map', MapIcon], ['/analytics', 'Analytics', BarChart3], ['/routes', 'Alternative Routes', RouteIcon],
  ['/reports', 'Reports', FileText], ['/admin', 'Admin', ShieldCheck], ['/settings', 'Settings', Cog],
];

function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return <Navigate to="/login" replace />;
  const items = NAV.filter(n => n[0] !== '/admin' || user.role === 'admin');
  return (
    <div className="min-h-screen flex">
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-blue-950 text-blue-100 flex flex-col transition-transform md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-5 py-5 text-white font-bold text-lg flex justify-between">🚦 AI Traffic <button className="md:hidden" onClick={() => setOpen(false)}><X size={20} /></button></div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {items.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${isActive ? 'bg-blue-600 text-white' : 'hover:bg-blue-900'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-blue-900 text-sm">
          <div className="truncate text-white">{user.name}</div>
          <div className="text-xs text-blue-300 mb-2">{user.role}</div>
          <button onClick={logout} className="flex items-center gap-2 text-blue-200 hover:text-white"><LogOut size={16} /> Sign out</button>
        </div>
      </aside>
      <div className="flex-1 md:ml-64 min-w-0">
        <header className="md:hidden bg-blue-950 text-white p-3 flex items-center gap-3"><button onClick={() => setOpen(true)}><Menu /></button> AI Traffic</header>
        <main className="p-4 md:p-8 fade-in"><Outlet /></main>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const login = (token, u) => { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(u)); setUser(u); };
  const logout = () => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); };
  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<P.Login />} />
          <Route element={<Layout />}>
            <Route path="/" element={<P.Dashboard />} />
            <Route path="/live" element={<P.Live />} />
            <Route path="/prediction" element={<P.Prediction />} />
            <Route path="/map" element={<P.TrafficMap />} />
            <Route path="/analytics" element={<P.Analytics />} />
            <Route path="/routes" element={<P.RoutesPage />} />
            <Route path="/reports" element={<P.Reports />} />
            <Route path="/admin" element={<P.Admin />} />
            <Route path="/settings" element={<P.SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
