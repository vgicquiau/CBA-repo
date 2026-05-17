// Home + Rooms list + Room detail

const HomeScreen = ({ onNav, onOpenRoom, onStartBooking }) => {
  const todayLabel = (() => {
    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
    return `${days[TODAY.getDay()]} ${TODAY.getDate()} ${months[TODAY.getMonth()]}`;
  })();

  // qui est là cette semaine (du 15 au 22 mai)
  const weekEnd = '2026-05-22';
  const weekStart = '2026-05-15';
  const thisWeek = BOOKINGS.filter(b => !(b.end <= weekStart || b.start >= weekEnd));

  // chambres dispo aujourd'hui
  const todayIso = isoDate(TODAY);

  const featured = ROOMS.filter(r => ['glycine','pigeonnier','bergerie'].includes(r.id));

  return (
    <div className="page">
      <TopBar
        title={'Bonjour Claire'}
        onMenu={() => {}}
        right={
          <div className="icon-btn" style={{background:'var(--terracotta)',color:'var(--bg)',fontFamily:'var(--serif)',fontStyle:'italic',fontSize:14,fontWeight:600}}>
            C
          </div>
        }
      />

      {/* Greeting subline */}
      <div style={{padding:'0 20px 18px'}}>
        <div className="label" style={{marginBottom:4}}>{todayLabel}</div>
        <div className="serif-it" style={{fontSize:22,color:'var(--ink-2)',lineHeight:1.3}}>
          La maison t'attend.
        </div>
      </div>

      {/* House hero */}
      <div style={{padding:'0 16px 22px'}}>
        <div style={{
          position: 'relative',
          borderRadius: 18,
          overflow: 'hidden',
          height: 200,
          background: 'linear-gradient(135deg,#D6CFB8,#B0A684)',
        }} className="photo">
          <div style={{
            position:'absolute', inset: 12,
            border: '1px solid rgba(251,247,240,0.55)',
            borderRadius: 12,
            display:'flex', flexDirection:'column', justifyContent:'space-between',
            padding: 14,
            zIndex: 1,
          }}>
            <div className="label" style={{color:'rgba(251,247,240,0.85)'}}>Photo extérieure — façade</div>
            <div>
              <div className="serif-it" style={{color:'#FBF7F0',fontSize:24,lineHeight:1}}>Le Clos</div>
              <div className="serif" style={{color:'#FBF7F0',fontSize:32,lineHeight:1}}>Bon Accueil</div>
              <div className="mono" style={{color:'rgba(251,247,240,0.8)',fontSize:10,marginTop:6,letterSpacing:'0.14em'}}>
                12 CHAMBRES · NORMANDIE
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{padding:'0 16px 26px'}}>
        <button
          className="btn btn-primary"
          onClick={onStartBooking}
          style={{width:'100%', padding:'16px 20px'}}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M2 7h12M5 2v3M11 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Réserver une chambre
        </button>
      </div>

      {/* À l'instant — qui est là */}
      <div style={{padding:'0 20px 12px',display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
        <span className="label">Cette semaine à la maison</span>
        <span className="mono" style={{fontSize:10,color:'var(--muted)'}}>{thisWeek.length} séjours</span>
      </div>

      <div style={{padding:'0 16px 24px'}}>
        <div className="card" style={{padding:'4px 0'}}>
          {thisWeek.slice(0, 5).map((b, i) => {
            const room = ROOMS.find(r => r.id === b.roomId);
            return (
              <div key={i} className="row-tap" onClick={() => onOpenRoom(room.id)}>
                <div className="avatar" style={{
                  background: b.name.includes('Claire') ? 'var(--terracotta)' : 'var(--sage-soft)',
                  color: b.name.includes('Claire') ? '#FBF7F0' : '#4A5B3E',
                  marginRight: 12,
                }}>
                  {initials(b.name)}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {b.name}
                  </div>
                  <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                    {room.name} <span className="dot-sep" /> {fmtRange(b.start, b.end)}
                  </div>
                </div>
                <span className="tag" style={{flexShrink:0}}>{nightsBetween(b.start, b.end)} nuits</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chambres en vedette */}
      <div style={{padding:'0 20px 12px',display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
        <span className="serif" style={{fontSize:22}}>Une chambre pour toi</span>
        <button
          onClick={() => onNav('rooms')}
          style={{background:'none',border:'none',padding:0,color:'var(--terracotta)',fontSize:13,cursor:'pointer'}}
        >
          Voir tout →
        </button>
      </div>

      <div
        className="no-scrollbar"
        style={{display:'flex',gap:12,padding:'0 16px 8px',overflowX:'auto'}}
      >
        {featured.map(r => {
          const isFree = !isRoomBookedOn(r.id, todayIso);
          return (
            <div
              key={r.id}
              onClick={() => onOpenRoom(r.id)}
              style={{
                width: 200, flexShrink: 0,
                background: 'var(--paper)',
                borderRadius: 14,
                border: '1px solid var(--line-2)',
                padding: 10,
                cursor: 'pointer',
              }}
            >
              <RoomPhoto
                roomId={r.id}
                tint={r.photoTint}
                label={r.id}
                style={{width:'100%', height: 130, marginBottom: 10}}
                rounded={10}
              />
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
                <span className="serif" style={{fontSize:18}}>{r.name}</span>
                <span className="serif" style={{fontSize:15}}>{r.pricePerPerson}€</span>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                <span className="label" style={{fontSize:9}}>
                  {r.beds.replace('1 lit ','').replace('2 lits ','2× ')}
                </span>
                {isFree ? (
                  <span className="tag tag-sage" style={{fontSize:10,padding:'1px 7px'}}>libre</span>
                ) : (
                  <span className="tag tag-clay" style={{fontSize:10,padding:'1px 7px'}}>occupée</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Petit mot */}
      <div style={{padding:'28px 20px 0'}}>
        <div style={{
          background: 'var(--paper)',
          borderRadius: 14,
          padding: '18px 20px',
          border: '1px solid var(--line-2)',
          position: 'relative',
        }}>
          <div className="serif-it" style={{fontSize:34,position:'absolute',top:6,left:14,color:'var(--terracotta)',lineHeight:1}}>“</div>
          <div className="serif-it" style={{fontSize:16,color:'var(--ink-2)',lineHeight:1.45,paddingLeft:18}}>
            Les volets bleus ont été repeints. Et les hortensias sont en fleur. À très vite — Papa & Maman.
          </div>
          <div className="label" style={{marginTop:10,textAlign:'right'}}>Mot du 12 mai</div>
        </div>
      </div>
    </div>
  );
};

const RoomsScreen = ({ onOpenRoom }) => {
  const [filter, setFilter] = React.useState('all');
  const todayIso = isoDate(TODAY);

  let rooms = ROOMS;
  if (filter === 'available') rooms = rooms.filter(r => !isRoomBookedOn(r.id, todayIso));
  if (filter === 'rez')   rooms = rooms.filter(r => r.floor === 0);
  if (filter === 'etage') rooms = rooms.filter(r => r.floor === 1);
  if (filter === 'gauche')  rooms = rooms.filter(r => r.wing === 'Aile gauche');
  if (filter === 'droite')  rooms = rooms.filter(r => r.wing === 'Aile droite');
  if (filter === 'dependance') rooms = rooms.filter(r => r.wing === 'Dépendance');
  if (filter === 'famille') rooms = rooms.filter(r => r.capacity >= 3);

  const filters = [
    {k:'all', l:'Toutes'},
    {k:'available', l:'Libres ce soir'},
    {k:'famille', l:'Famille'},
    {k:'rez', l:'Rez-de-chaussée'},
    {k:'etage', l:'À l\'étage'},
    {k:'gauche', l:'Aile gauche'},
    {k:'droite', l:'Aile droite'},
    {k:'dependance', l:'Dépendance'},
  ];

  return (
    <div className="page">
      <TopBar title="Les chambres" onMenu={() => {}} />

      <div style={{padding:'0 20px 14px'}}>
        <div className="serif-it" style={{fontSize:16,color:'var(--muted)',lineHeight:1.4}}>
          {ROOMS.length} chambres, du grenier à la bergerie. Choisis celle qui te va.
        </div>
      </div>

      <div
        className="no-scrollbar"
        style={{display:'flex',gap:8,padding:'4px 16px 18px',overflowX:'auto'}}
      >
        {filters.map(f => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 999,
              fontSize: 13,
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

      <div style={{padding:'0 16px',display:'flex',flexDirection:'column',gap:10}}>
        {rooms.map(r => (
          <RoomCard
            key={r.id}
            room={r}
            available={!isRoomBookedOn(r.id, todayIso)}
            onClick={() => onOpenRoom(r.id)}
          />
        ))}
        {rooms.length === 0 && (
          <div className="serif-it" style={{textAlign:'center',padding:'40px 20px',color:'var(--muted)'}}>
            Rien dans cette catégorie.
          </div>
        )}
      </div>
    </div>
  );
};

const RoomDetailScreen = ({ roomId, onBack, onStartBookingFor }) => {
  const room = ROOMS.find(r => r.id === roomId);
  if (!room) return null;

  // upcoming bookings for this room
  const upcoming = BOOKINGS
    .filter(b => b.roomId === roomId && b.end > isoDate(TODAY))
    .slice(0, 4);

  return (
    <div className="page">
      {/* Hero photo full-bleed */}
      <div style={{position:'relative',marginBottom:-24}}>
        <RoomPhoto
          roomId={room.id}
          tint={room.photoTint}
          label={`hero — ${room.id}`}
          style={{width:'100%',height:300,borderRadius:0}}
          rounded={0}
        />
        {/* Floating back & menu over photo */}
        <div style={{
          position:'absolute', top: 0, left: 0, right: 0,
          padding:'58px 16px 14px',
          display:'flex', justifyContent:'space-between',
        }}>
          <button
            className="icon-btn"
            onClick={onBack}
            style={{background:'rgba(251,247,240,0.92)',backdropFilter:'blur(8px)'}}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="icon-btn"
            style={{background:'rgba(251,247,240,0.92)',backdropFilter:'blur(8px)'}}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 14V4a1 1 0 011-1h8a1 1 0 011 1v10l-5-3-5 3z" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Title block */}
      <div style={{
        position:'relative',
        background:'var(--bg)',
        borderRadius:'24px 24px 0 0',
        padding:'24px 20px 18px',
      }}>
        <div className="label" style={{marginBottom:6}}>
          {roomLocation(room)}
          <span className="dot-sep" />
          {room.area} m²
        </div>
        <h1 className="serif" style={{fontSize:38,lineHeight:1,margin:0}}>{room.name}</h1>
        <p className="serif-it" style={{fontSize:17,color:'var(--ink-2)',lineHeight:1.4,marginTop:14}}>
          {room.blurb}
        </p>
      </div>

      <hr className="hr" style={{margin:'0 20px'}} />

      {/* Key facts */}
      <div style={{padding:'20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <FactRow icon="bed" label="Couchage" value={room.beds} />
        <FactRow icon="people" label="Capacité" value={`${room.capacity} pers.`} />
        <FactRow icon="closet" label="Rangement" value={room.closet} />
        <FactRow icon="floor" label="Surface" value={`${room.area} m²`} />
      </div>

      <hr className="hr" style={{margin:'0 20px'}} />

      {/* Equipment + Linen */}
      <div style={{padding:'20px 20px'}}>
        <div className="label" style={{marginBottom:10}}>Équipement</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {room.equipment.map(e => (
            <span key={e} className="tag">{e}</span>
          ))}
        </div>

        {room.linen && room.linen.length > 0 && (
          <>
            <div className="label" style={{marginTop:18,marginBottom:10,display:'flex',alignItems:'center',gap:6}}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{marginTop:-1}}>
                <path d="M2 4l5-2 5 2v2c0 1-1 2-3 2H5C3 8 2 7 2 6V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                <path d="M5 8v4M9 8v4M3 12h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              Linge fourni
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
              {room.linen.map(l => (
                <span key={l} className="tag tag-sage">{l}</span>
              ))}
            </div>
          </>
        )}
      </div>

      <hr className="hr" style={{margin:'0 20px'}} />

      {/* Photos */}
      <div style={{padding:'20px 0 0 16px'}}>
        <div className="label" style={{padding:'0 4px 10px'}}>Quelques détails</div>
        <div className="no-scrollbar" style={{display:'flex',gap:8,overflowX:'auto',paddingRight:16}}>
          {['vue ext.','lit','bureau','salle de bain'].map((l, i) => (
            <PhotoFrame
              key={i}
              tint={i === 0 ? room.photoTint : i === 1 ? 'lin' : i === 2 ? 'pierre' : 'mousse'}
              label={l}
              style={{width:140,height:140,flexShrink:0}}
            />
          ))}
        </div>
      </div>

      {/* Upcoming */}
      <div style={{padding:'24px 20px 0'}}>
        <div className="label" style={{marginBottom:10}}>Prochains séjours</div>
        {upcoming.length === 0 && (
          <div className="serif-it" style={{color:'var(--muted)',fontSize:14}}>Aucun séjour prévu — elle est à toi.</div>
        )}
        <div className="card" style={{padding:'2px 0'}}>
          {upcoming.map((b, i) => (
            <div key={i} className="row-tap" style={{cursor:'default'}}>
              <div className="avatar" style={{marginRight:12}}>{initials(b.name)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:500}}>{b.name}</div>
                <div style={{fontSize:11,color:'var(--muted)',marginTop:2}}>
                  {fmtRange(b.start, b.end)} <span className="dot-sep" /> {nightsBetween(b.start, b.end)} nuits
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky bottom CTA */}
      <div className="page-actions" style={{ alignItems: 'center', gap: 12 }}>
        <div>
          <div className="serif" style={{fontSize:24,lineHeight:1}}>{room.pricePerPerson}€</div>
          <div className="mono" style={{fontSize:10,color:'var(--muted)',letterSpacing:'0.12em'}}>/ PERS. / NUIT</div>
        </div>
        <button
          className="btn btn-clay"
          onClick={() => onStartBookingFor(room.id)}
          style={{flex:1, padding:'15px 18px'}}
        >
          Réserver {room.name}
        </button>
      </div>
    </div>
  );
};

const FactRow = ({ icon, label, value }) => {
  const Icon = () => {
    const c = 'var(--ink-2)';
    if (icon === 'bed') return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M2 14V7M18 14V11a2 2 0 00-2-2H10v5M2 14h16M2 14v2M18 14v2" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="6" cy="10" r="1.5" stroke={c} strokeWidth="1.5"/>
      </svg>
    );
    if (icon === 'people') return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="7" r="3" stroke={c} strokeWidth="1.5"/>
        <path d="M4 17c1.5-3 3.5-4.5 6-4.5s4.5 1.5 6 4.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
    if (icon === 'closet') return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="4" y="3" width="12" height="14" rx="0.5" stroke={c} strokeWidth="1.5"/>
        <path d="M10 3v14M8 10h.5M12 10h-.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    );
    if (icon === 'floor') return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="3" y="3" width="14" height="14" stroke={c} strokeWidth="1.5"/>
        <path d="M3 8l3 3M3 14l5 5M9 3l8 8M15 3l5 5" stroke={c} strokeWidth="1" opacity="0.5"/>
      </svg>
    );
  };
  return (
    <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
      <div style={{
        width:34, height:34, borderRadius:8,
        background:'var(--paper)',
        border:'1px solid var(--line)',
        display:'flex', alignItems:'center', justifyContent:'center',
        flexShrink: 0,
      }}>
        <Icon />
      </div>
      <div>
        <div className="label" style={{fontSize:9,marginBottom:2}}>{label}</div>
        <div style={{fontSize:13,lineHeight:1.3}}>{value}</div>
      </div>
    </div>
  );
};

Object.assign(window, { HomeScreen, RoomsScreen, RoomDetailScreen, FactRow });
