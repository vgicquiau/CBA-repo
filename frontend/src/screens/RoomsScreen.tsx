import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRooms } from '../api/hooks';
import { RoomPhoto } from '../ui/RoomPhoto';
import type { Room } from '@clos/shared-types';

type Filter = 'all' | 'famille' | 'rez' | 'etage';

export function RoomsScreen() {
  const navigate = useNavigate();
  const { data: rooms, isLoading, isError } = useRooms();
  const [filter, setFilter] = useState<Filter>('all');

  const FILTERS: { k: Filter; l: string }[] = [
    { k: 'all', l: 'Toutes' },
    { k: 'famille', l: 'Famille' },
    { k: 'rez', l: 'Rez-de-chaussée' },
    { k: 'etage', l: 'À l\'étage' },
  ];

  const filtered = (rooms ?? []).filter((r: Room) => {
    if (filter === 'famille') return r.capacity >= 3;
    if (filter === 'rez') return r.floor === 0;
    if (filter === 'etage') return r.floor === 1;
    return true;
  });

  return (
    <div className="page">
      <div className="topbar">
        <div className="serif" style={{ fontSize: 26 }}>Les chambres</div>
      </div>

      <div style={{ padding: '0 20px 14px' }}>
        <div className="serif-it" style={{ fontSize: 16, color: 'var(--muted)', lineHeight: 1.4 }}>
          {(rooms ?? []).length} chambres, du grenier à la bergerie.
        </div>
      </div>

      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, padding: '4px 16px 18px', overflowX: 'auto' }}>
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 999, fontSize: 13,
              fontFamily: 'var(--sans)',
              border: '1px solid ' + (filter === f.k ? 'var(--ink)' : 'var(--line)'),
              background: filter === f.k ? 'var(--ink)' : 'var(--paper)',
              color: filter === f.k ? 'var(--bg)' : 'var(--ink)',
              cursor: 'pointer',
            }}
          >
            {f.l}
          </button>
        ))}
      </div>

      {isLoading && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div className="serif-it" style={{ color: 'var(--muted)' }}>Chargement…</div>
        </div>
      )}
      {isError && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div className="serif-it" style={{ color: 'var(--terracotta)' }}>Impossible de charger les chambres.</div>
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((r: Room) => (
          <div
            key={r.roomId}
            onClick={() => navigate(`/rooms/${r.roomId}`)}
            style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--paper)', borderRadius: 14, border: '1px solid var(--line-2)', cursor: 'pointer' }}
          >
            <RoomPhoto room={r} style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 10 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="serif" style={{ fontSize: 19 }}>{r.name}</span>
                  <span style={{ fontSize: 13 }}>
                    <span className="serif" style={{ fontSize: 16 }}>{r.pricePerPerson}€</span>
                    <span style={{ color: 'var(--muted)', fontSize: 10 }}> /pers.</span>
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  {r.beds} <span className="dot-sep" /> {r.capacity}p <span className="dot-sep" /> {r.area}m²
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="label" style={{ fontSize: 9 }}>{r.wing} · {r.floor === 0 ? 'Rez' : '1ᵉʳ étage'}</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && !isLoading && (
          <div className="serif-it" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            Rien dans cette catégorie.
          </div>
        )}
      </div>
    </div>
  );
}
