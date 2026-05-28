import React, { useState } from 'react';
import { useMyBookings, useDeleteBooking } from '../api/hooks';
import { ConfirmDialog } from '../ui/Modal';
import { fmtRange, nightsBetween, todayIso } from '../utils';
import type { Booking } from '@clos/shared-types';

export function MyTripsScreen() {
  const { data: bookings, isLoading, isError } = useMyBookings();
  const deleteBooking = useDeleteBooking();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const today = todayIso();
  const upcoming = (bookings ?? []).filter((b: Booking) => b.end > today).sort((a, b) => a.start.localeCompare(b.start));
  const past = (bookings ?? []).filter((b: Booking) => b.end <= today).sort((a, b) => b.start.localeCompare(a.start));

  const confirmBooking = bookings?.find((b) => b.bookingId === confirmId);

  return (
    <div className="page">
      <div className="topbar">
        <div className="serif" style={{ fontSize: 26 }}>Mes séjours</div>
      </div>

      {isLoading && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div className="serif-it" style={{ color: 'var(--muted)' }}>Chargement…</div>
        </div>
      )}
      {isError && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div className="serif-it" style={{ color: 'var(--terracotta)' }}>Impossible de charger vos réservations.</div>
        </div>
      )}

      {!isLoading && !isError && (bookings ?? []).length === 0 && (
        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
          <div className="serif-it" style={{ fontSize: 18, color: 'var(--muted)', marginBottom: 16 }}>Aucun séjour pour l'instant.</div>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div style={{ padding: '0 20px 10px' }}>
            <span className="label">À venir</span>
          </div>
          <div style={{ padding: '0 16px 24px' }}>
            <div className="card" style={{ padding: '2px 0' }}>
              {upcoming.map((b: Booking) => (
                <div key={b.bookingId} className="row-tap" style={{ cursor: 'default' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {fmtRange(b.start, b.end)} <span className="dot-sep" /> {nightsBetween(b.start, b.end)} nuits <span className="dot-sep" /> {b.people} pers.
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontFamily: 'var(--mono)' }}>{b.reference}</div>
                  </div>
                  <button
                    onClick={() => setConfirmId(b.bookingId)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 13, padding: '4px 8px' }}
                  >
                    Annuler
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <div style={{ padding: '0 20px 10px' }}>
            <span className="label">Passés</span>
          </div>
          <div style={{ padding: '0 16px 24px' }}>
            <div className="card" style={{ padding: '2px 0' }}>
              {past.map((b: Booking) => (
                <div key={b.bookingId} className="row-tap" style={{ cursor: 'default', opacity: 0.6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {fmtRange(b.start, b.end)} <span className="dot-sep" /> {nightsBetween(b.start, b.end)} nuits
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Annuler ce séjour ?"
        body={confirmBooking ? `${confirmBooking.name} · ${fmtRange(confirmBooking.start, confirmBooking.end)}` : ''}
        confirmLabel="Annuler le séjour"
        cancelLabel="Garder"
        danger
        onCancel={() => setConfirmId(null)}
        onConfirm={async () => {
          if (confirmId) {
            await deleteBooking.mutateAsync(confirmId);
            setConfirmId(null);
          }
        }}
      />
    </div>
  );
}
