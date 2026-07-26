import type { Messages } from './en';

export const it: Messages = {
  'app.title': 'Corsa su strada indoor',
  'app.subtitle':
    'Trainer FTMS Bluetooth, frequenza cardiaca e pendenza reale — prima la mappa, poi la corsa.',
  'lang.label': 'Lingua',

  'browser.title': 'Browser',
  'bt.noBrowser': 'Bluetooth è disponibile solo nel browser.',
  'bt.iosSafari':
    'Web Bluetooth non è supportato in iOS Safari. Usa Chrome o Edge su Android, Windows o macOS — oppure un browser tipo Bluefy su iOS.',
  'bt.needsHttps': 'Web Bluetooth richiede HTTPS o localhost.',
  'bt.unsupported': 'Questo browser non supporta Web Bluetooth. Usa Chrome o Edge.',
  'bt.available':
    'Web Bluetooth disponibile. Associa il trainer FTMS o la fascia cardio quando richiesto.',

  'conn.unsupported': 'non supportato',
  'conn.disconnected': 'disconnesso',
  'conn.connecting': 'connessione',
  'conn.connected': 'connesso',
  'conn.error': 'errore',

  'trainer.title': 'Trainer bici',
  'trainer.demoName': 'Trainer demo (Mock)',
  'trainer.defaultName': 'FTMS Trainer',
  'trainer.disconnect': 'Disconnetti',
  'trainer.connect': 'Collega FTMS',
  'trainer.connecting': 'Connessione…',
  'trainer.useDemo': 'Usa trainer demo',
  'trainer.demoEffort': 'Sforzo demo',
  'trainer.connectFailed': 'Connessione trainer non riuscita',
  'trainer.mockFailed': 'Trainer demo non riuscito',

  'hr.title': 'Frequenza cardiaca',
  'hr.defaultName': 'Frequenza cardiaca',
  'hr.disconnect': 'Disconnetti HR',
  'hr.connect': 'Collega fascia HR',
  'hr.connecting': 'Connessione…',
  'hr.connectFailed': 'Connessione HR non riuscita',

  'wifi.title': 'WiFi / ANT+',
  'wifi.probe': 'Verifica bridge locale',
  'wifi.default':
    'I trainer WiFi/ANT+ richiedono un bridge locale (sandbox del browser). Il Bluetooth FTMS funziona nativamente in Chrome/Edge.',
  'wifi.wsUnavailable': 'WebSocket non disponibile in questo ambiente.',
  'wifi.openFailed':
    'Impossibile aprire il bridge WiFi locale. Usa Bluetooth FTMS nel browser o avvia un bridge per i trainer di rete.',
  'wifi.noBridge':
    'Nessun bridge su 127.0.0.1:8787. I trainer WiFi richiedono un bridge desktop (ANT+/protocollo → WebSocket). Il Bluetooth FTMS funziona senza.',
  'wifi.online': 'Bridge WiFi trainer locale online.',
  'wifi.browserLimited':
    'I trainer WiFi sono limitati nel browser. Preferisci Bluetooth FTMS, oppure un bridge locale per rete/ANT+.',

  'auth.cloudTitle': 'Profilo cloud',
  'auth.cloudDisabled':
    'Per costruire percorsi serve un account cloud. Imposta VITE_API_URL sulla tua API Pi, poi registrati o accedi.',
  'auth.accountTitle': 'Account',
  'auth.accountHint': 'Accedi o registrati prima di scegliere A–B sulla mappa e costruire un percorso.',
  'auth.login': 'Accedi',
  'auth.register': 'Registrati',
  'auth.displayName': 'Nome visualizzato',
  'auth.displayNamePlaceholder': 'Ciclista',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.logIn': 'Accedi',
  'auth.createAccount': 'Crea account',
  'auth.profile': 'Profilo',
  'auth.weight': 'Peso (kg)',
  'auth.ftp': 'FTP (W)',
  'auth.bikeWeight': 'Peso bici (kg)',
  'auth.saveProfile': 'Salva profilo',
  'auth.logOut': 'Esci',
  'auth.loggedIn': 'Accesso effettuato',
  'auth.accountCreated': 'Account creato',
  'auth.loggedOut': 'Disconnesso',
  'auth.profileSaved': 'Profilo salvato',
  'auth.requestFailed': 'Richiesta non riuscita',

  'phase.idle': 'INATTIVO',
  'phase.ready': 'PRONTO',
  'phase.riding': 'LIVE',
  'phase.paused': 'PAUSA',
  'phase.finished': 'FINE',

  'route.title': 'Percorso mondiale',
  'route.subtitle':
    'Scegli A → B sulla mappa. OSRM trova le strade; la pendenza guida il trainer.',
  'route.setA': 'Imposta A',
  'route.setB': 'Imposta B',
  'route.build': 'Crea percorso',
  'route.building': 'Creazione…',
  'route.clear': 'Cancella',
  'route.rideComplete': 'Corsa completata',
  'route.rideCompleteHint':
    '{{distance}} · {{duration}} — scarica per Garmin Connect (import manuale).',
  'route.downloadFit': 'Scarica FIT',
  'route.downloadGpx': 'Scarica GPX',
  'route.saveRide': 'Salva corsa nel profilo',
  'route.saving': 'Salvataggio…',
  'route.start': 'Inizia corsa',
  'route.pause': 'Pausa',
  'route.resume': 'Riprendi',
  'route.stop': 'Stop',
  'route.done': 'Fatto',
  'route.buildFailed': 'Creazione percorso non riuscita',
  'route.noExport': 'Nessuna traccia da esportare',
  'route.noSave': 'Nessuna traccia da salvare',
  'route.loginToSave': 'Accedi per salvare le corse',
  'route.alreadySaved': 'Questa corsa è già salvata',
  'route.saved': 'Salvata nel profilo (#{{id}})',
  'route.gateNoApi':
    'Per i percorsi serve un account cloud. Configura VITE_API_URL verso la tua API Pi, poi registrati.',
  'route.gateLogin': 'Accedi o registrati per scegliere inizio/fine e creare un percorso.',
  'route.gateCta': 'Apri Account',

  'map.pickBanner': 'Tocca la mappa per il punto {{point}}',
  'map.followBanner': 'Segui strada · camera 3D',
  'map.followMapillary': ' · Mapillary on',
  'map.lockedBanner': 'Accedi per impostare A–B sulla mappa',

  'hud.aria': 'Metriche corsa',
  'hud.speed': 'Velocità',
  'hud.power': 'Potenza',
  'hud.cadence': 'Cadenza',
  'hud.heartRate': 'Freq. cardiaca',
  'hud.grade': 'Pendenza',
  'hud.elevation': 'Altitudine',
  'hud.distance': 'Distanza',
  'hud.time': 'Tempo',
  'hud.resistance': 'Target resistenza ≈ {{value}} · carico {{load}}',
  'hud.climb': 'Salita',
  'hud.descent': 'Discesa',

  'street.aria': 'Vista stradale Mapillary',
  'street.label': 'Immagini stradali',
  'street.alt': 'Vista stradale Mapillary lungo il percorso',
  'street.empty': 'Nessuna immagine stradale qui',
  'street.error': 'Immagini stradali non disponibili',
  'street.loading': 'Caricamento immagini stradali…',
  'street.compass': 'Ripresa {{capture}}° · corsa {{ride}}°',

  'footer.protocols':
    'Protocolli: FTMS (0x1826) · HR (0x180D) · OSRM · OpenTopoData · MapLibre / OpenFreeMap · Mapillary',
  'footer.test':
    'Test: Chrome/Edge + trainer FTMS · Trainer demo senza hardware · iOS Safari: no Web Bluetooth',
};
