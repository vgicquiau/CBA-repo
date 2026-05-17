// Calendar timeline + Booking flow + Confirmation + My bookings

// ─────────────────────────────────────────────────────────────
// CALENDAR (Airbnb-style timeline)
// ─────────────────────────────────────────────────────────────
const CalendarScreen = ({ onOpenRoom, onStartBooking }) => {
  const DAYS_VISIBLE = 7;
  const monthsFull = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const dayLetters = ['L','M','M','J','V','S','D']; // Monday-first

  // Anchor on the Monday of the week containing TODAY by default
  const mondayOf = (d) => {
    const x = new Date(d);
    x.setHours(0,0,0,0);
    const dow = x.getDay(); // 0 = Sunday, 1 = Monday…
    const diff = (dow === 0 ? -6 : 1 - dow); // shift to Monday
    x.setDate(x.getDate() + diff);
    return x;
  };

  const [weekStart, setWeekStart] = React.useState(() => mondayOf(TODAY));

  const days = Array.from({length: DAYS_VISIBLE}).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Header label: "13 – 19 mai 2026" or "30 mai – 5 juin 2026" if spans months
  const first = days[0];
  const last = days[DAYS_VISIBLE - 1];
  const headerLabel = (() => {
    if (first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()) {
      return `${first.getDate()} – ${last.getDate()} ${monthsFull[first.getMonth()]} ${first.getFullYear()}`;
    }
    if (first.getFullYear() === last.getFullYear()) {
      return `${first.getDate()} ${monthsFull[first.getMonth()].slice(0,4)}. – ${last.getDate()} ${monthsFull[last.getMonth()].slice(0,4)}. ${first.getFullYear()}`;
    }
    return `${first.getDate()} ${monthsFull[first.getMonth()].slice(0,4)}. ${first.getFullYear()} – ${last.getDate()} ${monthsFull[last.getMonth()].slice(0,4)}. ${last.getFullYear()}`;
  })();

  const shiftWeek = (delta) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + delta * 7);
    setWeekStart(next);
  };

  const DAY_W = 44;

  return (
    <div className="page">
      <TopBar title="Calendrier" onMenu={() => {}} />

      <div style={{padding:'0 20px 14px',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
        <div>
          <div className="label" style={{marginBottom:2}}>Semaine du</div>
          <div className="serif" style={{fontSize:22, textTransform:'capitalize'}}>{headerLabel}</div>
        </div>
        <div style={{display:'flex',gap:6}}>
          <button
            className="icon-btn"
            onClick={() => shiftWeek(-1)}
            aria-label="semaine précédente"
          >
            <svg width="12" height="12" viewBox="0 0 14 14"><path d="M9 2L4 7l5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
          </button>
          <button
            className="icon-btn"
            onClick={() => setWeekStart(mondayOf(TODAY))}
          >
            <span style={{fontSize:11,fontFamily:'var(--mono)'}}>auj.</span>
          </button>
          <button
            className="icon-btn"
            onClick={() => shiftWeek(1)}
            aria-label="semaine suivante"
          >
            <svg width="12" height="12" viewBox="0 0 14 14"><path d="M5 2l5 5-5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{padding:'0 20px 10px',display:'flex',gap:14,alignItems:'center'}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}>
          <span style={{width:14,height:8,borderRadius:3,background:'var(--terracotta)'}}/> toi
        </span>
        <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:'var(--muted)'}}>
          <span style={{width:14,height:8,borderRadius:3,background:'var(--sage-soft)',border:'1px solid rgba(123,139,111,0.4)'}}/> autres invités
        </span>
      </div>

      {/* Timeline */}
      <div className="timeline">
        {/* Header days */}
        <div className="timeline-row" style={{minHeight:54}}>
          <div className="timeline-label" style={{padding:'8px 8px'}}>
            <span className="label" style={{fontSize:9}}>Chambre</span>
          </div>
          <div className="timeline-track">
            {days.map((d, i) => {
              const isToday = isoDate(d) === isoDate(TODAY);
              const isWE = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`timeline-day ${isWE ? 'weekend' : ''} ${isToday ? 'today' : ''}`}
                  style={{height:54}}
                >
                  <span className="mono" style={{fontSize:9,color:'var(--muted)',marginBottom:2}}>
                    {dayLetters[(d.getDay() + 6) % 7]}
                  </span>
                  <span
                    className="serif"
                    style={{
                      fontSize:16,
                      color: isToday ? 'var(--terracotta)' : 'var(--ink)',
                      fontWeight: isToday ? 600 : 500,
                    }}
                  >{d.getDate()}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        {ROOMS.map(room => {
          const roomBookings = BOOKINGS.filter(b => b.roomId === room.id);
          return (
            <div key={room.id} className="timeline-row">
              <div
                className="timeline-label"
                onClick={() => onOpenRoom(room.id)}
                style={{cursor:'pointer'}}
              >
                <div style={{minWidth:0,overflow:'hidden'}}>
                  <div style={{
                    fontSize:13,lineHeight:1.05,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                  }}>{room.name}</div>
                  <div className="mono" style={{fontSize:9,color:'var(--muted)',letterSpacing:'0.06em',marginTop:2}}>
                    {room.capacity}P · {room.area}m²
                  </div>
                </div>
              </div>
              <div className="timeline-track">
                {days.map((d, i) => {
                  const isToday = isoDate(d) === isoDate(TODAY);
                  const isWE = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div
                      key={i}
                      className={`timeline-day ${isWE ? 'weekend' : ''} ${isToday ? 'today' : ''}`}
                      style={{minHeight: 46}}
                    />
                  );
                })}
                {roomBookings.map((b) => {
                  const bs = new Date(b.start + 'T00:00:00');
                  const be = new Date(b.end + 'T00:00:00');
                  const startD = days[0];
                  const endD = new Date(days[days.length - 1]);
                  endD.setDate(endD.getDate() + 1);
                  // clip to visible range
                  const sIdx = Math.max(0, Math.round((bs - startD) / 86400000));
                  const eIdx = Math.min(days.length, Math.round((be - startD) / 86400000));
                  if (eIdx <= 0 || sIdx >= days.length) return null;
                  const leftPct  = (sIdx / days.length) * 100;
                  const widthPct = ((eIdx - sIdx) / days.length) * 100;
                  const mine = b.name.includes('Claire');
                  return (
                    <div
                      key={b.id || `${b.roomId}-${b.start}`}
                      className={`tl-booking ${mine ? 'mine' : 'other'}`}
                      style={{
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                    >
                      {b.name}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA */}
      <div style={{padding:'20px 16px 0'}}>
        <button
          className="btn btn-primary"
          onClick={onStartBooking}
          style={{width:'100%'}}
        >
          Trouver des dates libres
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// BOOKING FLOW
// ─────────────────────────────────────────────────────────────

// Mini date-range picker
const MiniCal = ({ value, onChange, monthOffset = 0 }) => {
  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  const [vMonth, setVMonth] = React.useState(() => {
    const d = new Date(TODAY);
    d.setMonth(d.getMonth() + monthOffset, 1);
    return d;
  });

  const y = vMonth.getFullYear();
  const m = vMonth.getMonth();
  const first = new Date(y, m, 1);
  const last = new Date(y, m + 1, 0);
  const startWkd = (first.getDay() + 6) % 7; // mon=0
  const cells = [];
  for (let i = 0; i < startWkd; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m, d));

  const todayIso = isoDate(TODAY);

  const handleClick = (d) => {
    if (!d) return;
    const di = isoDate(d);
    if (di < todayIso) return;
    // Re-tap on the current start → full reset (clear both ends)
    if (value.start && di === value.start) {
      onChange({ start: null, end: null });
      return;
    }
    if (!value.start) {
      onChange({ start: di, end: null });
    } else if (value.start && !value.end) {
      // building the range
      if (di < value.start) {
        onChange({ start: di, end: null });
      } else {
        onChange({ start: value.start, end: di });
      }
    } else {
      // Both already set — refine instead of resetting.
      if (di < value.start) {
        // before the start → restart from here
        onChange({ start: di, end: null });
      } else {
        // within or after current range → shrink/extend the end to this day
        onChange({ start: value.start, end: di });
      }
    }
  };

  return (
    <div className="minical">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <button
          onClick={() => setVMonth(new Date(y, m - 1, 1))}
          style={{background:'none',border:'none',cursor:'pointer',padding:6}}
        >
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M9 2L4 7l5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
        <div className="serif" style={{fontSize:18}}>{months[m]} {y}</div>
        <button
          onClick={() => setVMonth(new Date(y, m + 1, 1))}
          style={{background:'none',border:'none',cursor:'pointer',padding:6}}
        >
          <svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2l5 5-5 5" stroke="var(--ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
      </div>

      <div className="minical-grid">
        {['lun','mar','mer','jeu','ven','sam','dim'].map(w => (
          <div key={w} className="minical-wkd">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="minical-cell muted" />;
          const di = isoDate(d);
          const isStart = value.start === di;
          const isEnd = value.end === di;
          const isInRange = value.start && value.end && di > value.start && di < value.end;
          const isPast = di < todayIso;
          return (
            <div
              key={i}
              className={`minical-cell ${isStart ? 'start' : ''} ${isEnd ? 'end' : ''} ${isInRange ? 'in-range' : ''} ${isPast ? 'disabled' : ''} ${di === todayIso ? 'today' : ''}`}
              onClick={() => handleClick(d)}
            >
              {d.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const BookingStepDates = ({ value, onChange, onNext }) => {
  const nights = value.start && value.end ? nightsBetween(value.start, value.end) : 0;
  return (
    <div className="page">
      <div style={{padding:'8px 20px 18px'}}>
        <Stepper step={0} total={4} />
        <div className="label" style={{marginTop:14,marginBottom:6}}>Étape 1 sur 4</div>
        <div className="serif" style={{fontSize:30,lineHeight:1.05}}>Quand viens-tu ?</div>
        <div className="serif-it" style={{fontSize:15,color:'var(--muted)',marginTop:6}}>
          Choisis ton arrivée puis ton départ.
        </div>
      </div>

      <div style={{padding:'0 16px'}}>
        <MiniCal value={value} onChange={onChange} />
      </div>

      <div style={{padding:'18px 20px'}}>
        <div style={{
          background:'var(--paper)',
          borderRadius:12,
          padding:'14px 16px',
          border:'1px solid var(--line-2)',
          display:'flex',
          justifyContent:'space-between',
          alignItems:'center',
        }}>
          <div>
            <div className="label" style={{marginBottom:4}}>Ton séjour</div>
            <div className="serif" style={{fontSize:17}}>
              {value.start ? <ClayDate d={value.start} /> : '— —'}
              {' → '}
              {value.end ? <ClayDate d={value.end} /> : '— —'}
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div className="serif" style={{fontSize:22}}>{nights || '—'}</div>
            <div className="mono" style={{fontSize:10,color:'var(--muted)',letterSpacing:'0.12em'}}>
              {nights > 1 ? 'NUITS' : 'NUIT'}
            </div>
          </div>
        </div>
      </div>

      <div className="page-actions">
        <button
          className="btn btn-primary"
          disabled={!value.start || !value.end}
          onClick={onNext}
          style={{width:'100%', opacity: value.start && value.end ? 1 : 0.4, cursor: value.start && value.end ? 'pointer' : 'not-allowed'}}
        >
          Choisir une chambre →
        </button>
      </div>
    </div>
  );
};

const BookingStepRoom = ({ booking, setBooking, onNext, onBack }) => {
  // available rooms in range
  const available = ROOMS.filter(r => !isRoomBookedInRange(r.id, booking.dates.start, booking.dates.end));
  const unavailable = ROOMS.filter(r => isRoomBookedInRange(r.id, booking.dates.start, booking.dates.end));

  return (
    <div className="page">
      <div style={{padding:'8px 20px 18px'}}>
        <Stepper step={1} total={4} />
        <div className="label" style={{marginTop:14,marginBottom:6}}>Étape 2 sur 4</div>
        <div className="serif" style={{fontSize:30,lineHeight:1.05}}>Quelle chambre ?</div>
        <div className="serif-it" style={{fontSize:15,color:'var(--muted)',marginTop:6}}>
          {available.length} chambres libres pour {fmtRange(booking.dates.start, booking.dates.end)}.
        </div>
      </div>

      <div style={{padding:'0 16px',display:'flex',flexDirection:'column',gap:10}}>
        {available.map(r => {
          const selected = booking.roomId === r.id;
          return (
            <div
              key={r.id}
              onClick={() => setBooking(b => ({...b, roomId: r.id}))}
              style={{
                display:'flex', gap: 12, padding: 10,
                background:'var(--paper)',
                borderRadius: 14,
                border: '1.5px solid ' + (selected ? 'var(--terracotta)' : 'var(--line-2)'),
                cursor:'pointer',
              }}
            >
              <RoomPhoto
                roomId={r.id}
                tint={r.photoTint}
                label={r.id}
                style={{width:72, height:72, flexShrink:0}}
              />
              <div style={{flex:1, display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
                <div>
                  <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
                    <span className="serif" style={{fontSize:18}}>{r.name}</span>
                    {selected && (
                      <span className="tag tag-clay">choisie</span>
                    )}
                  </div>
                  <div style={{fontSize:11, color:'var(--muted)', marginTop:2}}>
                    {r.beds} <span className="dot-sep" /> {r.capacity} pers. <span className="dot-sep" /> {r.area}m²
                  </div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                  <span className="label" style={{fontSize:9}}>
                    {roomLocation(r)}
                  </span>
                  <span style={{fontSize:13}}>
                    <span className="serif" style={{fontSize:17}}>{r.pricePerPerson}€</span>
                    <span style={{color:'var(--muted)',fontSize:10}}>/pers./nuit</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {unavailable.length > 0 && (
          <>
            <div className="label" style={{marginTop:14,padding:'0 4px'}}>
              Déjà prises sur ces dates
            </div>
            {unavailable.map(r => (
              <div
                key={r.id}
                style={{
                  display:'flex', gap: 12, padding: 10,
                  background:'var(--paper)',
                  borderRadius: 14,
                  border: '1px solid var(--line-2)',
                  opacity: 0.5,
                }}
              >
                <RoomPhoto
                  roomId={r.id}
                  tint={r.photoTint}
                  label={r.id}
                  style={{width:60, height:60, flexShrink:0}}
                />
                <div style={{flex:1, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                  <div>
                    <div className="serif" style={{fontSize:16}}>{r.name}</div>
                    <div className="mono" style={{fontSize:10,color:'var(--muted)',marginTop:3}}>OCCUPÉE</div>
                  </div>
                  <svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={onBack} style={{flex:'0 0 auto'}}>←</button>
        <button
          className="btn btn-primary"
          disabled={!booking.roomId}
          onClick={onNext}
          style={{flex:1, opacity: booking.roomId ? 1 : 0.4, cursor: booking.roomId ? 'pointer' : 'not-allowed'}}
        >
          Qui vient ? →
        </button>
      </div>
    </div>
  );
};

const BookingStepGuests = ({ booking, setBooking, onNext, onBack }) => {
  const room = ROOMS.find(r => r.id === booking.roomId);
  const max = room ? room.capacity : 1;

  const guests = booking.guests || [{name: 'Claire'}];

  const setCount = (n) => {
    n = Math.max(1, Math.min(max, n));
    const next = guests.slice(0, n);
    while (next.length < n) next.push({name: ''});
    setBooking(b => ({...b, guests: next}));
  };

  const setName = (i, name) => {
    const next = guests.map((g, idx) => idx === i ? {name} : g);
    setBooking(b => ({...b, guests: next}));
  };

  return (
    <div className="page">
      <div style={{padding:'8px 20px 18px'}}>
        <Stepper step={2} total={4} />
        <div className="label" style={{marginTop:14,marginBottom:6}}>Étape 3 sur 4</div>
        <div className="serif" style={{fontSize:30,lineHeight:1.05}}>Qui sera là ?</div>
        <div className="serif-it" style={{fontSize:15,color:'var(--muted)',marginTop:6}}>
          {room && `${room.name} peut accueillir jusqu'à ${max} ${max>1?'personnes':'personne'}.`}
        </div>
      </div>

      <div style={{padding:'0 16px 12px'}}>
        <div style={{
          background:'var(--paper)',
          borderRadius:14,
          padding:'16px',
          border:'1px solid var(--line-2)',
        }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div className="label" style={{marginBottom:4}}>Nombre de personnes</div>
              <div className="serif" style={{fontSize:28,lineHeight:1}}>{guests.length}</div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <button
                onClick={() => setCount(guests.length - 1)}
                disabled={guests.length <= 1}
                className="icon-btn"
                style={{
                  width:42,height:42,opacity: guests.length <= 1 ? 0.4 : 1,
                  cursor: guests.length <= 1 ? 'not-allowed':'pointer',
                }}
              >
                <span style={{fontSize:20,lineHeight:1}}>−</span>
              </button>
              <button
                onClick={() => setCount(guests.length + 1)}
                disabled={guests.length >= max}
                className="icon-btn"
                style={{
                  width:42,height:42, background:'var(--ink)',color:'var(--bg)',border:'none',
                  opacity: guests.length >= max ? 0.4 : 1,
                  cursor: guests.length >= max ? 'not-allowed':'pointer',
                }}
              >
                <span style={{fontSize:20,lineHeight:1}}>+</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
        <div className="label" style={{padding:'0 4px 2px'}}>Prénoms (facultatif)</div>
        {guests.map((g, i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:10}}>
            <div className="avatar" style={{
              width:34,height:34,fontSize:13,
              background: i === 0 ? 'var(--terracotta)' : 'var(--sage-soft)',
              color: i === 0 ? '#FBF7F0' : '#4A5B3E',
            }}>
              {g.name ? initials(g.name) : i+1}
            </div>
            <input
              className="input"
              value={g.name}
              onChange={(e) => setName(i, e.target.value)}
              placeholder={i === 0 ? 'Toi' : `Personne ${i+1}`}
              style={{flex:1}}
            />
          </div>
        ))}
      </div>

      <div style={{padding:'18px 20px 0'}}>
        <div className="serif-it" style={{color:'var(--muted)',fontSize:13,lineHeight:1.4}}>
          Les autres invités présents en même temps verront ton prénom. C'est plus chaleureux.
        </div>
      </div>

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={onBack} style={{flex:'0 0 auto'}}>←</button>
        <button
          className="btn btn-primary"
          onClick={onNext}
          style={{flex:1}}
        >
          Un petit mot ? →
        </button>
      </div>
    </div>
  );
};

const BookingStepNotes = ({ booking, setBooking, onNext, onBack }) => {
  return (
    <div className="page">
      <div style={{padding:'8px 20px 18px'}}>
        <Stepper step={3} total={4} />
        <div className="label" style={{marginTop:14,marginBottom:6}}>Étape 4 sur 4</div>
        <div className="serif" style={{fontSize:30,lineHeight:1.05}}>Un petit mot ?</div>
        <div className="serif-it" style={{fontSize:15,color:'var(--muted)',marginTop:6}}>
          Heure d'arrivée, allergies, demande particulière… ou rien du tout.
        </div>
      </div>

      <div style={{padding:'0 16px 12px'}}>
        <textarea
          className="input"
          value={booking.notes || ''}
          onChange={(e) => setBooking(b => ({...b, notes: e.target.value}))}
          placeholder="On arrivera vendredi vers 19h, après la route. Pas d'allergies, merci !"
          style={{minHeight:140,fontFamily:'var(--sans)'}}
        />
      </div>

      {/* Quick suggestions */}
      <div style={{padding:'0 16px 12px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Suggestions</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {[
            "Arrivée tardive (après 21h)",
            "Régime végétarien",
            "Bébé avec nous",
            "On apportera des œufs frais 🥚",
          ].map(s => (
            <button
              key={s}
              onClick={() => setBooking(b => ({...b, notes: (b.notes || '') + (b.notes ? '\n' : '') + s}))}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 999,
                border: '1px solid var(--line)',
                background: 'var(--paper)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
                fontFamily: 'var(--sans)',
              }}
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={onBack} style={{flex:'0 0 auto'}}>←</button>
        <button
          className="btn btn-primary"
          onClick={onNext}
          style={{flex:1}}
        >
          Voir le récap →
        </button>
      </div>
    </div>
  );
};

const BookingRecap = ({ booking, onBack, onConfirm }) => {
  const room = ROOMS.find(r => r.id === booking.roomId);
  const nights = nightsBetween(booking.dates.start, booking.dates.end);
  const guests = booking.guests || [];
  const total = nights * guests.length * room.pricePerPerson;

  // who else is at the house during the stay
  const overlap = BOOKINGS.filter(b =>
    b.roomId !== room.id &&
    !(b.end <= booking.dates.start || b.start >= booking.dates.end)
  );

  return (
    <div className="page">
      <div style={{padding:'8px 20px 22px'}}>
        <div className="label" style={{marginBottom:6}}>Avant de confirmer</div>
        <div className="serif" style={{fontSize:30,lineHeight:1.05}}>Tout est bon ?</div>
      </div>

      {/* Room card */}
      <div style={{padding:'0 16px 14px'}}>
        <div style={{
          background:'var(--paper)',
          borderRadius:14,
          padding:14,
          border:'1px solid var(--line-2)',
          display:'flex',gap:12,
        }}>
          <RoomPhoto roomId={room.id} tint={room.photoTint} label={room.id} style={{width:88,height:88,flexShrink:0}} />
          <div style={{flex:1}}>
            <div className="serif" style={{fontSize:22,lineHeight:1.05}}>{room.name}</div>
            <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>
              {room.beds} <span className="dot-sep"/> {room.area} m² <span className="dot-sep"/> {roomLocation(room)}
            </div>
            <div style={{marginTop:8,fontSize:11,color:'var(--ink-2)'}}>
              <span className="serif-it">"</span>{room.blurb}<span className="serif-it">"</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recap rows */}
      <div style={{padding:'0 16px 14px'}}>
        <div className="card" style={{padding:'2px 0'}}>
          <RecapRow label="Arrivée"  value={<ClayDate d={booking.dates.start}/>} />
          <RecapRow label="Départ"   value={<ClayDate d={booking.dates.end}/>} />
          <RecapRow label="Durée"    value={<span><span className="serif" style={{fontSize:17}}>{nights}</span> nuits</span>} />
          <RecapRow
            label="Invités"
            value={
              <span style={{display:'inline-flex',gap:4}}>
                {guests.map((g, i) => (
                  <span key={i} className="avatar" style={{width:24,height:24,fontSize:10}}>{initials(g.name || `P${i+1}`)}</span>
                ))}
              </span>
            }
            last
          />
        </div>
      </div>

      {/* Showback — indicative price */}
      <div style={{padding:'4px 16px 14px'}}>
        <div style={{
          background:'var(--ink)',
          color:'var(--bg)',
          borderRadius:14,
          padding:'18px 20px',
        }}>
          <div className="mono" style={{fontSize:10,letterSpacing:'0.14em',opacity:0.7,marginBottom:6}}>
            PRIX INDICATIF
          </div>
          <div className="serif" style={{fontSize:42,lineHeight:1}}>
            {total}<span style={{fontSize:24}}>€</span>
          </div>
        </div>
      </div>

      {/* Who else */}
      {overlap.length > 0 && (
        <div style={{padding:'8px 16px 12px'}}>
          <div className="label" style={{padding:'0 4px 8px'}}>Tu ne seras pas seule</div>
          <div className="card" style={{padding:'10px 14px'}}>
            <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
              {overlap.slice(0,6).map((b, i) => (
                <span key={i} className="tag" style={{padding:'4px 10px'}}>
                  <span className="avatar" style={{width:18,height:18,fontSize:9,border:'none',marginRight:4}}>
                    {initials(b.name)}
                  </span>
                  {b.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {booking.notes && (
        <div style={{padding:'4px 16px 12px'}}>
          <div className="label" style={{padding:'0 4px 8px'}}>Ton mot</div>
          <div className="card" style={{padding:'14px 16px'}}>
            <div className="serif-it" style={{fontSize:14,lineHeight:1.5,color:'var(--ink-2)',whiteSpace:'pre-line'}}>
              "{booking.notes}"
            </div>
          </div>
        </div>
      )}

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={onBack} style={{flex:'0 0 auto'}}>←</button>
        <button className="btn btn-clay" onClick={onConfirm} style={{flex:1}}>
          Confirmer la réservation
        </button>
      </div>
    </div>
  );
};

const RecapRow = ({ label, value, last }) => (
  <div style={{
    display:'flex',justifyContent:'space-between',alignItems:'center',
    padding:'12px 16px',
    borderBottom: last ? 'none' : '1px solid var(--line-2)',
  }}>
    <span className="label">{label}</span>
    <span style={{fontSize:14}}>{value}</span>
  </div>
);

// ─────────────────────────────────────────────────────────────
// CONFIRMATION
// ─────────────────────────────────────────────────────────────
const ConfirmationScreen = ({ booking, onGoHome, onSeeMyBookings }) => {
  const room = ROOMS.find(r => r.id === booking.roomId);
  const nights = nightsBetween(booking.dates.start, booking.dates.end);
  const total = nights * (booking.guests?.length || 1) * room.pricePerPerson;
  const ref = 'CLOS-' + Math.floor(1000 + Math.random()*9000);

  return (
    <div className="page">
      <div className="confirmation">
        <div className="seal">✓</div>
        <div className="label" style={{marginBottom:6}}>C'est réservé</div>
        <div className="serif" style={{fontSize:34,lineHeight:1.05}}>
          À très vite, {(booking.guests && booking.guests[0]?.name) || 'Claire'}.
        </div>
        <div className="serif-it" style={{fontSize:16,color:'var(--muted)',marginTop:10,lineHeight:1.4}}>
          {room.name} t'attend du {fmtRange(booking.dates.start, booking.dates.end).split('–')[0].trim()} au {fmtRange(booking.dates.start, booking.dates.end).split('–')[1].trim()}.
        </div>
      </div>

      <div style={{padding:'8px 16px 14px'}}>
        <div style={{
          background:'var(--paper)',
          borderRadius:14,
          padding:'16px 18px',
          border:'1px dashed var(--terracotta)',
        }}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
            <div>
              <div className="label" style={{marginBottom:4}}>Référence</div>
              <div className="mono" style={{fontSize:18}}>{ref}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="label" style={{marginBottom:4}}>Indication</div>
              <div className="serif" style={{fontSize:24}}>{total}€</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:'4px 16px 14px'}}>
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <RoomPhoto roomId={room.id} tint={room.photoTint} label={room.id} style={{height:120,borderRadius:0}} rounded={0}/>
          <div style={{padding:16}}>
            <div className="serif" style={{fontSize:22,lineHeight:1}}>{room.name}</div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:6}}>
              {room.beds} <span className="dot-sep"/> {room.capacity} pers. <span className="dot-sep"/> {room.area} m²
            </div>
            <hr className="hr" style={{margin:'14px 0'}} />
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,fontSize:13}}>
              <div>
                <div className="label" style={{marginBottom:3}}>Arrivée</div>
                <ClayDate d={booking.dates.start} />
              </div>
              <div>
                <div className="label" style={{marginBottom:3}}>Départ</div>
                <ClayDate d={booking.dates.end} />
              </div>
              <div>
                <div className="label" style={{marginBottom:3}}>{nights > 1 ? 'Nuits' : 'Nuit'}</div>
                {nights}
              </div>
              <div>
                <div className="label" style={{marginBottom:3}}>Invités</div>
                {booking.guests?.length || 1}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:'4px 16px 14px'}}>
        <div className="serif-it" style={{
          textAlign:'center',fontSize:14,color:'var(--ink-2)',
          padding:'14px 20px',lineHeight:1.5,
        }}>
          On t'envoie un mot par SMS la veille avec le code du portail et le numéro de la voisine.
        </div>
      </div>

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={onGoHome} style={{flex:1}}>Accueil</button>
        <button className="btn btn-primary" onClick={onSeeMyBookings} style={{flex:1}}>Mes séjours</button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MY BOOKINGS — with modify / cancel
// ─────────────────────────────────────────────────────────────
const MyBookingCard = ({ b, onOpenRoom, onEdit, onCancel }) => {
  const room = ROOMS.find(r => r.id === b.roomId);
  const nights = nightsBetween(b.start, b.end);
  const total = nights * b.people * room.pricePerPerson;
  const [confirming, setConfirming] = React.useState(false);

  const isPast = b.status === 'passé';

  return (
    <div className="card" style={{padding:0, overflow:'hidden', opacity: isPast ? 0.7 : 1}}>
      <div
        style={{display:'flex',gap:0, cursor:'pointer'}}
        onClick={() => onOpenRoom(room.id)}
      >
        <RoomPhoto roomId={room.id} tint={room.photoTint} label={room.id} style={{width:100,height:120,borderRadius:0}} rounded={0} />
        <div style={{flex:1, padding:12, display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:8}}>
              <span className="serif" style={{fontSize:20,lineHeight:1.1}}>{room.name}</span>
              <span className={`tag ${isPast ? '' : 'tag-sage'}`} style={{flexShrink:0}}>
                {b.status || 'à venir'}
              </span>
            </div>
            <div style={{fontSize:12,color:'var(--muted)',marginTop:4}}>
              {fmtRange(b.start, b.end)} <span className="dot-sep"/> {nights} {nights>1?'nuits':'nuit'}
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
            <span className="label">{b.people} {b.people>1?'pers.':'pers.'}</span>
            <span>
              <span className="serif" style={{fontSize:17}}>{total}€</span>
              <span className="mono" style={{fontSize:9,color:'var(--muted)',marginLeft:4}}>
                {isPast ? '' : 'INDICATIF'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Action row — hidden on past bookings */}
      {!isPast && (
        confirming ? (
          <div style={{
            display:'flex',alignItems:'center',gap:10,
            padding:'10px 12px',
            background:'rgba(176,90,60,0.08)',
            borderTop:'1px solid var(--line-2)',
          }}>
            <span className="serif-it" style={{flex:1,fontSize:13,color:'var(--ink-2)',lineHeight:1.3}}>
              Annuler ce séjour ? Une notification sera envoyée.
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
              style={{
                fontSize:12,padding:'7px 12px',borderRadius:999,
                background:'transparent',border:'1px solid var(--line)',
                cursor:'pointer',color:'var(--ink)',fontFamily:'var(--sans)',
              }}
            >
              Non
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(b.id); }}
              style={{
                fontSize:12,padding:'7px 12px',borderRadius:999,
                background:'var(--terracotta)',border:'none',
                cursor:'pointer',color:'#FBF7F0',fontFamily:'var(--sans)',fontWeight:500,
              }}
            >
              Oui, annuler
            </button>
          </div>
        ) : (
          <div style={{
            display:'flex',
            borderTop:'1px solid var(--line-2)',
          }}>
            <button
              onClick={() => onEdit(b)}
              style={{
                flex:1, padding:'12px 0',
                background:'transparent',border:'none',
                borderRight:'1px solid var(--line-2)',
                cursor:'pointer',fontFamily:'var(--sans)',fontSize:13,
                color:'var(--ink)',
                display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M9 2l3 3-7 7H2v-3l7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              </svg>
              Modifier
            </button>
            <button
              onClick={() => setConfirming(true)}
              style={{
                flex:1, padding:'12px 0',
                background:'transparent',border:'none',
                cursor:'pointer',fontFamily:'var(--sans)',fontSize:13,
                color:'var(--terracotta)',
                display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M2 4h10M5 4V2.5h4V4M3.5 4l.7 8.2a1 1 0 001 .8h3.6a1 1 0 001-.8L10.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Annuler
            </button>
          </div>
        )
      )}
    </div>
  );
};

const MyBookingsScreen = ({ onOpenRoom, onStartBooking, bookings, onEdit, onCancel }) => {
  const upcoming = bookings.filter(b => b.status !== 'passé');
  const past     = bookings.filter(b => b.status === 'passé');

  return (
    <div className="page">
      <TopBar title="Mes séjours" onMenu={() => {}} />

      <div style={{padding:'0 20px 18px'}}>
        <div className="serif-it" style={{fontSize:16,color:'var(--muted)'}}>
          Tes réservations à venir et tes souvenirs.
        </div>
      </div>

      {bookings.length === 0 && (
        <div style={{padding:'0 16px'}}>
          <div className="card" style={{padding:'30px 20px',textAlign:'center'}}>
            <div className="serif-it" style={{fontSize:18,color:'var(--muted)'}}>
              Rien encore.
            </div>
            <button className="btn btn-clay" onClick={onStartBooking} style={{marginTop:14}}>
              Réserver une chambre
            </button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div style={{padding:'0 20px 8px',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
            <span className="label">À venir</span>
            <span className="mono" style={{fontSize:10,color:'var(--muted)'}}>{upcoming.length}</span>
          </div>
          <div style={{padding:'0 16px 18px',display:'flex',flexDirection:'column',gap:10}}>
            {upcoming.map(b => (
              <MyBookingCard
                key={b.id}
                b={b}
                onOpenRoom={onOpenRoom}
                onEdit={onEdit}
                onCancel={onCancel}
              />
            ))}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <div style={{padding:'8px 20px 8px',display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
            <span className="label">Souvenirs</span>
            <span className="mono" style={{fontSize:10,color:'var(--muted)'}}>{past.length}</span>
          </div>
          <div style={{padding:'0 16px 18px',display:'flex',flexDirection:'column',gap:10}}>
            {past.map(b => (
              <MyBookingCard
                key={b.id}
                b={b}
                onOpenRoom={onOpenRoom}
                onEdit={onEdit}
                onCancel={onCancel}
              />
            ))}
          </div>
        </>
      )}

      <div style={{padding:'8px 16px 0'}}>
        <button className="btn btn-ghost" onClick={onStartBooking} style={{width:'100%'}}>
          + Nouvelle réservation
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// EDIT BOOKING — single page with all fields
// ─────────────────────────────────────────────────────────────
const EditBookingScreen = ({ booking, onSave, onBack }) => {
  const room = ROOMS.find(r => r.id === booking.roomId);
  const [dates, setDates] = React.useState({ start: booking.start, end: booking.end });
  const [people, setPeople] = React.useState(booking.people);
  const [notes, setNotes] = React.useState(booking.notes || '');
  const max = room.capacity;

  // Check date conflicts excluding this booking
  const conflicts = dates.start && dates.end && BOOKINGS.some(b =>
    b.roomId === room.id &&
    b.name !== booking.name &&
    !(b.end <= dates.start || b.start >= dates.end)
  );

  const nights = dates.start && dates.end ? nightsBetween(dates.start, dates.end) : 0;
  const total  = nights * people * room.pricePerPerson;

  const dirty =
    dates.start !== booking.start ||
    dates.end !== booking.end ||
    people !== booking.people ||
    notes !== (booking.notes || '');

  return (
    <div className="page">
      <div style={{padding:'8px 20px 18px'}}>
        <div className="label" style={{marginBottom:6}}>Modifier ton séjour</div>
        <div className="serif" style={{fontSize:30,lineHeight:1.05}}>{room.name}</div>
        <div className="serif-it" style={{fontSize:14,color:'var(--muted)',marginTop:6,lineHeight:1.4}}>
          Tu peux changer les dates, le nombre de personnes ou ton mot. Pour changer de chambre,
          annule et refais une réservation.
        </div>
      </div>

      <div style={{padding:'0 16px 16px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Dates</div>
        <MiniCal value={dates} onChange={setDates} />
        {conflicts && (
          <div style={{
            marginTop:10,padding:'10px 14px',
            background:'rgba(176,90,60,0.10)',
            border:'1px solid rgba(176,90,60,0.30)',
            borderRadius:10,
            fontSize:13,color:'var(--terracotta)',lineHeight:1.4,
          }}>
            ⚠ {room.name} est déjà prise sur une partie de ces dates. Choisis-en d'autres.
          </div>
        )}
      </div>

      <div style={{padding:'0 16px 16px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Invités</div>
        <div style={{
          background:'var(--paper)',
          borderRadius:14,
          padding:'14px 16px',
          border:'1px solid var(--line-2)',
          display:'flex',justifyContent:'space-between',alignItems:'center',
        }}>
          <div>
            <div className="serif" style={{fontSize:24,lineHeight:1}}>{people}</div>
            <div className="mono" style={{fontSize:10,color:'var(--muted)',letterSpacing:'0.12em',marginTop:4}}>
              {people>1?'PERSONNES':'PERSONNE'} · MAX {max}
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button
              onClick={() => setPeople(p => Math.max(1, p - 1))}
              disabled={people <= 1}
              className="icon-btn"
              style={{width:40,height:40,opacity:people<=1?0.4:1,cursor:people<=1?'not-allowed':'pointer'}}
            >
              <span style={{fontSize:18,lineHeight:1}}>−</span>
            </button>
            <button
              onClick={() => setPeople(p => Math.min(max, p + 1))}
              disabled={people >= max}
              className="icon-btn"
              style={{
                width:40,height:40,background:'var(--ink)',color:'var(--bg)',border:'none',
                opacity:people>=max?0.4:1,cursor:people>=max?'not-allowed':'pointer',
              }}
            >
              <span style={{fontSize:18,lineHeight:1}}>+</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{padding:'0 16px 16px'}}>
        <div className="label" style={{padding:'0 4px 8px'}}>Ton mot (facultatif)</div>
        <textarea
          className="input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Heure d'arrivée, allergies…"
          style={{minHeight:90,fontFamily:'var(--sans)'}}
        />
      </div>

      {/* Showback recap */}
      <div style={{padding:'8px 16px 0'}}>
        <div style={{
          background:'var(--paper)',
          borderRadius:14,
          padding:'14px 16px',
          border:'1px solid var(--line-2)',
          display:'flex',justifyContent:'space-between',alignItems:'baseline',
        }}>
          <div>
            <div className="label" style={{marginBottom:3}}>Nouveau total</div>
            <div className="serif-it" style={{fontSize:13,color:'var(--muted)'}}>
              {people} × {nights || '—'} × {room.pricePerPerson}€
            </div>
          </div>
          <div className="serif" style={{fontSize:30,lineHeight:1}}>
            {nights ? `${total}€` : '—'}
          </div>
        </div>
      </div>

      <div className="page-actions">
        <button className="btn btn-ghost" onClick={onBack} style={{flex:'0 0 auto'}}>Annuler</button>
        <button
          className="btn btn-clay"
          disabled={!dirty || conflicts || !dates.start || !dates.end}
          onClick={() => onSave({
            ...booking,
            start: dates.start, end: dates.end,
            people, notes,
          })}
          style={{
            flex:1,
            opacity: (!dirty || conflicts || !dates.start || !dates.end) ? 0.4 : 1,
            cursor:  (!dirty || conflicts || !dates.start || !dates.end) ? 'not-allowed' : 'pointer',
          }}
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
};

Object.assign(window, {
  CalendarScreen,
  BookingStepDates, BookingStepRoom, BookingStepGuests, BookingStepNotes, BookingRecap,
  ConfirmationScreen, MyBookingsScreen, MyBookingCard, EditBookingScreen, MiniCal, RecapRow,
});
