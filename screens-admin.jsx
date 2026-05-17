// Admin section — full CRUD on bookings & rooms

// Available photo tints — for the room form
const PHOTO_TINTS = ['rosé','rouge','vert','ocre','bleu','pêche','gris','bois','pierre','lin','nuit','mousse'];

// ─────────────────────────────────────────────────────────────
// Top bar for admin
// ─────────────────────────────────────────────────────────────
const AdminTopBar = ({ title, onBack, right }) => (
  <div className="topbar">
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="retour">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L4 7l5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
      {title && (
        <div style={{display:'flex',flexDirection:'column'}}>
          <span className="label" style={{lineHeight:1,color:'var(--terracotta)'}}>Administration</span>
          <span className="serif" style={{fontSize:22,lineHeight:1.1}}>{title}</span>
        </div>
      )}
    </div>
    <div style={{display:'flex',gap:8}}>{right}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Admin tab bar
// ─────────────────────────────────────────────────────────────
const AdminTabBar = ({ tab, onTab, onExit }) => {
  const tabs = [
    {key:'dashboard', label:'Tableau',     icon:'dashboard'},
    {key:'bookings',  label:'Réservations',icon:'bookings'},
    {key:'lieu',      label:'Lieu',        icon:'lieu'},
  ];
  const Icon = ({ kind, on }) => {
    const c = on ? 'var(--terracotta)' : 'var(--muted)';
    if (kind === 'dashboard') return (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke={c} strokeWidth="1.6"/>
        <rect x="13.5" y="3.5" width="7" height="7" rx="1" stroke={c} strokeWidth="1.6"/>
        <rect x="3.5" y="13.5" width="7" height="7" rx="1" stroke={c} strokeWidth="1.6"/>
        <rect x="13.5" y="13.5" width="7" height="7" rx="1" stroke={c} strokeWidth="1.6"/>
      </svg>
    );
    if (kind === 'bookings') return (
      <svg viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5.5" width="17" height="15" rx="2" stroke={c} strokeWidth="1.6"/>
        <path d="M3.5 10h17M8 3v4M16 3v4M7 14h6M7 17h4" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
    if (kind === 'lieu') return (
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M4 10l8-6 8 6v10a1 1 0 01-1 1H5a1 1 0 01-1-1V10z" stroke={c} strokeWidth="1.6" strokeLinejoin="round"/>
        <path d="M9 21V14h6v7" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    );
  };
  return (
    <nav className="tabbar" style={{borderTop:'1px solid var(--line)'}}>
      {tabs.map(t => (
        <button
          key={t.key}
          className={`tab ${tab === t.key ? 'active' : ''}`}
          onClick={() => onTab(t.key)}
          style={tab === t.key ? {color:'var(--terracotta)'} : {}}
        >
          <Icon kind={t.icon} on={tab === t.key} />
          <span>{t.label}</span>
        </button>
      ))}
      <button className="tab" onClick={onExit}>
        <svg viewBox="0 0 24 24" fill="none" style={{width:22,height:22}}>
          <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4M10 16l-4-4 4-4M6 12h12" stroke="var(--muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span>Sortie</span>
      </button>
    </nav>
  );
};

// ─────────────────────────────────────────────────────────────
// Dashboard
// ─────────────────────────────────────────────────────────────
const AdminDashboard = ({ onGoBookings, onGoRooms, onOpenBooking, onNewBooking, onNewRoom }) => {
  useStoreSubscribe();

  const todayIso = isoDate(TODAY);
  const upcoming = BOOKINGS.filter(b => b.end > todayIso).sort((a,b) => a.start.localeCompare(b.start));
  const today = BOOKINGS.filter(b => b.start <= todayIso && b.end > todayIso);
  const nextWeek = (() => {
    const wkEnd = new Date(TODAY); wkEnd.setDate(wkEnd.getDate() + 7);
    return BOOKINGS.filter(b => b.start <= isoDate(wkEnd) && b.end > todayIso);
  })();

  // Revenue indicator total upcoming
  const totalUpcoming = upcoming.reduce((acc, b) => {
    const room = ROOMS.find(r => r.id === b.roomId);
    if (!room) return acc;
    return acc + nightsBetween(b.start, b.end) * b.people * room.pricePerPerson;
  }, 0);

  return (
    <div className="page">
      <AdminTopBar
        title="Tableau de bord"
        right={
          <div className="icon-btn" style={{
            background:'var(--terracotta)',color:'var(--bg)',
            fontFamily:'var(--mono)',fontSize:10,fontWeight:600,letterSpacing:'0.08em',
          }}>
            ADM
          </div>
        }
      />

      <div style={{padding:'0 20px 18px'}}>
        <div className="serif-it" style={{fontSize:16,color:'var(--muted)',lineHeight:1.4}}>
          La maison en un coup d'œil.
        </div>
      </div>

      {/* KPIs */}
      <div style={{padding:'0 16px 18px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <Kpi big={today.length} label="à la maison aujourd'hui" />
        <Kpi big={nextWeek.length} label="séjours cette semaine" />
        <Kpi big={ROOMS.length} label="chambres au catalogue" />
        <Kpi big={`${totalUpcoming}€`} label="à venir, indicatif" small />
      </div>

      {/* Quick actions */}
      <div style={{padding:'0 16px 18px',display:'flex',gap:10}}>
        <button className="btn btn-primary" onClick={onNewBooking} style={{flex:1}}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          Nouvelle résa
        </button>
        <button className="btn btn-ghost" onClick={onNewRoom} style={{flex:1}}>
          + Chambre
        </button>
      </div>

      {/* Prochaines arrivées */}
      <div style={{padding:'0 20px 10px',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
        <span className="label">Prochaines arrivées</span>
        <button
          onClick={onGoBookings}
          style={{background:'none',border:'none',padding:0,color:'var(--terracotta)',fontSize:12,cursor:'pointer'}}
        >
          Tout voir →
        </button>
      </div>
      <div style={{padding:'0 16px 18px'}}>
        <div className="card" style={{padding:'2px 0'}}>
          {upcoming.slice(0, 6).map(b => {
            const room = ROOMS.find(r => r.id === b.roomId);
            if (!room) return null;
            const isToday = b.start === todayIso;
            return (
              <div
                key={b.id}
                className="row-tap"
                onClick={() => onOpenBooking(b)}
              >
                <div style={{
                  width:42, textAlign:'center', marginRight:12,
                  borderRight:'1px solid var(--line-2)', paddingRight:8,
                }}>
                  <ClayDate d={b.start} />
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {b.name} {isToday && <span className="tag tag-clay" style={{marginLeft:6,fontSize:9,padding:'1px 6px'}}>auj.</span>}
                  </div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                    {room.name} <span className="dot-sep" /> {nightsBetween(b.start, b.end)} nuits <span className="dot-sep" /> {b.people} pers.
                  </div>
                </div>
                <svg width="8" height="14" viewBox="0 0 8 14" style={{flexShrink:0}}>
                  <path d="M1 1l6 6-6 6" stroke="var(--muted)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            );
          })}
          {upcoming.length === 0 && (
            <div style={{padding:'24px 16px',textAlign:'center'}}>
              <div className="serif-it" style={{color:'var(--muted)'}}>Aucune arrivée à venir.</div>
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div style={{padding:'0 16px 30px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <AdminTile
          icon="bookings"
          title="Réservations"
          value={`${BOOKINGS.length}`}
          onClick={onGoBookings}
        />
        <AdminTile
          icon="rooms"
          title="Chambres"
          value={`${ROOMS.length}`}
          onClick={onGoRooms}
        />
      </div>
    </div>
  );
};

const Kpi = ({ big, label, small }) => (
  <div style={{
    background:'var(--paper)',
    border:'1px solid var(--line-2)',
    borderRadius:14,
    padding:'14px 14px 12px',
  }}>
    <div className="serif" style={{fontSize: small ? 22 : 32, lineHeight:1}}>{big}</div>
    <div className="mono" style={{fontSize:9,color:'var(--muted)',letterSpacing:'0.12em',textTransform:'uppercase',marginTop:8,lineHeight:1.3}}>
      {label}
    </div>
  </div>
);

const AdminTile = ({ title, value, onClick, icon }) => (
  <div
    onClick={onClick}
    style={{
      background:'var(--paper)',
      border:'1px solid var(--line-2)',
      borderRadius:14,
      padding:'16px 16px',
      cursor:'pointer',
      display:'flex',flexDirection:'column',justifyContent:'space-between',
      minHeight:100,
    }}
  >
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
      <span className="label">{title}</span>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 11L11 3M5 3h6v6" stroke="var(--terracotta)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
    <div className="serif" style={{fontSize:36,lineHeight:1}}>{value}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// All bookings (admin list)
// ─────────────────────────────────────────────────────────────
const AdminBookingsScreen = ({ onOpenBooking, onNewBooking }) => {
  useStoreSubscribe();
  const [filter, setFilter] = React.useState('upcoming');
  const [search, setSearch] = React.useState('');

  const todayIso = isoDate(TODAY);
  let list = BOOKINGS.slice();
  if (filter === 'upcoming') list = list.filter(b => b.end > todayIso);
  if (filter === 'past')     list = list.filter(b => b.end <= todayIso);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(b => {
      const room = ROOMS.find(r => r.id === b.roomId);
      return b.name.toLowerCase().includes(q) || (room && room.name.toLowerCase().includes(q));
    });
  }
  list = list.sort((a, b) => a.start.localeCompare(b.start));

  // Group by month
  const groups = {};
  list.forEach(b => {
    const d = new Date(b.start + 'T00:00:00');
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    groups[key] = groups[key] || [];
    groups[key].push(b);
  });
  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  return (
    <div className="page">
      <AdminTopBar
        title="Réservations"
        right={
          <button
            className="icon-btn"
            onClick={onNewBooking}
            style={{background:'var(--terracotta)',color:'#FBF7F0',border:'none'}}
            aria-label="nouvelle"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        }
      />

      <div style={{padding:'0 16px 12px'}}>
        <div style={{position:'relative'}}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{position:'absolute',left:13,top:14}}>
            <circle cx="6" cy="6" r="4" stroke="var(--muted)" strokeWidth="1.5"/>
            <path d="M9 9l3 3" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Chercher par nom ou chambre"
            style={{paddingLeft:36}}
          />
        </div>
      </div>

      <div className="no-scrollbar" style={{display:'flex',gap:8,padding:'4px 16px 16px',overflowX:'auto'}}>
        {[
          {k:'upcoming', l:'À venir'},
          {k:'past',     l:'Passées'},
          {k:'all',      l:'Toutes'},
        ].map(f => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            style={{
              flexShrink:0,padding:'8px 14px',borderRadius:999,
              fontSize:13,fontFamily:'var(--sans)',
              border:'1px solid '+(filter===f.k?'var(--ink)':'var(--line)'),
              background: filter===f.k?'var(--ink)':'var(--paper)',
              color: filter===f.k?'var(--bg)':'var(--ink)',
              cursor:'pointer',
            }}
          >{f.l}</button>
        ))}
      </div>

      {list.length === 0 && (
        <div style={{padding:'40px 20px',textAlign:'center'}}>
          <div className="serif-it" style={{fontSize:16,color:'var(--muted)'}}>
            Aucune réservation.
          </div>
        </div>
      )}

      {Object.entries(groups).map(([key, items]) => {
        const [y, m] = key.split('-');
        const title = `${monthNames[parseInt(m,10) - 1]} ${y}`;
        return (
          <div key={key} style={{padding:'0 16px 14px'}}>
            <div className="label" style={{padding:'2px 4px 10px'}}>{title}</div>
            <div className="card" style={{padding:'2px 0'}}>
              {items.map(b => {
                const room = ROOMS.find(r => r.id === b.roomId);
                if (!room) return null;
                const nights = nightsBetween(b.start, b.end);
                const total = nights * b.people * room.pricePerPerson;
                return (
                  <div
                    key={b.id}
                    className="row-tap"
                    onClick={() => onOpenBooking(b)}
                  >
                    <div className="avatar" style={{
                      width:34,height:34,marginRight:12,fontSize:11,
                      background:'var(--sage-soft)',color:'#4A5B3E',
                    }}>{initials(b.name)}</div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:500,lineHeight:1.2}}>{b.name}</div>
                      <div style={{fontSize:11,color:'var(--muted)',marginTop:3}}>
                        {room.name} <span className="dot-sep" /> {fmtRange(b.start, b.end)} <span className="dot-sep" /> {b.people} pers.
                      </div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0,marginLeft:6}}>
                      <div className="serif" style={{fontSize:16}}>{total}€</div>
                      <div className="mono" style={{fontSize:9,color:'var(--muted)'}}>{nights}n</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Edit/new booking (admin) — full power
// ─────────────────────────────────────────────────────────────
const AdminEditBookingScreen = ({ booking, onSave, onDelete, onBack }) => {
  const isNew = !booking || !booking.id;
  const [form, setForm] = React.useState(() => booking ? {...booking} : {
    id: 'b-' + Date.now(),
    roomId: ROOMS[0]?.id,
    name: '',
    start: null, end: null,
    people: 1,
    notes: '',
  });
  const [confirmDel, setConfirmDel] = React.useState(false);

  const room = ROOMS.find(r => r.id === form.roomId);
  const nights = form.start && form.end ? nightsBetween(form.start, form.end) : 0;
  const total = room ? nights * form.people * room.pricePerPerson : 0;

  // Conflict detection (other bookings same room)
  const conflicts = form.start && form.end && BOOKINGS.some(b =>
    b.roomId === form.roomId &&
    b.id !== form.id &&
    !(b.end <= form.start || b.start >= form.end)
  );

  const canSave = form.name.trim() && form.start && form.end && form.roomId && form.people > 0 && !conflicts;

  return (
    <div className="page">
      <AdminTopBar
        title={isNew ? 'Nouvelle réservation' : 'Modifier la résa'}
        onBack={onBack}
      />

      {/* Name */}
      <div style={{padding:'0 16px 16px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Au nom de</div>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm(f => ({...f, name: e.target.value}))}
          placeholder="Prénom + nom, ou « Famille X »"
        />
      </div>

      {/* Room picker */}
      <div style={{padding:'0 16px 16px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Chambre</div>
        <select
          className="input"
          value={form.roomId}
          onChange={(e) => {
            const r = ROOMS.find(x => x.id === e.target.value);
            const nextPeople = Math.min(form.people, r?.capacity || 1);
            setForm(f => ({...f, roomId: e.target.value, people: nextPeople}));
          }}
          style={{appearance:'none',WebkitAppearance:'none',backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%238A7D6B\' stroke-width=\'1.5\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',backgroundRepeat:'no-repeat',backgroundPosition:'right 14px center',paddingRight:36}}
        >
          {ROOMS.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} — {r.capacity} pers., {r.pricePerPerson}€/pers./nuit
            </option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <div style={{padding:'0 16px 16px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Dates</div>
        <AdminDateRangePicker
          value={{start: form.start, end: form.end}}
          onChange={(v) => setForm(f => ({...f, start: v.start, end: v.end}))}
        />
        {conflicts && (
          <div style={{
            marginTop:10,padding:'10px 14px',
            background:'rgba(176,90,60,0.10)',
            border:'1px solid rgba(176,90,60,0.30)',
            borderRadius:10,
            fontSize:13,color:'var(--terracotta)',lineHeight:1.4,
          }}>
            ⚠ {room?.name} est déjà réservée sur une partie de ces dates.
          </div>
        )}
      </div>

      {/* People */}
      <div style={{padding:'0 16px 16px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Nombre de personnes</div>
        <div style={{
          background:'var(--paper)',
          borderRadius:14,
          padding:'14px 16px',
          border:'1px solid var(--line-2)',
          display:'flex',justifyContent:'space-between',alignItems:'center',
        }}>
          <div>
            <div className="serif" style={{fontSize:24,lineHeight:1}}>{form.people}</div>
            <div className="mono" style={{fontSize:10,color:'var(--muted)',letterSpacing:'0.12em',marginTop:4}}>
              MAX {room?.capacity || 1}
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button
              onClick={() => setForm(f => ({...f, people: Math.max(1, f.people - 1)}))}
              className="icon-btn"
              style={{width:40,height:40}}
            ><span style={{fontSize:18,lineHeight:1}}>−</span></button>
            <button
              onClick={() => setForm(f => ({...f, people: Math.min(room?.capacity || 1, f.people + 1)}))}
              className="icon-btn"
              style={{width:40,height:40,background:'var(--ink)',color:'var(--bg)',border:'none'}}
            ><span style={{fontSize:18,lineHeight:1}}>+</span></button>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div style={{padding:'0 16px 16px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Note interne</div>
        <textarea
          className="input"
          value={form.notes || ''}
          onChange={(e) => setForm(f => ({...f, notes: e.target.value}))}
          placeholder="Heure d'arrivée, demandes particulières…"
          style={{minHeight:80,fontFamily:'var(--sans)'}}
        />
      </div>

      {/* Showback */}
      {nights > 0 && (
        <div style={{padding:'4px 16px 14px'}}>
          <div style={{
            background:'var(--paper)',
            borderRadius:14,
            padding:'14px 16px',
            border:'1px solid var(--line-2)',
            display:'flex',justifyContent:'space-between',alignItems:'baseline',
          }}>
            <div>
              <div className="label" style={{marginBottom:3}}>Prix indicatif</div>
              <div className="serif-it" style={{fontSize:12,color:'var(--muted)'}}>
                {form.people} × {nights}n × {room?.pricePerPerson}€
              </div>
            </div>
            <div className="serif" style={{fontSize:28,lineHeight:1}}>{total}€</div>
          </div>
        </div>
      )}

      {/* Delete */}
      {!isNew && (
        <div style={{padding:'8px 16px 0'}}>
          <button
            onClick={() => setConfirmDel(true)}
            style={{
              width:'100%',padding:'12px',borderRadius:10,
              background:'transparent',color:'var(--terracotta)',
              border:'1px solid rgba(176,90,60,0.4)',
              fontFamily:'var(--sans)',fontSize:13,cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M5 4V2.5h4V4M3.5 4l.7 8.2a1 1 0 001 .8h3.6a1 1 0 001-.8L10.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Supprimer la réservation
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        title="Supprimer la réservation ?"
        body={`La réservation de ${form.name || '—'} pour ${room?.name || 'cette chambre'} sera retirée. Cette action est définitive.`}
        confirmLabel="Supprimer"
        cancelLabel="Garder"
        danger
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => { setConfirmDel(false); onDelete(form.id); }}
      />

      {/* Save bar */}
      <div className="page-actions">
        <button className="btn btn-ghost" onClick={onBack} style={{flex:'0 0 auto'}}>Annuler</button>
        <button
          className="btn btn-clay"
          disabled={!canSave}
          onClick={() => onSave(form)}
          style={{
            flex:1,
            opacity: canSave ? 1 : 0.4,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {isNew ? 'Créer la réservation' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
};

// Wrap MiniCal but allow any future date, no past restriction
const AdminDateRangePicker = ({ value, onChange }) => (
  <MiniCal value={value} onChange={onChange} />
);

// ─────────────────────────────────────────────────────────────
// Lieu — Chambres + Maison config (sub-tabs)
// ─────────────────────────────────────────────────────────────
const AdminLieuScreen = ({ initialTab = 'rooms', onOpenRoom, onNewRoom }) => {
  const [tab, setTab] = React.useState(initialTab);
  return (
    <div className="page">
      <AdminTopBar
        title="Lieu"
        right={tab === 'rooms' ? (
          <button
            className="icon-btn"
            onClick={onNewRoom}
            style={{background:'var(--terracotta)',color:'#FBF7F0',border:'none'}}
            aria-label="nouvelle chambre"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        ) : null}
      />

      {/* Sub-tabs */}
      <div style={{padding:'0 16px 18px'}}>
        <div style={{
          display:'flex',
          background:'var(--paper-2)',
          padding:4,
          borderRadius:12,
          border:'1px solid var(--line-2)',
        }}>
          {[
            {k:'rooms', l:'Chambres', count: ROOMS.length},
            {k:'house', l:'Maison',   count: null},
          ].map(s => (
            <button
              key={s.k}
              onClick={() => setTab(s.k)}
              style={{
                flex:1,
                padding:'10px 12px',
                border:'none',
                borderRadius:8,
                cursor:'pointer',
                background: tab === s.k ? 'var(--paper)' : 'transparent',
                boxShadow: tab === s.k ? '0 1px 3px rgba(42,34,24,0.08)' : 'none',
                fontFamily:'var(--sans)',
                fontSize:13,
                color: tab === s.k ? 'var(--ink)' : 'var(--muted)',
                fontWeight: tab === s.k ? 500 : 400,
                display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              }}
            >
              {s.l}
              {s.count != null && (
                <span style={{
                  fontFamily:'var(--mono)',fontSize:10,
                  color: tab === s.k ? 'var(--terracotta)' : 'var(--muted)',
                  opacity: 0.85,
                }}>{s.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'rooms' && <AdminRoomsList onOpenRoom={onOpenRoom} onNewRoom={onNewRoom} />}
      {tab === 'house' && <AdminHouseConfig />}
    </div>
  );
};

// Room list (formerly AdminRoomsScreen body) — now a section inside Lieu
const AdminRoomsList = ({ onOpenRoom, onNewRoom }) => {
  useStoreSubscribe();
  return (
    <>
      <div style={{padding:'0 20px 14px'}}>
        <div className="serif-it" style={{fontSize:14,color:'var(--muted)',lineHeight:1.4}}>
          {ROOMS.length} chambres au catalogue. Touche une chambre pour la modifier.
        </div>
      </div>

      <div style={{padding:'0 16px',display:'flex',flexDirection:'column',gap:10}}>
        {ROOMS.map(r => {
          const futureBookings = BOOKINGS.filter(b => b.roomId === r.id && b.end > isoDate(TODAY)).length;
          return (
            <div
              key={r.id}
              onClick={() => onOpenRoom(r)}
              style={{
                display:'flex',gap:12,padding:12,
                background:'var(--paper)',borderRadius:14,
                border:'1px solid var(--line-2)',cursor:'pointer',
              }}
            >
              <RoomPhoto
                roomId={r.id}
                tint={r.photoTint}
                label={r.id}
                style={{width:72,height:72,flexShrink:0}}
              />
              <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'space-between',minWidth:0}}>
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                    <span className="serif" style={{fontSize:19}}>{r.name}</span>
                    <span style={{fontSize:13}}>
                      <span className="serif" style={{fontSize:16}}>{r.pricePerPerson}€</span>
                      <span style={{color:'var(--muted)',fontSize:10}}> /pers.</span>
                    </span>
                  </div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:3}}>
                    {r.beds} <span className="dot-sep"/> {r.capacity}p <span className="dot-sep"/> {r.area}m²
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span className="label" style={{fontSize:9}}>
                    {roomLocation(r)}
                  </span>
                  {futureBookings > 0 && (
                    <span className="tag tag-sage" style={{fontSize:10,padding:'1px 8px'}}>
                      {futureBookings} résa{futureBookings>1?'s':''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{padding:'18px 16px 0'}}>
        <button className="btn btn-ghost" onClick={onNewRoom} style={{width:'100%'}}>
          + Ajouter une chambre
        </button>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// Maison — configuration of the house
// ─────────────────────────────────────────────────────────────
const AdminHouseConfig = () => {
  useStoreSubscribe();
  const [hc, setHc] = React.useState({
    name: HOUSE_CONFIG.name,
    region: HOUSE_CONFIG.region,
    address: HOUSE_CONFIG.address,
    welcomeNote: HOUSE_CONFIG.welcomeNote,
  });

  // Save scalar fields back to store on blur
  const saveField = (key) => () => setHouseField(key, hc[key]);

  return (
    <>
      <div style={{padding:'0 20px 14px'}}>
        <div className="serif-it" style={{fontSize:14,color:'var(--muted)',lineHeight:1.4}}>
          Réglages de la maison et listes utilisées dans les fiches de chambres.
        </div>
      </div>

      {/* House identity */}
      <ConfigSection label="Identité">
        <FieldRow label="Nom de la maison">
          <input
            className="input"
            value={hc.name}
            onChange={(e) => setHc(h => ({...h, name: e.target.value}))}
            onBlur={saveField('name')}
            placeholder="Le Clos Bon Accueil"
          />
        </FieldRow>
        <FieldRow label="Région">
          <input
            className="input"
            value={hc.region}
            onChange={(e) => setHc(h => ({...h, region: e.target.value}))}
            onBlur={saveField('region')}
            placeholder="Normandie"
          />
        </FieldRow>
        <FieldRow label="Adresse (privée)">
          <input
            className="input"
            value={hc.address}
            onChange={(e) => setHc(h => ({...h, address: e.target.value}))}
            onBlur={saveField('address')}
            placeholder="5 chemin du Verger…"
          />
        </FieldRow>
        <FieldRow label="Mot d'accueil">
          <textarea
            className="input"
            value={hc.welcomeNote}
            onChange={(e) => setHc(h => ({...h, welcomeNote: e.target.value}))}
            onBlur={saveField('welcomeNote')}
            placeholder="Quelques mots qui apparaîtront sur l'accueil…"
            style={{minHeight:80,fontFamily:'var(--sans)'}}
          />
        </FieldRow>
      </ConfigSection>

      {/* Wings list */}
      <ConfigSection
        label="Parties de la maison"
        sub="Les options proposées quand on configure une chambre."
      >
        <ListEditor
          listKey="wings"
          values={HOUSE_CONFIG.wings}
          placeholder="Aile sud, Grenier…"
        />
      </ConfigSection>

      {/* Equipment suggestions */}
      <ConfigSection
        label="Équipements proposés"
        sub="Suggestions cliquables dans la fiche d'une chambre."
      >
        <ListEditor
          listKey="equipmentSuggestions"
          values={HOUSE_CONFIG.equipmentSuggestions}
          placeholder="Cheminée, Velux…"
        />
      </ConfigSection>

      {/* Linen suggestions */}
      <ConfigSection
        label="Linge de maison proposé"
        sub="Suggestions cliquables dans la fiche d'une chambre."
      >
        <ListEditor
          listKey="linenSuggestions"
          values={HOUSE_CONFIG.linenSuggestions}
          placeholder="Drap de bain, Tapis de bain…"
        />
      </ConfigSection>

      <div style={{height:30}} />
    </>
  );
};

const ConfigSection = ({ label, sub, children }) => (
  <div style={{padding:'0 16px 20px'}}>
    <div className="label" style={{padding:'0 4px 4px'}}>{label}</div>
    {sub && <div className="serif-it" style={{fontSize:12,color:'var(--muted)',padding:'0 4px 10px',lineHeight:1.4}}>{sub}</div>}
    <div className="card" style={{padding:14,display:'flex',flexDirection:'column',gap:12}}>
      {children}
    </div>
  </div>
);

const FieldRow = ({ label, children }) => (
  <div>
    <div className="mono" style={{fontSize:9,color:'var(--muted)',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:6}}>
      {label}
    </div>
    {children}
  </div>
);

// Inline chip list — add/remove from a HOUSE_CONFIG list by key
const ListEditor = ({ listKey, values, placeholder }) => {
  const [draft, setDraft] = React.useState('');

  return (
    <div>
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
        {values.map(v => (
          <span key={v} className="tag" style={{paddingRight:4}}>
            {v}
            <button
              onClick={() => removeFromHouseList(listKey, v)}
              style={{background:'none',border:'none',cursor:'pointer',padding:'0 4px',marginLeft:2,color:'var(--muted)',fontSize:14,lineHeight:1}}
              aria-label={`retirer ${v}`}
            >×</button>
          </span>
        ))}
        {values.length === 0 && (
          <span className="serif-it" style={{fontSize:13,color:'var(--muted)'}}>Liste vide.</span>
        )}
      </div>
      <div style={{display:'flex',gap:8}}>
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addToHouseList(listKey, draft);
              setDraft('');
            }
          }}
          style={{flex:1}}
        />
        <button
          className="btn btn-ghost"
          onClick={() => { addToHouseList(listKey, draft); setDraft(''); }}
          style={{padding:'10px 14px',fontSize:13}}
        >+</button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// (Legacy) standalone admin rooms screen — kept for fallback routes
// ─────────────────────────────────────────────────────────────
const AdminRoomsScreen = ({ onOpenRoom, onNewRoom }) => (
  <AdminLieuScreen initialTab="rooms" onOpenRoom={onOpenRoom} onNewRoom={onNewRoom} />
);

// ─────────────────────────────────────────────────────────────
// Edit/new room
// ─────────────────────────────────────────────────────────────
const AdminEditRoomScreen = ({ room, onSave, onDelete, onBack }) => {
  const isNew = !room || !room.id;
  const [form, setForm] = React.useState(() => room ? {
    ...room,
    equipment: [...(room.equipment || [])],
    linen: [...(room.linen || [])],
  } : {
    id: 'room-' + Date.now(),
    name: '',
    wing: 'Bâtiment principal',
    floor: 0, area: 15, capacity: 2,
    beds: '1 lit double',
    closet: '',
    equipment: [],
    linen: ['Draps fournis','Couette + oreillers','Serviettes de bain','Serviette de toilette'],
    pricePerPerson: 25,
    photoTint: 'lin',
    blurb: '',
  });
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [newEquip, setNewEquip] = React.useState('');
  const [newLinen, setNewLinen] = React.useState('');

  const canSave = form.name.trim() && form.beds.trim() && form.capacity > 0;

  const futureBookingsCount = !isNew
    ? BOOKINGS.filter(b => b.roomId === form.id && b.end > isoDate(TODAY)).length
    : 0;

  const addEquip = (val) => {
    val = (val || '').trim();
    if (!val) return;
    setForm(f => ({...f, equipment: [...f.equipment, val]}));
    setNewEquip('');
  };
  const removeEquip = (i) => setForm(f => ({...f, equipment: f.equipment.filter((_, idx) => idx !== i)}));

  const addLinen = (val) => {
    val = (val || '').trim();
    if (!val) return;
    setForm(f => ({...f, linen: [...f.linen, val]}));
    setNewLinen('');
  };
  const removeLinen = (i) => setForm(f => ({...f, linen: f.linen.filter((_, idx) => idx !== i)}));

  return (
    <div className="page">
      <AdminTopBar
        title={isNew ? 'Nouvelle chambre' : 'Modifier la chambre'}
        onBack={onBack}
      />

      {/* Photo preview + tint picker */}
      <div style={{padding:'0 16px 14px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Photo de la chambre</div>
        <RoomPhoto
          roomId={form.id}
          tint={form.photoTint}
          label={form.name || 'aperçu'}
          placeholder="Glissez une photo ici"
          style={{height:180}}
        />
        <div className="serif-it" style={{fontSize:12,color:'var(--muted)',marginTop:8,padding:'0 4px',lineHeight:1.4}}>
          Glissez une photo dans le cadre, ou choisissez une teinte par défaut ci-dessous.
        </div>
        <div className="no-scrollbar" style={{display:'flex',gap:6,marginTop:10,overflowX:'auto'}}>
          {PHOTO_TINTS.map(t => (
            <button
              key={t}
              onClick={() => setForm(f => ({...f, photoTint: t}))}
              className={`tint-${t}`}
              style={{
                width:34,height:34,borderRadius:10,flexShrink:0,
                border: '2px solid ' + (form.photoTint === t ? 'var(--ink)' : 'transparent'),
                cursor:'pointer',
              }}
              title={t}
            />
          ))}
        </div>
      </div>

      {/* Name */}
      <div style={{padding:'0 16px 14px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Nom de la chambre</div>
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm(f => ({...f, name: e.target.value}))}
          placeholder="La Glycine, Le Pigeonnier…"
        />
      </div>

      {/* Blurb */}
      <div style={{padding:'0 16px 14px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Une phrase de présentation</div>
        <textarea
          className="input"
          value={form.blurb}
          onChange={(e) => setForm(f => ({...f, blurb: e.target.value}))}
          placeholder="Petite chambre cosy au rez, sa porte donne sur la terrasse couverte."
          style={{minHeight:70,fontFamily:'var(--sans)'}}
        />
      </div>

      {/* Couchage / Capacité */}
      <div style={{padding:'0 16px 14px',display:'grid',gridTemplateColumns:'1fr 90px',gap:10}}>
        <div>
          <div className="label" style={{padding:'0 4px 8px'}}>Couchage</div>
          <input
            className="input"
            value={form.beds}
            onChange={(e) => setForm(f => ({...f, beds: e.target.value}))}
            placeholder="1 lit double"
          />
        </div>
        <div>
          <div className="label" style={{padding:'0 4px 8px'}}>Capacité</div>
          <input
            className="input"
            type="number" min="1" max="10"
            value={form.capacity}
            onChange={(e) => setForm(f => ({...f, capacity: parseInt(e.target.value,10) || 1}))}
          />
        </div>
      </div>

      {/* Wing (zone of the house) */}
      <div style={{padding:'0 16px 14px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Partie de la maison</div>
        <input
          className="input"
          value={form.wing || ''}
          onChange={(e) => setForm(f => ({...f, wing: e.target.value}))}
          placeholder="Aile gauche, Bâtiment principal…"
          list="wing-suggestions"
        />
        <datalist id="wing-suggestions">
          {HOUSE_CONFIG.wings.map(w => <option key={w} value={w} />)}
        </datalist>
        <div className="no-scrollbar" style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
          {HOUSE_CONFIG.wings.map(w => (
            <button
              key={w}
              onClick={() => setForm(f => ({...f, wing: w}))}
              style={{
                fontSize:11,padding:'4px 9px',borderRadius:999,
                border:'1px dashed var(--line)',
                background: form.wing === w ? 'var(--paper-2)' : 'transparent',
                color:'var(--muted)',cursor:'pointer',fontFamily:'var(--sans)',
              }}
            >{w}</button>
          ))}
        </div>
      </div>

      {/* Floor / Area / Price */}
      <div style={{padding:'0 16px 14px',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
        <div>
          <div className="label" style={{padding:'0 4px 8px'}}>Niveau</div>
          <select
            className="input"
            value={form.floor}
            onChange={(e) => setForm(f => ({...f, floor: parseInt(e.target.value,10)}))}
            style={{appearance:'none',WebkitAppearance:'none',paddingRight:24}}
          >
            <option value={0}>Rez</option>
            <option value={1}>1ᵉʳ étage</option>
          </select>
        </div>
        <div>
          <div className="label" style={{padding:'0 4px 8px'}}>Surface m²</div>
          <input
            className="input"
            type="number" min="5"
            value={form.area}
            onChange={(e) => setForm(f => ({...f, area: parseInt(e.target.value,10) || 0}))}
          />
        </div>
        <div>
          <div className="label" style={{padding:'0 4px 8px'}}>€/pers./nuit</div>
          <input
            className="input"
            type="number" min="0"
            value={form.pricePerPerson}
            onChange={(e) => setForm(f => ({...f, pricePerPerson: parseInt(e.target.value,10) || 0}))}
          />
        </div>
      </div>

      {/* Closet */}
      <div style={{padding:'0 16px 14px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Rangement</div>
        <input
          className="input"
          value={form.closet}
          onChange={(e) => setForm(f => ({...f, closet: e.target.value}))}
          placeholder="Armoire normande + commode"
        />
      </div>

      {/* Equipment chips */}
      <div style={{padding:'0 16px 14px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Équipement</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
          {form.equipment.map((e, i) => (
            <span
              key={i}
              className="tag"
              style={{paddingRight:4}}
            >
              {e}
              <button
                onClick={() => removeEquip(i)}
                style={{background:'none',border:'none',cursor:'pointer',padding:'0 4px',marginLeft:2,color:'var(--muted)',fontSize:14,lineHeight:1}}
              >×</button>
            </span>
          ))}
          {form.equipment.length === 0 && (
            <span className="serif-it" style={{fontSize:13,color:'var(--muted)'}}>Aucun pour l'instant.</span>
          )}
        </div>
        <ChipInput
          value={newEquip}
          onChange={setNewEquip}
          onAdd={() => addEquip(newEquip)}
          placeholder="Bureau, Vue jardin, Cheminée…"
          suggestions={HOUSE_CONFIG.equipmentSuggestions.filter(s => !form.equipment.includes(s))}
          onPickSuggestion={addEquip}
        />
      </div>

      {/* Linen chips */}
      <div style={{padding:'0 16px 14px'}}>
        <div className="label" style={{padding:'0 4px 8px',display:'flex',alignItems:'center',gap:6}}>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M2 4l5-2 5 2v2c0 1-1 2-3 2H5C3 8 2 7 2 6V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M5 8v4M9 8v4M3 12h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Linge fourni
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
          {form.linen.map((e, i) => (
            <span
              key={i}
              className="tag tag-sage"
              style={{paddingRight:4}}
            >
              {e}
              <button
                onClick={() => removeLinen(i)}
                style={{background:'none',border:'none',cursor:'pointer',padding:'0 4px',marginLeft:2,color:'#4A5B3E',fontSize:14,lineHeight:1}}
              >×</button>
            </span>
          ))}
          {form.linen.length === 0 && (
            <span className="serif-it" style={{fontSize:13,color:'var(--muted)'}}>Aucun pour l'instant.</span>
          )}
        </div>
        <ChipInput
          value={newLinen}
          onChange={setNewLinen}
          onAdd={() => addLinen(newLinen)}
          placeholder="Draps fournis, Serviettes…"
          suggestions={HOUSE_CONFIG.linenSuggestions.filter(s => !form.linen.includes(s))}
          onPickSuggestion={addLinen}
        />
      </div>

      {/* Delete */}
      {!isNew && (
        <div style={{padding:'8px 16px 0'}}>
          <button
            onClick={() => setConfirmDel(true)}
            style={{
              width:'100%',padding:'12px',borderRadius:10,
              background:'transparent',color:'var(--terracotta)',
              border:'1px solid rgba(176,90,60,0.4)',
              fontFamily:'var(--sans)',fontSize:13,cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',gap:8,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M5 4V2.5h4V4M3.5 4l.7 8.2a1 1 0 001 .8h3.6a1 1 0 001-.8L10.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Supprimer la chambre
          </button>
          {futureBookingsCount > 0 && (
            <div style={{
              marginTop:8,padding:'8px 4px',
              fontSize:11,color:'var(--muted)',
              lineHeight:1.4,textAlign:'center',
            }}>
              {futureBookingsCount} réservation{futureBookingsCount>1?'s':''} à venir sur cette chambre.
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDel}
        title={`Supprimer « ${form.name || 'cette chambre'} » ?`}
        body={
          futureBookingsCount > 0
            ? "Cette chambre est encore réservée. Si tu confirmes, toutes ses réservations à venir seront annulées."
            : "Cette chambre ne sera plus proposée à la réservation. Cette action est définitive."
        }
        warning={
          futureBookingsCount > 0
            ? `${futureBookingsCount} réservation${futureBookingsCount > 1 ? 's' : ''} à venir ser${futureBookingsCount > 1 ? 'ont' : 'a'} annulée${futureBookingsCount > 1 ? 's' : ''}.`
            : null
        }
        confirmLabel={futureBookingsCount > 0 ? 'Supprimer quand même' : 'Supprimer'}
        cancelLabel="Garder"
        danger
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => { setConfirmDel(false); onDelete(form.id); }}
      />

      {/* Save bar */}
      <div className="page-actions">
        <button className="btn btn-ghost" onClick={onBack} style={{flex:'0 0 auto'}}>Annuler</button>
        <button
          className="btn btn-clay"
          disabled={!canSave}
          onClick={() => onSave(form)}
          style={{
            flex:1,
            opacity: canSave ? 1 : 0.4,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {isNew ? 'Créer la chambre' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
};

// Helper: chip input row with quick suggestions
const ChipInput = ({ value, onChange, onAdd, placeholder, suggestions = [], onPickSuggestion }) => (
  <>
    <div style={{display:'flex',gap:8}}>
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
        style={{flex:1}}
      />
      <button
        className="btn btn-ghost"
        onClick={onAdd}
        style={{padding:'10px 14px',fontSize:13}}
      >+</button>
    </div>
    {suggestions.length > 0 && (
      <div className="no-scrollbar" style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:8}}>
        {suggestions.map(s => (
          <button
            key={s}
            onClick={() => onPickSuggestion(s)}
            style={{
              fontSize:11,padding:'4px 9px',borderRadius:999,
              border:'1px dashed var(--line)',background:'transparent',
              color:'var(--muted)',cursor:'pointer',fontFamily:'var(--sans)',
            }}
          >+ {s}</button>
        ))}
      </div>
    )}
  </>
);

Object.assign(window, {
  AdminDashboard, AdminBookingsScreen, AdminEditBookingScreen,
  AdminRoomsScreen, AdminLieuScreen, AdminRoomsList, AdminHouseConfig,
  AdminEditRoomScreen,
  AdminTabBar, AdminTopBar,
  ConfigSection, FieldRow, ListEditor,
});
