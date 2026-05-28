import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminDashboard } from '../api/hooks';
import { fmtRange, nightsBetween, initials, todayIso } from '../utils';
import type { Booking } from '@clos/shared-types';

export function AdminDashboardScreen() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useAdminDashboard();

  if (isLoading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="serif-it" style={{ color: 'var(--muted)' }}>Chargement…</div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="serif-it" style={{ color: 'var(--terracotta)' }}>Impossible de charger le tableau de bord.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="label" style={{ lineHeight: 1, color: 'var(--terracotta)' }}>Administration</span>
          <div className="serif" style={{ fontSize: 22, lineHeight: 1.1 }}>Tableau de bord</div>
        </div>
        <div className="icon-btn" style={{ background: 'var(--terracotta)', color: 'var(--bg)', fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em' }}>
          ADM
        </div>
      </div>

      <div style={{ padding: '0 20px 18px' }}>
        <div className="serif-it" style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.4 }}>La maison en un coup d'œil.</div>
      </div>

      {/* KPIs */}
      <div style={{ padding: '0 16px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Kpi big={data.todayCount} label="à la maison aujourd'hui" />
        <Kpi big={data.weekCount} label="séjours cette semaine" />
        <Kpi big={data.totalRoomCount} label="chambres au catalogue" />
        <Kpi big={`${data.totalUpcomingRevenue}€`} label="à venir, indicatif" small />
      </div>

      {/* Actions */}
      <div style={{ padding: '0 16px 18px', display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost" onClick={() => navigate('/admin/rooms')} style={{ flex: 1 }}>
          Chambres
        </button>
      </div>

      {/* Prochaines arrivées */}
      <div style={{ padding: '0 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="label">Prochaines arrivées</span>
      </div>
      <div style={{ padding: '0 16px 18px' }}>
        <div className="card" style={{ padding: '2px 0' }}>
          {data.upcomingArrivals.slice(0, 6).map((b: Booking) => (
            <div key={b.bookingId} className="row-tap" style={{ cursor: 'default' }}>
              <div style={{
                width: 42, textAlign: 'center', marginRight: 12,
                borderRight: '1px solid var(--line-2)', paddingRight: 8,
              }}>
                <div className="serif" style={{ fontSize: 20, lineHeight: 1 }}>{new Date(b.start + 'T00:00:00').getDate()}</div>
                <div className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>
                  {['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'][new Date(b.start + 'T00:00:00').getMonth()]}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {fmtRange(b.start, b.end)} <span className="dot-sep" /> {nightsBetween(b.start, b.end)} nuits <span className="dot-sep" /> {b.people} pers.
                </div>
              </div>
            </div>
          ))}
          {data.upcomingArrivals.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center' }}>
              <div className="serif-it" style={{ color: 'var(--muted)' }}>Aucune arrivée à venir.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ big, label, small }: { big: number | string; label: string; small?: boolean }) {
  return (
    <div style={{ background: 'var(--paper)', border: '1px solid var(--line-2)', borderRadius: 14, padding: '14px 14px 12px' }}>
      <div className="serif" style={{ fontSize: small ? 22 : 32, lineHeight: 1 }}>{big}</div>
      <div className="mono" style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 8, lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}
