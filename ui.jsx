// UI primitives — Le Clos Bon Accueil

const ClayDate = ({ d }) => {
  // d: Date or YYYY-MM-DD
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  const days = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const months = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
  return (
    <span>
      <span className="serif" style={{ fontSize: 'inherit' }}>{date.getDate()}</span>{' '}
      <span className="mono" style={{ fontSize: '0.78em', color: 'var(--muted)' }}>
        {months[date.getMonth()]}
      </span>
    </span>);

};

// Photo placeholder with stripes + tint + label
const PhotoFrame = ({ tint = 'lin', label = 'photo de chambre', style = {}, rounded = 10 }) =>
<div
  className={`photo tint-${tint}`}
  style={{ borderRadius: rounded, ...style }}>
  
    <div className="photo-label">{label}</div>
  </div>;


// Room photo — uses <image-slot> so admin (or anyone) can drop a real photo
// that persists. Falls back to a tinted stripe placeholder when empty.
// All instances of the same roomId share the same slot id, so a drop on the
// admin editor immediately shows up on cards, hero, calendar etc.
const RoomPhoto = ({ roomId, tint = 'lin', label = '', style = {}, rounded = 10, placeholder }) => {
  const slotId = `room-${roomId}-hero`;
  return (
    <div
      className={`photo tint-${tint}`}
      style={{
        position: 'relative',
        borderRadius: rounded,
        overflow: 'hidden',
        ...style
      }}>
      
      {/* fallback label sits behind the slot, visible only when slot is empty
           since slot's frame bg is very translucent */}
      <div className="photo-label" style={{ position: 'absolute', top: 8, left: 8, zIndex: 0 }}>
        {label}
      </div>
      <image-slot
        id={slotId}
        shape="rect"
        placeholder={placeholder || ''}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block'
        }}>
      </image-slot>
    </div>);

};

const TopBar = ({ title, onBack, onMenu, right, transparent = false }) =>
<div
  className="topbar"
  style={transparent ? { background: 'transparent' } : {}}>
  
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {onBack &&
    <button className="icon-btn" onClick={onBack} aria-label="retour">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
    }
      {title &&
    <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="label" style={{ lineHeight: 1 }}>Le Clos</span>
          <span className="serif" style={{ fontSize: 22, lineHeight: 1.1 }}>{title}</span>
        </div>
    }
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      {right}
      {onMenu &&
    <button className="icon-btn" onClick={onMenu} aria-label="menu">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="3" cy="7" r="1.4" fill="var(--ink)" />
            <circle cx="7" cy="7" r="1.4" fill="var(--ink)" />
            <circle cx="11" cy="7" r="1.4" fill="var(--ink)" />
          </svg>
        </button>
    }
    </div>
  </div>;


const TabBar = ({ tab, onTab }) => {
  const tabs = [
  { key: 'home', label: 'Accueil', icon: 'home' },
  { key: 'rooms', label: 'Chambres', icon: 'rooms' },
  { key: 'calendar', label: 'Calendrier', icon: 'cal' },
  { key: 'me', label: 'Mes séjours', icon: 'me' }];

  const Icon = ({ kind, on }) => {
    const c = on ? 'var(--ink)' : 'var(--muted)';
    if (kind === 'home') return (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-7h-6v7H5a1 1 0 01-1-1v-9z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>);

    if (kind === 'rooms') return (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="13" rx="1.5" stroke={c} strokeWidth="1.6" />
        <path d="M3 12h18M9 6v13M15 6v13" stroke={c} strokeWidth="1.4" />
      </svg>);

    if (kind === 'cal') return (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke={c} strokeWidth="1.6" />
        <path d="M3.5 10h17M8 3v4M16 3v4" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg>);

    if (kind === 'me') return (
      <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="9" r="3.5" stroke={c} strokeWidth="1.6" />
        <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      </svg>);

  };
  return (
    <nav className="tabbar">
      {tabs.map((t) =>
      <button
        key={t.key}
        className={`tab ${tab === t.key ? 'active' : ''}`}
        onClick={() => onTab(t.key)}>
        
          <Icon kind={t.icon} on={tab === t.key} />
          <span>{t.label}</span>
        </button>
      )}
    </nav>);

};

const Stepper = ({ step, total }) =>
<div className="stepper">
    {Array.from({ length: total }).map((_, i) =>
  <span
    key={i}
    className={`dot ${i < step ? 'done' : i === step ? 'current' : ''}`} />

  )}
  </div>;


const RoomCard = ({ room, available = true, onClick }) =>
<div
  onClick={onClick}
  style={{
    display: 'flex',
    gap: 14,
    padding: 12,
    background: 'var(--paper)',
    borderRadius: 14,
    border: '1px solid var(--line-2)',
    cursor: 'pointer'
  }}>
  
    <RoomPhoto
    roomId={room.id}
    tint={room.photoTint}
    label={room.id}
    style={{ width: 92, height: 92, flexShrink: 0 }} />
  
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span className="serif" style={{ fontSize: 20, lineHeight: 1.1 }}>{room.name}</span>
          {!available && <span className="tag tag-clay" style={{ flexShrink: 0 }}>occupée</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {room.beds}
          <span className="dot-sep" />
          {room.capacity} {room.capacity > 1 ? 'pers.' : 'pers.'}
          <span className="dot-sep" />
          {room.area} m²
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="label">{roomLocation(room)}</span>
        <span style={{ fontSize: 13 }}>
          <span className="serif" style={{ fontSize: 18 }}>{room.pricePerPerson}€</span>
          <span style={{ color: 'var(--muted)', fontSize: 11 }}> /pers./nuit</span>
        </span>
      </div>
    </div>
  </div>;


// Helpers for dates
const fmtRange = (start, end) => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()} – ${e.getDate()} ${months[s.getMonth()]}`;
  }
  return `${s.getDate()} ${months[s.getMonth()].slice(0, 4)}. – ${e.getDate()} ${months[e.getMonth()].slice(0, 4)}.`;
};

const nightsBetween = (start, end) => {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e - s) / 86400000);
};

const isoDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
};

const isRoomBookedOn = (roomId, isoDay) => {
  return BOOKINGS.some((b) => b.roomId === roomId && b.start <= isoDay && isoDay < b.end);
};

const isRoomBookedInRange = (roomId, start, end) => {
  // returns true if any night between start (incl) and end (excl) is booked
  return BOOKINGS.some((b) => b.roomId === roomId && !(b.end <= start || b.start >= end));
};

// Initials
const initials = (name) => {
  return name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
};

// Formatted location: "Aile gauche · 1ᵉʳ étage"
const floorLabel = (f) => f === 0 ? 'rez-de-chaussée' : f === 1 ? '1ᵉʳ étage' : `${f}ᵉ étage`;
const roomLocation = (room) => {
  const parts = [];
  if (room.wing) parts.push(room.wing);
  parts.push(floorLabel(room.floor || 0));
  return parts.join(' · ');
};

Object.assign(window, {
  ClayDate, PhotoFrame, RoomPhoto, TopBar, TabBar, Stepper, RoomCard,
  fmtRange, nightsBetween, isoDate, isRoomBookedOn, isRoomBookedInRange, initials,
  floorLabel, roomLocation,
  SidebarNav,
});

// ─────────────────────────────────────────────────────────────
// Confirm dialog — centered modal that never collides with sticky
// CTAs. Closes on backdrop click and Esc.
// ─────────────────────────────────────────────────────────────
function ConfirmDialog({
  open, title, body, warning,
  confirmLabel = 'Confirmer', cancelLabel = 'Annuler',
  onConfirm, onCancel, danger = false,
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onCancel && onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="serif" style={{fontSize:24,lineHeight:1.15,marginBottom:8}}>
          {title}
        </div>
        {body && (
          <div style={{fontSize:14,color:'var(--ink-2)',lineHeight:1.5,marginTop:6}}>
            {body}
          </div>
        )}
        {warning && (
          <div className="modal-warning">⚠ {warning}</div>
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} style={{flex:1}}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'btn btn-clay' : 'btn btn-primary'}
            onClick={onConfirm}
            style={{flex:1}}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Toast — transient notification anchored at top of viewport.
// ─────────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const isError = toast.kind === 'error';
  return (
    <div className={`toast ${isError ? 'toast-error' : 'toast-success'}`}>
      <span style={{flex:1}}>
        {isError ? '⚠ ' : '✓ '}{toast.msg}
      </span>
      <button onClick={onDismiss} className="toast-close" aria-label="fermer">×</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Nav icons — shared by TabBar and SidebarNav. All use currentColor
// so styling responds to the host element's text color.
// ─────────────────────────────────────────────────────────────
function NavIcon({ kind }) {
  switch (kind) {
    case 'home':return (
        <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-7h-6v7H5a1 1 0 01-1-1v-9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>);

    case 'rooms':return (
        <svg viewBox="0 0 24 24" fill="none">
        <rect x="3" y="6" width="18" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3 12h18M9 6v13M15 6v13" stroke="currentColor" strokeWidth="1.4" />
      </svg>);

    case 'cal':return (
        <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>);

    case 'me':return (
        <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M5 20c1.5-4 4-6 7-6s5.5 2 7 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>);

    case 'dashboard':return (
        <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      </svg>);

    case 'bookings':return (
        <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M3.5 10h17M8 3v4M16 3v4M7 14h6M7 17h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>);

    case 'lieu':return (
        <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 10l8-6 8 6v10a1 1 0 01-1 1H5a1 1 0 01-1-1V10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 21V14h6v7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>);

    case 'exit':return (
        <svg viewBox="0 0 24 24" fill="none">
        <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>);

    case 'admin':return (
        <svg viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>);

    default:return null;
  }
}

// ─────────────────────────────────────────────────────────────
// SidebarNav — vertical navigation for tablet (icon rail) + desktop
// (full labels). Hidden on mobile via CSS; the existing TabBar takes
// over there.
// ─────────────────────────────────────────────────────────────
function SidebarNav({ brand, items, activeKey, footer }) {
  return (
    <nav className="sidebar" aria-label="Navigation">
      <div className="sidebar-header">
        {brand?.label && <div className="sidebar-brand-label">{brand.label}</div>}
        {brand?.name && <div className="sidebar-brand-name">{brand.name}</div>}
      </div>
      <div className="sidebar-nav">
        {items.map((it) => {
          const active = activeKey === it.key;
          return (
            <button
              key={it.key}
              onClick={it.onClick}
              className={`sidebar-item ${active ? 'active' : ''}`}
              title={it.label}
              type="button"
              style={it.tone === 'accent' && !active ? { color: 'var(--terracotta)' } : undefined}>
              
              <span className="sidebar-icon"><NavIcon kind={it.icon} /></span>
              <span className="sidebar-label">{it.label}</span>
            </button>);

        })}
      </div>
      {footer &&
      <div className="sidebar-footer">
          {footer.map((it) =>
        <button
          key={it.key}
          onClick={it.onClick}
          className="sidebar-item"
          title={it.label}
          type="button"
          style={it.tone === 'accent' ? { color: 'var(--terracotta)' } : undefined}>
          
              <span className="sidebar-icon"><NavIcon kind={it.icon} /></span>
              <span className="sidebar-label">{it.label}</span>
            </button>
        )}
        </div>
      }
    </nav>);

}

// Re-export the late-defined dialogs so they're on the global scope.
Object.assign(window, { ConfirmDialog, Toast });