import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useRooms, useMe, useAdminDashboard } from '../api/hooks';
import { RoomPhoto } from '../ui/RoomPhoto';
import { fmtRange, nightsBetween, initials, todayIso } from '../utils';
import type { Room } from '@clos/shared-types';

export function HomeScreen() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data: rooms, isLoading } = useRooms();
  const { data: dashboard } = useAdminDashboard();

  const today = new Date();
  const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const DAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const todayLabel = `${DAYS[today.getDay()]} ${today.getDate()} ${MONTHS[today.getMonth()]}`;

  const featured = (rooms ?? []).slice(0, 3);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="label" style={{ marginBottom: 2 }}>{todayLabel}</div>
          <div className="serif" style={{ fontSize: 22 }}>Bonjour {me?.displayName ?? '…'}</div>
        </div>
        <div
          className="icon-btn"
          style={{ background: 'var(--terracotta)', color: 'var(--bg)', fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 14, fontWeight: 600 }}
        >
          {(me?.displayName ?? 'U')[0]}
        </div>
      </div>

      <div style={{ padding: '0 20px 18px' }}>
        <div className="serif-it" style={{ fontSize: 22, color: 'var(--ink-2)', lineHeight: 1.3 }}>
          La maison t'attend.
        </div>
      </div>

      {/* Hero */}
      <div style={{ padding: '0 16px 22px' }}>
        <div className="photo" style={{ height: 200, borderRadius: 18 }}>
          <div style={{
            position: 'absolute', inset: 12,
            border: '1px solid rgba(251,247,240,0.55)',
            borderRadius: 12,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            padding: 14, zIndex: 1,
          }}>
            <div className="label" style={{ color: 'rgba(251,247,240,0.85)' }}>Le Clos Bon Accueil</div>
            <div>
              <div className="serif-it" style={{ color: '#FBF7F0', fontSize: 24, lineHeight: 1 }}>Le Clos</div>
              <div className="serif" style={{ color: '#FBF7F0', fontSize: 32, lineHeight: 1 }}>Bon Accueil</div>
              <div className="mono" style={{ color: 'rgba(251,247,240,0.8)', fontSize: 10, marginTop: 6, letterSpacing: '0.14em' }}>
                12 CHAMBRES · NORMANDIE
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ padding: '0 16px 26px' }}>
        <button className="btn btn-primary" onClick={() => navigate('/rooms')} style={{ width: '100%', padding: '16px 20px' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M2 7h12M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Réserver une chambre
        </button>
      </div>

      {/* Prochaines arrivées (admin only) */}
      {me?.role === 'admin' && dashboard && (
        <>
          <div style={{ padding: '0 20px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span className="label">Prochaines arrivées</span>
            <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--terracotta)', fontSize: 12, cursor: 'pointer' }}>
              Tout voir →
            </button>
          </div>
          <div style={{ padding: '0 16px 24px' }}>
            <div className="card" style={{ padding: '2px 0' }}>
              {dashboard.upcomingArrivals.slice(0, 5).map((b) => (
                <div key={b.bookingId} className="row-tap" style={{ cursor: 'default' }}>
                  <div className="avatar" style={{ marginRight: 12 }}>{initials(b.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {fmtRange(b.start, b.end)} <span className="dot-sep" /> {b.people} pers.
                    </div>
                  </div>
                  <span className="tag">{nightsBetween(b.start, b.end)}n</span>
                </div>
              ))}
              {dashboard.upcomingArrivals.length === 0 && (
                <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                  <div className="serif-it" style={{ color: 'var(--muted)' }}>Aucune arrivée à venir.</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Chambres en vedette */}
      <div style={{ padding: '0 20px 12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="serif" style={{ fontSize: 22 }}>Une chambre pour toi</span>
        <button onClick={() => navigate('/rooms')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--terracotta)', fontSize: 13, cursor: 'pointer' }}>
          Voir tout →
        </button>
      </div>

      {isLoading && (
        <div style={{ padding: '0 16px 24px' }}>
          <div className="serif-it" style={{ color: 'var(--muted)', fontSize: 14 }}>Chargement…</div>
        </div>
      )}

      <div className="no-scrollbar" style={{ display: 'flex', gap: 12, padding: '0 16px 8px', overflowX: 'auto' }}>
        {featured.map((r: Room) => (
          <div
            key={r.roomId}
            onClick={() => navigate(`/rooms/${r.roomId}`)}
            style={{ width: 200, flexShrink: 0, background: 'var(--paper)', borderRadius: 14, border: '1px solid var(--line-2)', padding: 10, cursor: 'pointer' }}
          >
            <RoomPhoto room={r} style={{ width: '100%', height: 130, marginBottom: 10, borderRadius: 10 }} />
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span className="serif" style={{ fontSize: 18 }}>{r.name}</span>
              <span className="serif" style={{ fontSize: 15 }}>{r.pricePerPerson}€</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span className="label" style={{ fontSize: 9 }}>{r.beds}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
