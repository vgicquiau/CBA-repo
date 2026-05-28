import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoom, useRoomBookings, useCreateBooking } from '../api/hooks';
import { RoomPhoto } from '../ui/RoomPhoto';
import { fmtRange, nightsBetween, todayIso } from '../utils';
import type { CreateBookingInput } from '@clos/shared-types';

export function RoomDetailScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { data: room, isLoading, isError } = useRoom(roomId ?? '');
  const { data: bookings } = useRoomBookings(roomId ?? '', todayIso());
  const createBooking = useCreateBooking();

  const [form, setForm] = useState<{ start: string; end: string; people: number; name: string; notes: string }>({
    start: '',
    end: '',
    people: 1,
    name: '',
    notes: '',
  });
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState(false);

  if (isLoading) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="serif-it" style={{ color: 'var(--muted)' }}>Chargement…</div>
      </div>
    );
  }
  if (isError || !room) {
    return (
      <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="serif-it" style={{ color: 'var(--terracotta)', marginBottom: 16 }}>Chambre introuvable.</div>
        <button className="btn btn-ghost" onClick={() => navigate('/rooms')}>Retour</button>
      </div>
    );
  }

  const nights = form.start && form.end ? nightsBetween(form.start, form.end) : 0;
  const total = nights * form.people * room.pricePerPerson;
  const canBook = form.name.trim() && form.start && form.end && nights > 0 && form.people >= 1 && form.people <= room.capacity;

  const handleBook = async () => {
    if (!canBook || !roomId) return;
    const input: CreateBookingInput = {
      roomId,
      start: form.start,
      end: form.end,
      people: form.people,
      name: form.name.trim(),
      notes: form.notes,
    };
    await createBooking.mutateAsync(input);
    setSuccess(true);
    setShowForm(false);
  };

  if (success) {
    return (
      <div className="page">
        <div className="topbar">
          <button className="icon-btn" onClick={() => navigate('/rooms')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="confirmation">
          <div className="seal">✓</div>
          <div className="serif" style={{ fontSize: 30, marginBottom: 8 }}>Réservation envoyée !</div>
          <div className="serif-it" style={{ fontSize: 16, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {room.name} du {form.start} au {form.end}.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
            <button className="btn btn-ghost" onClick={() => navigate('/my-trips')} style={{ flex: 1 }}>Mes séjours</button>
            <button className="btn btn-primary" onClick={() => navigate('/')} style={{ flex: 1 }}>Accueil</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ position: 'relative', marginBottom: -24 }}>
        <RoomPhoto room={room} style={{ width: '100%', height: 300, borderRadius: 0 }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '58px 16px 14px', display: 'flex', justifyContent: 'space-between' }}>
          <button className="icon-btn" onClick={() => navigate('/rooms')} style={{ background: 'rgba(251,247,240,0.92)', backdropFilter: 'blur(8px)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Title */}
      <div style={{ position: 'relative', background: 'var(--bg)', borderRadius: '24px 24px 0 0', padding: '24px 20px 18px' }}>
        <div className="label" style={{ marginBottom: 6 }}>
          {room.wing} · {room.floor === 0 ? 'Rez' : '1ᵉʳ étage'} <span className="dot-sep" /> {room.area} m²
        </div>
        <h1 className="serif" style={{ fontSize: 38, lineHeight: 1, margin: 0 }}>{room.name}</h1>
        <p className="serif-it" style={{ fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.4, marginTop: 14 }}>{room.blurb}</p>
      </div>

      <hr className="hr" style={{ margin: '0 20px' }} />

      {/* Key facts */}
      <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--paper)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M2 14V7M18 14V11a2 2 0 00-2-2H10v5M2 14h16M2 14v2M18 14v2" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinecap="round"/><circle cx="6" cy="10" r="1.5" stroke="var(--ink-2)" strokeWidth="1.5"/></svg>
          </div>
          <div><div className="label" style={{ fontSize: 9, marginBottom: 2 }}>Couchage</div><div style={{ fontSize: 13 }}>{room.beds}</div></div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--paper)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="7" r="3" stroke="var(--ink-2)" strokeWidth="1.5"/><path d="M4 17c1.5-3 3.5-4.5 6-4.5s4.5 1.5 6 4.5" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div><div className="label" style={{ fontSize: 9, marginBottom: 2 }}>Capacité</div><div style={{ fontSize: 13 }}>{room.capacity} pers.</div></div>
        </div>
      </div>

      <hr className="hr" style={{ margin: '0 20px' }} />

      {/* Equipment */}
      <div style={{ padding: '20px' }}>
        <div className="label" style={{ marginBottom: 10 }}>Équipement</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {room.equipment.map((e) => <span key={e} className="tag">{e}</span>)}
        </div>
        {room.linen.length > 0 && (
          <>
            <div className="label" style={{ marginTop: 18, marginBottom: 10 }}>Linge fourni</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {room.linen.map((l) => <span key={l} className="tag tag-sage">{l}</span>)}
            </div>
          </>
        )}
      </div>

      <hr className="hr" style={{ margin: '0 20px' }} />

      {/* Upcoming bookings */}
      {bookings && bookings.length > 0 && (
        <div style={{ padding: '20px 20px 0' }}>
          <div className="label" style={{ marginBottom: 10 }}>Prochains séjours</div>
          <div className="card" style={{ padding: '2px 0' }}>
            {bookings.slice(0, 4).map((b) => (
              <div key={b.bookingId} className="row-tap" style={{ cursor: 'default' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{b.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {fmtRange(b.start, b.end)} <span className="dot-sep" /> {nightsBetween(b.start, b.end)} nuits
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booking form */}
      {showForm && (
        <div style={{ padding: '20px 16px 0' }}>
          <div className="label" style={{ padding: '0 4px 8px' }}>Au nom de</div>
          <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Prénom Nom" />
          <div className="label" style={{ padding: '16px 4px 8px' }}>Dates</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="input" type="date" value={form.start} min={todayIso()} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
            <input className="input" type="date" value={form.end} min={form.start || todayIso()} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
          </div>
          <div className="label" style={{ padding: '16px 4px 8px' }}>Personnes</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="icon-btn" onClick={() => setForm((f) => ({ ...f, people: Math.max(1, f.people - 1) }))}>−</button>
            <span className="serif" style={{ fontSize: 24, minWidth: 32, textAlign: 'center' }}>{form.people}</span>
            <button className="icon-btn" onClick={() => setForm((f) => ({ ...f, people: Math.min(room.capacity, f.people + 1) }))}>+</button>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>max {room.capacity}</span>
          </div>
          <div className="label" style={{ padding: '16px 4px 8px' }}>Note</div>
          <textarea className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Heure d'arrivée, demandes…" style={{ minHeight: 70 }} />
          {nights > 0 && (
            <div style={{ background: 'var(--paper)', borderRadius: 14, padding: '14px 16px', border: '1px solid var(--line-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
              <div>
                <div className="label" style={{ marginBottom: 3 }}>Prix indicatif</div>
                <div className="serif-it" style={{ fontSize: 12, color: 'var(--muted)' }}>{form.people} × {nights}n × {room.pricePerPerson}€</div>
              </div>
              <div className="serif" style={{ fontSize: 28 }}>{total}€</div>
            </div>
          )}
          {createBooking.isError && (
            <div style={{ padding: '10px 0', color: 'var(--terracotta)', fontSize: 13 }}>
              Conflit de dates — cette chambre est déjà réservée sur cette période.
            </div>
          )}
        </div>
      )}

      {/* CTA */}
      <div className="page-actions" style={{ alignItems: 'center', gap: 12 }}>
        {!showForm ? (
          <>
            <div>
              <div className="serif" style={{ fontSize: 24, lineHeight: 1 }}>{room.pricePerPerson}€</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.12em' }}>/ PERS. / NUIT</div>
            </div>
            <button className="btn btn-clay" onClick={() => setShowForm(true)} style={{ flex: 1, padding: '15px 18px' }}>
              Réserver {room.name}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => setShowForm(false)} style={{ flex: '0 0 auto' }}>Annuler</button>
            <button
              className="btn btn-clay"
              disabled={!canBook || createBooking.isPending}
              onClick={handleBook}
              style={{ flex: 1, opacity: canBook && !createBooking.isPending ? 1 : 0.4, cursor: canBook ? 'pointer' : 'not-allowed' }}
            >
              {createBooking.isPending ? 'Envoi…' : 'Confirmer la réservation'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
