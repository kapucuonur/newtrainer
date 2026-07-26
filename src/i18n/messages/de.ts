import type { Messages } from './en';

export const de: Messages = {
  'app.title': 'Indoor-Straßenfahrt',
  'app.subtitle':
    'FTMS-Bluetooth-Trainer, Herzfrequenz und echte Straßensteigung — zuerst Karte, dann fahren.',
  'lang.label': 'Sprache',

  'browser.title': 'Browser',
  'bt.noBrowser': 'Bluetooth ist nur im Browser verfügbar.',
  'bt.iosSafari':
    'Web Bluetooth wird in iOS Safari nicht unterstützt. Nutzen Sie Chrome oder Edge unter Android, Windows oder macOS — oder einen Bluefy-ähnlichen Browser auf iOS.',
  'bt.needsHttps': 'Web Bluetooth erfordert HTTPS oder localhost.',
  'bt.unsupported': 'Dieser Browser unterstützt kein Web Bluetooth. Nutzen Sie Chrome oder Edge.',
  'bt.available':
    'Web Bluetooth ist verfügbar. Koppeln Sie Ihren FTMS-Trainer oder Herzfrequenzgurt bei Aufforderung.',

  'conn.unsupported': 'nicht unterstützt',
  'conn.disconnected': 'getrennt',
  'conn.connecting': 'verbindet',
  'conn.connected': 'verbunden',
  'conn.error': 'fehler',

  'trainer.title': 'Fahrrad-Trainer',
  'trainer.demoName': 'Demo-Trainer (Mock)',
  'trainer.defaultName': 'FTMS-Trainer',
  'trainer.disconnect': 'Trennen',
  'trainer.connect': 'FTMS verbinden',
  'trainer.connecting': 'Verbinden…',
  'trainer.useDemo': 'Demo-Trainer nutzen',
  'trainer.demoEffort': 'Demo-Leistung',
  'trainer.connectFailed': 'Trainer-Verbindung fehlgeschlagen',
  'trainer.mockFailed': 'Demo-Trainer fehlgeschlagen',

  'hr.title': 'Herzfrequenz',
  'hr.defaultName': 'Herzfrequenz',
  'hr.disconnect': 'HF trennen',
  'hr.connect': 'HF-Gurt verbinden',
  'hr.connecting': 'Verbinden…',
  'hr.connectFailed': 'HF-Verbindung fehlgeschlagen',

  'wifi.title': 'WiFi / ANT+',
  'wifi.probe': 'Lokale Bridge prüfen',
  'wifi.default':
    'WiFi/ANT+-Trainer brauchen eine lokale Bridge (Browser-Sandbox). Bluetooth-FTMS funktioniert nativ in Chrome/Edge.',
  'wifi.wsUnavailable': 'WebSocket ist in dieser Umgebung nicht verfügbar.',
  'wifi.openFailed':
    'Lokale WiFi-Trainer-Bridge konnte nicht geöffnet werden. Nutzen Sie Bluetooth-FTMS im Browser oder eine lokale Bridge für Netzwerk-Trainer.',
  'wifi.noBridge':
    'Keine lokale Bridge unter 127.0.0.1:8787. WiFi-Trainer brauchen eine Desktop-Bridge (ANT+/Hersteller → WebSocket). Bluetooth-FTMS funktioniert ohne.',
  'wifi.online': 'Lokale WiFi-Trainer-Bridge ist online.',
  'wifi.browserLimited':
    'WiFi-Trainer sind im Browser eingeschränkt. Koppeln Sie per Bluetooth-FTMS wenn möglich, oder nutzen Sie eine lokale Bridge für Netzwerk/ANT+.',

  'auth.cloudTitle': 'Cloud-Profil',
  'auth.cloudDisabled':
    'Für Routen ist ein Cloud-Konto nötig. Setzen Sie VITE_API_URL auf Ihre Pi-API, dann registrieren oder anmelden.',
  'auth.accountTitle': 'Konto',
  'auth.accountHint': 'Melden Sie sich zuerst an oder registrieren Sie sich, um A–B auf der Karte zu setzen und eine Route zu bauen.',
  'auth.login': 'Anmelden',
  'auth.register': 'Registrieren',
  'auth.displayName': 'Anzeigename',
  'auth.displayNamePlaceholder': 'Fahrer',
  'auth.email': 'E-Mail',
  'auth.password': 'Passwort',
  'auth.logIn': 'Anmelden',
  'auth.createAccount': 'Konto erstellen',
  'auth.profile': 'Profil',
  'auth.weight': 'Gewicht (kg)',
  'auth.ftp': 'FTP (W)',
  'auth.bikeWeight': 'Radgewicht (kg)',
  'auth.saveProfile': 'Profil speichern',
  'auth.logOut': 'Abmelden',
  'auth.loggedIn': 'Angemeldet',
  'auth.accountCreated': 'Konto erstellt',
  'auth.loggedOut': 'Abgemeldet',
  'auth.profileSaved': 'Profil gespeichert',
  'auth.requestFailed': 'Anfrage fehlgeschlagen',

  'phase.idle': 'BEREIT',
  'phase.ready': 'STARTKLAR',
  'phase.riding': 'LIVE',
  'phase.paused': 'PAUSE',
  'phase.finished': 'FERTIG',

  'route.title': 'Weltroute',
  'route.subtitle':
    'Wählen Sie A → B auf der Karte. OSRM findet die Straßen; Steigung steuert den Trainer.',
  'route.setA': 'A setzen',
  'route.setB': 'B setzen',
  'route.build': 'Route bauen',
  'route.building': 'Baut…',
  'route.clear': 'Löschen',
  'route.rideComplete': 'Fahrt beendet',
  'route.rideCompleteHint':
    '{{distance}} · {{duration}} — für Garmin Connect herunterladen (manueller Import).',
  'route.downloadFit': 'FIT laden',
  'route.downloadGpx': 'GPX laden',
  'route.saveRide': 'Fahrt im Profil speichern',
  'route.saving': 'Speichert…',
  'route.start': 'Fahrt starten',
  'route.pause': 'Pause',
  'route.resume': 'Weiter',
  'route.stop': 'Stopp',
  'route.done': 'Fertig',
  'route.buildFailed': 'Routenbau fehlgeschlagen',
  'route.noExport': 'Noch kein Fahrtrack zum Export',
  'route.noSave': 'Kein Fahrtrack zum Speichern',
  'route.loginToSave': 'Zum Speichern anmelden',
  'route.alreadySaved': 'Diese Fahrt ist bereits gespeichert',
  'route.saved': 'Im Profil gespeichert (#{{id}})',
  'route.gateNoApi':
    'Routenbau braucht ein Cloud-Konto. Konfigurieren Sie VITE_API_URL für Ihre Pi-API, dann registrieren.',
  'route.gateLogin': 'Melden Sie sich an oder registrieren Sie sich, um Start/Ziel zu setzen und eine Route zu bauen.',
  'route.gateCta': 'Konto öffnen',

  'map.pickBanner': 'Tippen Sie auf die Karte für Punkt {{point}}',
  'map.followBanner': 'Straßenfolge · 3D-Kamerafahrt',
  'map.followMapillary': ' · Mapillary an',
  'map.lockedBanner': 'Zum Setzen von A–B anmelden',

  'hud.aria': 'Fahrdaten',
  'hud.speed': 'Tempo',
  'hud.power': 'Leistung',
  'hud.cadence': 'Kadenz',
  'hud.heartRate': 'Herzfrequenz',
  'hud.grade': 'Steigung',
  'hud.elevation': 'Höhe',
  'hud.distance': 'Distanz',
  'hud.time': 'Zeit',
  'hud.resistance': 'Widerstandsziel ≈ {{value}} · {{load}}-Last',
  'hud.climb': 'Anstieg',
  'hud.descent': 'Abfahrt',

  'street.aria': 'Mapillary-Straßenansicht',
  'street.label': 'Straßenbilder',
  'street.alt': 'Mapillary-Straßenansicht entlang der Route',
  'street.empty': 'Hier keine Straßenbilder',
  'street.error': 'Straßenbilder nicht verfügbar',
  'street.loading': 'Straßenbilder werden geladen…',
  'street.compass': 'Aufnahme {{capture}}° · Fahrt {{ride}}°',

  'footer.protocols':
    'Protokolle: FTMS (0x1826) · HR (0x180D) · OSRM · OpenTopoData · MapLibre / OpenFreeMap · Mapillary',
  'footer.test':
    'Test: Chrome/Edge + FTMS-Trainer · Demo-Trainer ohne Hardware · iOS Safari: kein Web Bluetooth',
};
