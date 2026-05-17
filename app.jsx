// Main app: state-based router for Le Clos Bon Accueil

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentColor": "#B05A3C",
  "bgColor": "#F5EFE5",
  "headingFont": "Cormorant Garamond",
  "showWelcomeNote": true,
  "currentUser": "Claire",
  "adminMode": false
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(DEFAULTS);

  // Apply tweaks to root CSS vars
  React.useEffect(() => {
    document.documentElement.style.setProperty('--terracotta', t.accentColor);
    document.documentElement.style.setProperty('--bg', t.bgColor);
    document.documentElement.style.setProperty('--serif', `'${t.headingFont}', Georgia, serif`);
  }, [t]);

  // Subscribe to data store changes (admin mutations)
  useStoreSubscribe();

  // Toast / notification
  const [toast, setToast] = React.useState(null);
  const toastTimer = React.useRef(null);
  const showToast = React.useCallback((msg, kind = 'success') => {
    const id = Date.now() + Math.random();
    setToast({ msg, kind, id });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast(curr => (curr && curr.id === id ? null : curr));
    }, 4000);
  }, []);
  React.useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // Router: stack of screens
  const [stack, setStack] = React.useState([{name:'home'}]);
  const top = stack[stack.length - 1];
  const push = (s) => setStack(st => [...st, s]);
  const pop = () => setStack(st => st.length > 1 ? st.slice(0, -1) : st);
  const reset = (name) => setStack([{name}]);

  // Booking working state (user-facing booking flow)
  const [booking, setBooking] = React.useState({
    dates: { start: null, end: null },
    roomId: null,
    guests: [{ name: t.currentUser }],
    notes: '',
  });

  const [myBookings, setMyBookings] = React.useState(MY_BOOKINGS);
  const [editing, setEditing] = React.useState(null);

  // Admin scratch state
  const [adminEditingBooking, setAdminEditingBooking] = React.useState(null);
  const [adminEditingRoom, setAdminEditingRoom] = React.useState(null);

  const startBooking = (presetRoomId) => {
    setBooking({
      dates: { start: null, end: null },
      roomId: presetRoomId || null,
      guests: [{ name: t.currentUser }],
      notes: '',
    });
    push({name: 'book-dates', presetRoom: presetRoomId});
  };

  // ───── User tab handling ─────
  const onUserTab = (key) => {
    if (key === 'home')     reset('home');
    if (key === 'rooms')    reset('rooms');
    if (key === 'calendar') reset('calendar');
    if (key === 'me')       reset('me');
  };

  // ───── Admin tab handling ─────
  const onAdminTab = (key) => {
    if (key === 'dashboard') reset('admin-home');
    if (key === 'bookings')  reset('admin-bookings');
    if (key === 'lieu')      reset('admin-lieu');
  };

  // When the admin toggle flips, switch the entire stack
  React.useEffect(() => {
    if (t.adminMode && !top.name.startsWith('admin')) {
      setStack([{name:'admin-home'}]);
    } else if (!t.adminMode && top.name.startsWith('admin')) {
      setStack([{name:'home'}]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.adminMode]);

  const userTab = (() => {
    if (['home'].includes(top.name)) return 'home';
    if (['rooms', 'room'].includes(top.name)) return 'rooms';
    if (top.name === 'calendar') return 'calendar';
    if (['me','book-dates','book-room','book-guests','book-notes','book-recap','confirmation','edit-booking'].includes(top.name)) return 'me';
    return null;
  })();

  const adminTab = (() => {
    if (top.name === 'admin-home') return 'dashboard';
    if (['admin-bookings','admin-edit-booking'].includes(top.name)) return 'bookings';
    if (['admin-lieu','admin-edit-room'].includes(top.name)) return 'lieu';
    return null;
  })();

  const hideTabBar = ['book-dates','book-room','book-guests','book-notes','book-recap','confirmation','edit-booking','admin-edit-booking','admin-edit-room'].includes(top.name);

  let screen = null;

  // ───── User screens ─────
  if (top.name === 'home') {
    screen = (
      <HomeScreen
        onNav={(n) => reset(n)}
        onOpenRoom={(id) => push({name:'room', roomId:id})}
        onStartBooking={() => startBooking()}
      />
    );
  } else if (top.name === 'rooms') {
    screen = <RoomsScreen onOpenRoom={(id) => push({name:'room', roomId:id})} />;
  } else if (top.name === 'room') {
    screen = (
      <RoomDetailScreen
        roomId={top.roomId}
        onBack={pop}
        onStartBookingFor={(id) => startBooking(id)}
      />
    );
  } else if (top.name === 'calendar') {
    screen = (
      <CalendarScreen
        onOpenRoom={(id) => push({name:'room', roomId:id})}
        onStartBooking={() => startBooking()}
      />
    );
  } else if (top.name === 'me') {
    screen = (
      <MyBookingsScreen
        bookings={myBookings}
        onOpenRoom={(id) => push({name:'room', roomId:id})}
        onStartBooking={() => startBooking()}
        onEdit={(b) => { setEditing(b); push({name:'edit-booking'}); }}
        onCancel={(id) => setMyBookings(bs => bs.filter(x => x.id !== id))}
      />
    );
  } else if (top.name === 'edit-booking' && editing) {
    screen = (
      <>
        <TopBar onBack={pop} title="Modifier" />
        <EditBookingScreen
          booking={editing}
          onBack={pop}
          onSave={(updated) => {
            setMyBookings(bs => bs.map(b => b.id === updated.id ? updated : b));
            setEditing(null);
            pop();
          }}
        />
      </>
    );
  } else if (top.name === 'book-dates') {
    screen = (
      <>
        <TopBar onBack={pop} title="Nouveau séjour" />
        <BookingStepDates
          value={booking.dates}
          onChange={(d) => setBooking(b => ({...b, dates: d}))}
          onNext={() => push({name:'book-room'})}
        />
      </>
    );
  } else if (top.name === 'book-room') {
    screen = (
      <>
        <TopBar onBack={pop} title="Choix de chambre" />
        <BookingStepRoom
          booking={booking}
          setBooking={setBooking}
          onBack={pop}
          onNext={() => push({name:'book-guests'})}
        />
      </>
    );
  } else if (top.name === 'book-guests') {
    screen = (
      <>
        <TopBar onBack={pop} title="Invités" />
        <BookingStepGuests
          booking={booking}
          setBooking={setBooking}
          onBack={pop}
          onNext={() => push({name:'book-notes'})}
        />
      </>
    );
  } else if (top.name === 'book-notes') {
    screen = (
      <>
        <TopBar onBack={pop} title="Un mot" />
        <BookingStepNotes
          booking={booking}
          setBooking={setBooking}
          onBack={pop}
          onNext={() => push({name:'book-recap'})}
        />
      </>
    );
  } else if (top.name === 'book-recap') {
    screen = (
      <>
        <TopBar onBack={pop} title="Récapitulatif" />
        <BookingRecap
          booking={booking}
          onBack={pop}
          onConfirm={() => {
            const newRec = {
              id: 'my-' + Date.now(),
              roomId: booking.roomId,
              name: (booking.guests && booking.guests[0]?.name) || 'Moi',
              start: booking.dates.start,
              end: booking.dates.end,
              people: booking.guests?.length || 1,
              notes: booking.notes || '',
              status: 'à venir',
            };
            setMyBookings(bs => [newRec, ...bs]);
            // Also add to global BOOKINGS so admin sees it
            upsertBooking({
              id: newRec.id, roomId: newRec.roomId,
              name: newRec.name, start: newRec.start, end: newRec.end,
              people: newRec.people,
            });
            push({name:'confirmation'});
          }}
        />
      </>
    );
  } else if (top.name === 'confirmation') {
    screen = (
      <ConfirmationScreen
        booking={booking}
        onGoHome={() => reset('home')}
        onSeeMyBookings={() => reset('me')}
      />
    );
  }

  // ───── Admin screens ─────
  else if (top.name === 'admin-home') {
    screen = (
      <AdminDashboard
        onGoBookings={() => reset('admin-bookings')}
        onGoRooms={() => reset('admin-lieu')}
        onOpenBooking={(b) => { setAdminEditingBooking(b); push({name:'admin-edit-booking'}); }}
        onNewBooking={() => { setAdminEditingBooking(null); push({name:'admin-edit-booking'}); }}
        onNewRoom={() => { setAdminEditingRoom(null); push({name:'admin-edit-room'}); }}
      />
    );
  } else if (top.name === 'admin-bookings') {
    screen = (
      <AdminBookingsScreen
        onOpenBooking={(b) => { setAdminEditingBooking(b); push({name:'admin-edit-booking'}); }}
        onNewBooking={() => { setAdminEditingBooking(null); push({name:'admin-edit-booking'}); }}
      />
    );
  } else if (top.name === 'admin-edit-booking') {
    screen = (
      <AdminEditBookingScreen
        booking={adminEditingBooking}
        onBack={pop}
        onSave={(b) => {
          upsertBooking(b);
          setMyBookings(bs => bs.map(x => x.id === b.id ? {...x, ...b} : x));
          setAdminEditingBooking(null);
          pop();
          showToast('Réservation enregistrée.');
        }}
        onDelete={(id) => {
          const b = BOOKINGS.find(x => x.id === id);
          deleteBooking(id);
          setMyBookings(bs => bs.filter(x => x.id !== id));
          setAdminEditingBooking(null);
          pop();
          showToast(`Réservation${b ? ` de ${b.name}` : ''} supprimée.`);
        }}
      />
    );
  } else if (top.name === 'admin-lieu') {
    screen = (
      <AdminLieuScreen
        onOpenRoom={(r) => { setAdminEditingRoom(r); push({name:'admin-edit-room'}); }}
        onNewRoom={() => { setAdminEditingRoom(null); push({name:'admin-edit-room'}); }}
      />
    );
  } else if (top.name === 'admin-edit-room') {
    screen = (
      <AdminEditRoomScreen
        room={adminEditingRoom}
        onBack={pop}
        onSave={(r) => {
          const wasNew = !ROOMS.some(x => x.id === r.id);
          upsertRoom(r);
          setAdminEditingRoom(null);
          pop();
          showToast(wasNew ? `« ${r.name} » a été créée.` : `« ${r.name} » a été mise à jour.`);
        }}
        onDelete={(id) => {
          const room = ROOMS.find(x => x.id === id);
          if (!room) {
            showToast("Impossible de retrouver cette chambre.", 'error');
            return;
          }
          const cancelled = BOOKINGS.filter(b => b.roomId === id).length;
          deleteRoom(id);
          setAdminEditingRoom(null);
          pop();
          showToast(
            cancelled > 0
              ? `« ${room.name} » supprimée — ${cancelled} réservation${cancelled > 1 ? 's' : ''} annulée${cancelled > 1 ? 's' : ''}.`
              : `« ${room.name} » a été supprimée.`
          );
        }}
      />
    );
  }

  const isAdminView = t.adminMode;

  // Build sidebar items for the current mode
  const userSidebarItems = [
    { key: 'home',     icon: 'home',  label: 'Accueil',     onClick: () => onUserTab('home') },
    { key: 'rooms',    icon: 'rooms', label: 'Chambres',    onClick: () => onUserTab('rooms') },
    { key: 'calendar', icon: 'cal',   label: 'Calendrier',  onClick: () => onUserTab('calendar') },
    { key: 'me',       icon: 'me',    label: 'Mes séjours', onClick: () => onUserTab('me') },
  ];
  const userSidebarFooter = [
    { key: 'admin', icon: 'admin', label: 'Mode admin', tone: 'accent', onClick: () => setTweak('adminMode', true) },
  ];
  const adminSidebarItems = [
    { key: 'dashboard', icon: 'dashboard', label: 'Tableau',      onClick: () => onAdminTab('dashboard') },
    { key: 'bookings',  icon: 'bookings',  label: 'Réservations', onClick: () => onAdminTab('bookings') },
    { key: 'lieu',      icon: 'lieu',      label: 'Lieu',         onClick: () => onAdminTab('lieu') },
  ];
  const adminSidebarFooter = [
    { key: 'exit', icon: 'exit', label: 'Quitter admin', tone: 'accent', onClick: () => setTweak('adminMode', false) },
  ];

  return (
    <div className="app">
      <div className="app-body">
        {/* Sidebar — hidden on mobile via CSS */}
        {!isAdminView ? (
          <SidebarNav
            brand={{ label: 'Le Clos', name: 'Bon Accueil' }}
            items={userSidebarItems}
            activeKey={userTab}
            footer={userSidebarFooter}
          />
        ) : (
          <SidebarNav
            brand={{ label: 'Administration', name: 'Le Clos' }}
            items={adminSidebarItems}
            activeKey={adminTab}
            footer={adminSidebarFooter}
          />
        )}
        {/* Scrollable main column */}
        <div className="app-content">
          {screen}
        </div>
      </div>

      {/* Tab bar — visible only on mobile (CSS-hidden on ≥640px) */}
      {!hideTabBar && !isAdminView && <TabBar tab={userTab} onTab={onUserTab} />}
      {!hideTabBar && isAdminView  && (
        <AdminTabBar
          tab={adminTab}
          onTab={onAdminTab}
          onExit={() => setTweak('adminMode', false)}
        />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Mode">
          <TweakToggle
            label="Vue administrateur"
            value={t.adminMode}
            onChange={(v) => setTweak('adminMode', v)}
          />
        </TweakSection>
        <TweakSection label="Couleurs">
          <TweakColor
            label="Accent"
            value={t.accentColor}
            options={['#B05A3C', '#7B8B6F', '#8C5A3E', '#3F4B66', '#2A2218']}
            onChange={(v) => setTweak('accentColor', v)}
          />
          <TweakColor
            label="Fond"
            value={t.bgColor}
            options={['#F5EFE5', '#F2EDE3', '#EFEAE0', '#1F1B14']}
            onChange={(v) => setTweak('bgColor', v)}
          />
        </TweakSection>
        <TweakSection label="Typo">
          <TweakRadio
            label="Police d'affichage"
            value={t.headingFont}
            options={['Cormorant Garamond', 'EB Garamond', 'Libre Caslon Text']}
            onChange={(v) => setTweak('headingFont', v)}
          />
        </TweakSection>
        <TweakSection label="Contenu">
          <TweakText
            label="Prénom utilisateur"
            value={t.currentUser}
            onChange={(v) => setTweak('currentUser', v)}
          />
        </TweakSection>
      </TweaksPanel>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

Object.assign(window, { App });
