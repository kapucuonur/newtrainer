import type { Messages } from './en';

export const dk: Messages = {
  'app.title': 'Indendørs landevej',
  'app.subtitle':
    'FTMS Bluetooth-trainer, puls og ægte vejgradient — kort først, derefter cykling.',
  'lang.label': 'Sprog',

  'browser.title': 'Browser',
  'bt.noBrowser': 'Bluetooth er kun tilgængelig i en browser.',
  'bt.iosSafari':
    'Web Bluetooth understøttes ikke i iOS Safari. Brug Chrome eller Edge på Android, Windows eller macOS — eller en Bluefy-lignende browser på iOS.',
  'bt.needsHttps': 'Web Bluetooth kræver HTTPS eller localhost.',
  'bt.unsupported': 'Denne browser understøtter ikke Web Bluetooth. Brug Chrome eller Edge.',
  'bt.available':
    'Web Bluetooth er tilgængelig. Par FTMS-trainer eller pulsbælte, når du bliver bedt om det.',

  'conn.unsupported': 'ikke understøttet',
  'conn.disconnected': 'afbrudt',
  'conn.connecting': 'forbinder',
  'conn.connected': 'forbundet',
  'conn.error': 'fejl',

  'trainer.title': 'Cykeltrainer',
  'trainer.demoName': 'Demo-trainer (Mock)',
  'trainer.defaultName': 'FTMS Trainer',
  'trainer.disconnect': 'Afbryd',
  'trainer.connect': 'Forbind FTMS',
  'trainer.connecting': 'Forbinder…',
  'trainer.useDemo': 'Brug demo-trainer',
  'trainer.demoEffort': 'Demo-indsats',
  'trainer.connectFailed': 'Trainerforbindelse mislykkedes',
  'trainer.mockFailed': 'Demo-trainer mislykkedes',

  'hr.title': 'Puls',
  'hr.defaultName': 'Puls',
  'hr.disconnect': 'Afbryd HR',
  'hr.connect': 'Forbind HR-bælte',
  'hr.connecting': 'Forbinder…',
  'hr.connectFailed': 'HR-forbindelse mislykkedes',

  'wifi.title': 'WiFi / ANT+',
  'wifi.probe': 'Tjek lokal bro',
  'wifi.default':
    'WiFi/ANT+-trainere kræver en lokal bro (browser-sandbox). Bluetooth FTMS virker native i Chrome/Edge.',
  'wifi.wsUnavailable': 'WebSocket er ikke tilgængelig i dette miljø.',
  'wifi.openFailed':
    'Kunne ikke åbne lokal WiFi-bro. Brug Bluetooth FTMS i browseren, eller kør en lokal bro til netværkstrainere.',
  'wifi.noBridge':
    'Ingen lokal bro på 127.0.0.1:8787. WiFi-trainere kræver en desktop-bro (ANT+/protokol → WebSocket). Bluetooth FTMS virker uden.',
  'wifi.online': 'Lokal WiFi-trainerbro er online.',
  'wifi.browserLimited':
    'WiFi-trainere er begrænset i browseren. Foretræk Bluetooth FTMS, eller en lokal bro til netværk/ANT+.',

  'auth.cloudTitle': 'Skyprofil',
  'auth.cloudDisabled':
    'En skykonto er påkrævet for at bygge ruter. Sæt VITE_API_URL til din Pi-API, og registrer dig eller log ind.',
  'auth.accountTitle': 'Konto',
  'auth.accountHint': 'Log ind eller registrer dig først for at vælge A–B på kortet og bygge en rute.',
  'auth.login': 'Log ind',
  'auth.register': 'Registrer',
  'auth.displayName': 'Visningsnavn',
  'auth.displayNamePlaceholder': 'Cykelrytter',
  'auth.email': 'E-mail',
  'auth.password': 'Adgangskode',
  'auth.logIn': 'Log ind',
  'auth.createAccount': 'Opret konto',
  'auth.profile': 'Profil',
  'auth.weight': 'Vægt (kg)',
  'auth.ftp': 'FTP (W)',
  'auth.bikeWeight': 'Cykelvægt (kg)',
  'auth.saveProfile': 'Gem profil',
  'auth.logOut': 'Log ud',
  'auth.loggedIn': 'Logget ind',
  'auth.accountCreated': 'Konto oprettet',
  'auth.loggedOut': 'Logget ud',
  'auth.profileSaved': 'Profil gemt',
  'auth.requestFailed': 'Anmodning mislykkedes',

  'phase.idle': 'INAKTIV',
  'phase.ready': 'KLAR',
  'phase.riding': 'LIVE',
  'phase.paused': 'PAUSE',
  'phase.finished': 'FÆRDIG',

  'route.title': 'Verdensrute',
  'route.subtitle':
    'Vælg A → B på kortet. OSRM finder vejene; stigningen styrer trainern.',
  'route.setA': 'Sæt A',
  'route.setB': 'Sæt B',
  'route.build': 'Byg rute',
  'route.building': 'Bygger…',
  'route.clear': 'Ryd',
  'route.rideComplete': 'Tur fuldført',
  'route.rideCompleteHint':
    '{{distance}} · {{duration}} — download til Garmin Connect (manuel import).',
  'route.downloadFit': 'Download FIT',
  'route.downloadGpx': 'Download GPX',
  'route.saveRide': 'Gem tur til profil',
  'route.saving': 'Gemmer…',
  'route.start': 'Start tur',
  'route.pause': 'Pause',
  'route.resume': 'Fortsæt',
  'route.stop': 'Stop',
  'route.done': 'Færdig',
  'route.buildFailed': 'Kunne ikke bygge rute',
  'route.noExport': 'Intet spor at eksportere endnu',
  'route.noSave': 'Intet spor at gemme',
  'route.loginToSave': 'Log ind for at gemme ture',
  'route.alreadySaved': 'Denne tur er allerede gemt',
  'route.saved': 'Gemt til profil (#{{id}})',
  'route.gateNoApi':
    'Rutebygning kræver en skykonto. Konfigurer VITE_API_URL til din Pi-API, og registrer dig.',
  'route.gateLogin': 'Log ind eller registrer dig for at vælge start/slut og bygge en rute.',
  'route.gateCta': 'Åbn konto',

  'map.pickBanner': 'Tryk på kortet for punkt {{point}}',
  'map.followBanner': 'Følg vej · 3D-kamera',
  'map.followMapillary': ' · Mapillary til',
  'map.lockedBanner': 'Log ind for at sætte A–B på kortet',

  'hud.aria': 'Turmålinger',
  'hud.speed': 'Hastighed',
  'hud.power': 'Effekt',
  'hud.cadence': 'Kadens',
  'hud.heartRate': 'Puls',
  'hud.grade': 'Stigning',
  'hud.elevation': 'Højde',
  'hud.distance': 'Distance',
  'hud.time': 'Tid',
  'hud.resistance': 'Modstandsmål ≈ {{value}} · {{load}}-belastning',
  'hud.climb': 'Op',
  'hud.descent': 'Ned',

  'street.aria': 'Mapillary gadevisning',
  'street.label': 'Gadebilleder',
  'street.alt': 'Mapillary gadevisning langs ruten',
  'street.empty': 'Ingen gadebilleder her',
  'street.error': 'Gadebilleder utilgængelige',
  'street.loading': 'Indlæser gadebilleder…',
  'street.compass': 'Optagelse {{capture}}° · cykling {{ride}}°',

  'footer.protocols':
    'Protokoller: FTMS (0x1826) · HR (0x180D) · OSRM · OpenTopoData · MapLibre / OpenFreeMap · Mapillary',
  'footer.test':
    'Test: Chrome/Edge + FTMS-trainer · Demo-trainer uden hardware · iOS Safari: ingen Web Bluetooth',
};
