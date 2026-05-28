import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRooms, useDeleteRoom, useUpdateRoom, useCreateRoom, useUploadRoomPhoto } from '../api/hooks';
import { RoomPhoto } from '../ui/RoomPhoto';
import { ConfirmDialog } from '../ui/Modal';
import type { Room, CreateRoomInput, UpdateRoomInput } from '@clos/shared-types';
import { ROOM_PHOTO_TINTS } from '@clos/shared-types';

type Mode = 'list' | 'create' | 'edit';

export function AdminRoomsScreen() {
  const navigate = useNavigate();
  const { data: rooms, isLoading } = useRooms();
  const deleteRoom = useDeleteRoom();
  const createRoom = useCreateRoom();
  const updateRoom = useUpdateRoom();
  const uploadPhoto = useUploadRoomPhoto();

  const [mode, setMode] = useState<Mode>('list');
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const emptyForm: CreateRoomInput = {
    roomId: '', name: '', wing: '', floor: 0, area: 15, capacity: 2,
    beds: '1 lit double', closet: '', equipment: [], linen: ['Draps fournis'],
    pricePerPerson: 25, photoTint: 'lin', blurb: '',
  };
  const [form, setForm] = useState<CreateRoomInput>(emptyForm);

  const startCreate = () => { setForm(emptyForm); setEditingRoom(null); setMode('create'); };
  const startEdit = (r: Room) => {
    setForm({ roomId: r.roomId, name: r.name, wing: r.wing, floor: r.floor, area: r.area, capacity: r.capacity, beds: r.beds, closet: r.closet, equipment: [...r.equipment], linen: [...r.linen], pricePerPerson: r.pricePerPerson, photoTint: r.photoTint, blurb: r.blurb });
    setEditingRoom(r);
    setMode('edit');
  };

  const handleSave = async () => {
    if (mode === 'create') {
      await createRoom.mutateAsync(form);
    } else if (mode === 'edit' && editingRoom) {
      const patch: { roomId: string; patch: UpdateRoomInput } = { roomId: editingRoom.roomId, patch: { name: form.name, wing: form.wing, floor: form.floor, area: form.area, capacity: form.capacity, beds: form.beds, closet: form.closet, equipment: form.equipment, linen: form.linen, pricePerPerson: form.pricePerPerson, photoTint: form.photoTint, blurb: form.blurb } };
      await updateRoom.mutateAsync(patch);
    }
    setMode('list');
  };

  const handleDelete = async () => {
    if (confirmDeleteId) {
      await deleteRoom.mutateAsync(confirmDeleteId);
      setConfirmDeleteId(null);
      if (mode === 'edit') setMode('list');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingRoom) return;
    await uploadPhoto.mutateAsync({ roomId: editingRoom.roomId, file });
  };

  const canSave = form.name.trim() && form.beds.trim() && form.capacity > 0 && (mode === 'edit' || form.roomId.trim());

  if (mode === 'create' || mode === 'edit') {
    return (
      <div className="page">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="icon-btn" onClick={() => setMode('list')}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <div>
              <span className="label" style={{ lineHeight: 1, color: 'var(--terracotta)' }}>Administration</span>
              <div className="serif" style={{ fontSize: 22, lineHeight: 1.1 }}>{mode === 'create' ? 'Nouvelle chambre' : 'Modifier la chambre'}</div>
            </div>
          </div>
        </div>

        {/* Photo */}
        {mode === 'edit' && editingRoom && (
          <div style={{ padding: '0 16px 14px' }}>
            <div className="label" style={{ padding: '0 4px 8px' }}>Photo</div>
            <RoomPhoto room={editingRoom} style={{ height: 160, borderRadius: 14 }} />
            <label style={{ display: 'block', marginTop: 8 }}>
              <span className="btn btn-ghost" style={{ fontSize: 13, padding: '8px 16px', cursor: 'pointer' }}>
                {uploadPhoto.isPending ? 'Envoi…' : 'Changer la photo'}
              </span>
              <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
            </label>
          </div>
        )}

        {/* Tints */}
        <div style={{ padding: '0 16px 14px' }}>
          <div className="label" style={{ padding: '0 4px 8px' }}>Teinte</div>
          <div className="no-scrollbar" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {ROOM_PHOTO_TINTS.map((t) => (
              <button key={t} onClick={() => setForm((f) => ({ ...f, photoTint: t }))} className={`tint-${t}`}
                style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, border: '2px solid ' + (form.photoTint === t ? 'var(--ink)' : 'transparent'), cursor: 'pointer' }} title={t} />
            ))}
          </div>
        </div>

        {mode === 'create' && (
          <div style={{ padding: '0 16px 14px' }}>
            <div className="label" style={{ padding: '0 4px 8px' }}>Identifiant (immutable)</div>
            <input className="input" value={form.roomId} onChange={(e) => setForm((f) => ({ ...f, roomId: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="glycine, pigeonnier…" />
          </div>
        )}

        <div style={{ padding: '0 16px 14px' }}>
          <div className="label" style={{ padding: '0 4px 8px' }}>Nom</div>
          <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="La Glycine" />
        </div>

        <div style={{ padding: '0 16px 14px' }}>
          <div className="label" style={{ padding: '0 4px 8px' }}>Description</div>
          <textarea className="input" value={form.blurb} onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))} style={{ minHeight: 70 }} />
        </div>

        <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div className="label" style={{ padding: '0 4px 8px' }}>Couchage</div>
            <input className="input" value={form.beds} onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))} />
          </div>
          <div>
            <div className="label" style={{ padding: '0 4px 8px' }}>Capacité</div>
            <input className="input" type="number" min={1} max={10} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 1 }))} />
          </div>
        </div>

        <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <div className="label" style={{ padding: '0 4px 8px' }}>Niveau</div>
            <select className="input" value={form.floor} onChange={(e) => setForm((f) => ({ ...f, floor: parseInt(e.target.value) as 0 | 1 }))}>
              <option value={0}>Rez</option>
              <option value={1}>1ᵉʳ étage</option>
            </select>
          </div>
          <div>
            <div className="label" style={{ padding: '0 4px 8px' }}>Surface m²</div>
            <input className="input" type="number" min={5} value={form.area} onChange={(e) => setForm((f) => ({ ...f, area: parseInt(e.target.value) || 0 }))} />
          </div>
          <div>
            <div className="label" style={{ padding: '0 4px 8px' }}>€/pers.</div>
            <input className="input" type="number" min={0} value={form.pricePerPerson} onChange={(e) => setForm((f) => ({ ...f, pricePerPerson: parseInt(e.target.value) || 0 }))} />
          </div>
        </div>

        <div style={{ padding: '0 16px 14px' }}>
          <div className="label" style={{ padding: '0 4px 8px' }}>Partie de la maison</div>
          <input className="input" value={form.wing} onChange={(e) => setForm((f) => ({ ...f, wing: e.target.value }))} placeholder="Aile gauche…" />
        </div>

        {mode === 'edit' && (
          <div style={{ padding: '8px 16px 0' }}>
            <button onClick={() => setConfirmDeleteId(editingRoom!.roomId)} style={{ width: '100%', padding: 12, borderRadius: 10, background: 'transparent', color: 'var(--terracotta)', border: '1px solid rgba(176,90,60,0.4)', fontFamily: 'var(--sans)', fontSize: 13, cursor: 'pointer' }}>
              Supprimer la chambre
            </button>
          </div>
        )}

        <ConfirmDialog
          open={confirmDeleteId !== null}
          title={`Supprimer « ${editingRoom?.name ?? ''} » ?`}
          body="Cette action est définitive."
          confirmLabel="Supprimer"
          cancelLabel="Garder"
          danger
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={handleDelete}
        />

        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => setMode('list')} style={{ flex: '0 0 auto' }}>Annuler</button>
          <button
            className="btn btn-clay"
            disabled={!canSave}
            onClick={handleSave}
            style={{ flex: 1, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'not-allowed' }}
          >
            {createRoom.isPending || updateRoom.isPending ? 'Envoi…' : mode === 'create' ? 'Créer la chambre' : 'Enregistrer'}
          </button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="page">
      <div className="topbar">
        <div>
          <span className="label" style={{ lineHeight: 1, color: 'var(--terracotta)' }}>Administration</span>
          <div className="serif" style={{ fontSize: 22, lineHeight: 1.1 }}>Chambres</div>
        </div>
        <button className="icon-btn" onClick={startCreate} style={{ background: 'var(--terracotta)', color: '#FBF7F0', border: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div style={{ padding: '0 20px 14px' }}>
        <div className="serif-it" style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.4 }}>
          {(rooms ?? []).length} chambres au catalogue.
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div className="serif-it" style={{ color: 'var(--muted)' }}>Chargement…</div>
        </div>
      )}

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(rooms ?? []).map((r: Room) => (
          <div key={r.roomId} onClick={() => startEdit(r)} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--paper)', borderRadius: 14, border: '1px solid var(--line-2)', cursor: 'pointer' }}>
            <RoomPhoto room={r} style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 10 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="serif" style={{ fontSize: 19 }}>{r.name}</span>
                  <span style={{ fontSize: 13 }}><span className="serif" style={{ fontSize: 16 }}>{r.pricePerPerson}€</span><span style={{ color: 'var(--muted)', fontSize: 10 }}> /pers.</span></span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{r.beds} <span className="dot-sep" /> {r.capacity}p <span className="dot-sep" /> {r.area}m²</div>
              </div>
              <span className="label" style={{ fontSize: 9 }}>{r.wing} · {r.floor === 0 ? 'Rez' : '1ᵉʳ étage'}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '18px 16px 0' }}>
        <button className="btn btn-ghost" onClick={startCreate} style={{ width: '100%' }}>+ Ajouter une chambre</button>
      </div>
    </div>
  );
}
