import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { useMe } from './api/hooks';
import { HomeScreen } from './screens/HomeScreen';
import { RoomsScreen } from './screens/RoomsScreen';
import { RoomDetailScreen } from './screens/RoomDetailScreen';
import { MyTripsScreen } from './screens/MyTripsScreen';
import { AdminDashboardScreen } from './screens/AdminDashboardScreen';
import { AdminRoomsScreen } from './screens/AdminRoomsScreen';

function AppLayout() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = me?.role === 'admin';
  const path = location.pathname;

  const userTab = path === '/' ? 'home' : path.startsWith('/rooms') ? 'rooms' : path === '/my-trips' ? 'me' : null;
  const adminTab = path === '/admin' ? 'dashboard' : path.startsWith('/admin/rooms') ? 'rooms' : null;
  const isAdminView = path.startsWith('/admin');
  const hideTabBar = path.includes('/rooms/') && path !== '/rooms';

  return (
    <div className="app">
      <div className="app-body">
        {/* Sidebar */}
        {!isAdminView ? (
          <nav className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-brand-label">Le Clos</div>
              <div className="sidebar-brand-name">Bon Accueil</div>
            </div>
            <div className="sidebar-nav">
              <SidebarItem label="Accueil" active={userTab === 'home'} onClick={() => navigate('/')}>
                <svg viewBox="0 0 24 24" fill="none"><path d="M4 10l8-6 8 6v10a1 1 0 01-1 1H5a1 1 0 01-1-1V10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9 21V14h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
              </SidebarItem>
              <SidebarItem label="Chambres" active={userTab === 'rooms'} onClick={() => navigate('/rooms')}>
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="10" rx="1" stroke="currentColor" strokeWidth="1.6"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </SidebarItem>
              <SidebarItem label="Mes séjours" active={userTab === 'me'} onClick={() => navigate('/my-trips')}>
                <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </SidebarItem>
            </div>
            {isAdmin && (
              <div className="sidebar-footer">
                <SidebarItem label="Admin" active={false} onClick={() => navigate('/admin')}>
                  <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.6"/><path d="M4 20c1.5-4 4-6 8-6s6.5 2 8 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
                </SidebarItem>
              </div>
            )}
          </nav>
        ) : (
          <nav className="sidebar">
            <div className="sidebar-header">
              <div className="sidebar-brand-label">Administration</div>
              <div className="sidebar-brand-name">Le Clos</div>
            </div>
            <div className="sidebar-nav">
              <SidebarItem label="Tableau" active={adminTab === 'dashboard'} onClick={() => navigate('/admin')}>
                <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/></svg>
              </SidebarItem>
              <SidebarItem label="Chambres" active={adminTab === 'rooms'} onClick={() => navigate('/admin/rooms')}>
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="10" rx="1" stroke="currentColor" strokeWidth="1.6"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </SidebarItem>
            </div>
            <div className="sidebar-footer">
              <SidebarItem label="Quitter" active={false} onClick={() => navigate('/')}>
                <svg viewBox="0 0 24 24" fill="none"><path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </SidebarItem>
            </div>
          </nav>
        )}

        <div className="app-content">
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/rooms" element={<RoomsScreen />} />
            <Route path="/rooms/:roomId" element={<RoomDetailScreen />} />
            <Route path="/my-trips" element={<MyTripsScreen />} />
            <Route path="/admin" element={isAdmin ? <AdminDashboardScreen /> : <Navigate to="/" replace />} />
            <Route path="/admin/rooms" element={isAdmin ? <AdminRoomsScreen /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      {/* Tab bar — mobile only */}
      {!hideTabBar && !isAdminView && (
        <nav className="tabbar">
          <TabItem label="Accueil" active={userTab === 'home'} onClick={() => navigate('/')}>
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 10l8-6 8 6v10a1 1 0 01-1 1H5a1 1 0 01-1-1V10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M9 21V14h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>
          </TabItem>
          <TabItem label="Chambres" active={userTab === 'rooms'} onClick={() => navigate('/rooms')}>
            <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="10" rx="1" stroke="currentColor" strokeWidth="1.6"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </TabItem>
          <TabItem label="Mes séjours" active={userTab === 'me'} onClick={() => navigate('/my-trips')}>
            <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </TabItem>
        </nav>
      )}
      {!hideTabBar && isAdminView && (
        <nav className="tabbar" style={{ borderTop: '1px solid var(--line)' }}>
          <TabItem label="Tableau" active={adminTab === 'dashboard'} onClick={() => navigate('/admin')}>
            <svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6"/></svg>
          </TabItem>
          <TabItem label="Chambres" active={adminTab === 'rooms'} onClick={() => navigate('/admin/rooms')}>
            <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="10" rx="1" stroke="currentColor" strokeWidth="1.6"/></svg>
          </TabItem>
          <TabItem label="Sortie" active={false} onClick={() => navigate('/')}>
            <svg viewBox="0 0 24 24" fill="none"><path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </TabItem>
        </nav>
      )}
    </div>
  );
}

function SidebarItem({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`sidebar-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="sidebar-icon">{children}</span>
      <span className="sidebar-label">{label}</span>
    </button>
  );
}

function TabItem({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} onClick={onClick} style={active ? { color: 'var(--terracotta)' } : {}}>
      {children}
      <span>{label}</span>
    </button>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppLayout />
    </AuthProvider>
  );
}
