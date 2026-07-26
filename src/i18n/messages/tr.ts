import type { Messages } from './en';

export const tr: Messages = {
  'app.title': 'Kapalı Yol Sürüşü',
  'app.subtitle':
    'FTMS Bluetooth trainer, nabız ve gerçek yol eğimi — önce harita, sonra sürüş.',
  'lang.label': 'Dil',

  'browser.title': 'Tarayıcı',
  'bt.noBrowser': 'Bluetooth yalnızca tarayıcıda kullanılabilir.',
  'bt.iosSafari':
    'Web Bluetooth iOS Safari’de desteklenmez. Android, Windows veya macOS’ta Chrome/Edge kullanın — ya da iOS’ta Bluefy benzeri bir tarayıcı.',
  'bt.needsHttps': 'Web Bluetooth için HTTPS veya localhost gerekir.',
  'bt.unsupported': 'Bu tarayıcı Web Bluetooth desteklemiyor. Chrome veya Edge kullanın.',
  'bt.available':
    'Web Bluetooth hazır. İstendiğinde FTMS trainer veya nabız kayışınızı eşleştirin.',

  'conn.unsupported': 'desteklenmiyor',
  'conn.disconnected': 'bağlı değil',
  'conn.connecting': 'bağlanıyor',
  'conn.connected': 'bağlı',
  'conn.error': 'hata',

  'trainer.title': 'Bisiklet trainer',
  'trainer.demoName': 'Demo Trainer (Mock)',
  'trainer.defaultName': 'FTMS Trainer',
  'trainer.disconnect': 'Bağlantıyı kes',
  'trainer.connect': 'FTMS bağla',
  'trainer.connecting': 'Bağlanıyor…',
  'trainer.useDemo': 'Demo trainer kullan',
  'trainer.demoEffort': 'Demo efor',
  'trainer.connectFailed': 'Trainer bağlantısı başarısız',
  'trainer.mockFailed': 'Demo trainer başarısız',

  'hr.title': 'Nabız',
  'hr.defaultName': 'Nabız',
  'hr.disconnect': 'Nabız bağlantısını kes',
  'hr.connect': 'Nabız kayışı bağla',
  'hr.connecting': 'Bağlanıyor…',
  'hr.connectFailed': 'Nabız bağlantısı başarısız',

  'wifi.title': 'WiFi / ANT+',
  'wifi.probe': 'Yerel köprüyü dene',
  'wifi.default':
    'WiFi/ANT+ trainer’lar yerel köprü ister (tarayıcı kısıtı). Bluetooth FTMS Chrome/Edge’de yerel çalışır.',
  'wifi.wsUnavailable': 'Bu ortamda WebSocket yok.',
  'wifi.openFailed':
    'Yerel WiFi trainer köprüsü açılamadı. Tarayıcıda Bluetooth FTMS kullanın veya ağ trainer’ları için yerel köprü çalıştırın.',
  'wifi.noBridge':
    '127.0.0.1:8787’de köprü yok. WiFi trainer’lar masaüstü köprü ister (ANT+/üretici → WebSocket). Bluetooth FTMS köprüsüz çalışır.',
  'wifi.online': 'Yerel WiFi trainer köprüsü çevrimiçi.',
  'wifi.browserLimited':
    'WiFi trainer’lar tarayıcıda sınırlıdır. Mümkünse Bluetooth FTMS ile eşleştirin veya ağ/ANT+ için yerel köprü kullanın.',

  'auth.cloudTitle': 'Bulut profil',
  'auth.cloudDisabled':
    'Rota oluşturmak için bulut hesabı gerekir. Pi API’niz için VITE_API_URL ayarlayın, sonra kayıt olun veya giriş yapın.',
  'auth.accountTitle': 'Hesap',
  'auth.accountHint': 'Haritada A–B seçmek ve rota oluşturmak için önce giriş yapın veya kayıt olun.',
  'auth.login': 'Giriş',
  'auth.register': 'Kayıt',
  'auth.displayName': 'Görünen ad',
  'auth.displayNamePlaceholder': 'Sürücü',
  'auth.email': 'E-posta',
  'auth.password': 'Şifre',
  'auth.logIn': 'Giriş yap',
  'auth.createAccount': 'Hesap oluştur',
  'auth.profile': 'Profil',
  'auth.weight': 'Kilo (kg)',
  'auth.ftp': 'FTP (W)',
  'auth.bikeWeight': 'Bisiklet ağırlığı (kg)',
  'auth.saveProfile': 'Profili kaydet',
  'auth.logOut': 'Çıkış',
  'auth.loggedIn': 'Giriş yapıldı',
  'auth.accountCreated': 'Hesap oluşturuldu',
  'auth.loggedOut': 'Çıkış yapıldı',
  'auth.profileSaved': 'Profil kaydedildi',
  'auth.requestFailed': 'İstek başarısız',

  'phase.idle': 'BOŞTA',
  'phase.ready': 'HAZIR',
  'phase.riding': 'CANLI',
  'phase.paused': 'DURAKLATILDI',
  'phase.finished': 'BİTTİ',

  'route.title': 'Dünya rotası',
  'route.subtitle':
    'Haritada A → B seçin. OSRM yolları bulur; eğim trainer direncini belirler.',
  'route.setA': 'A belirle',
  'route.setB': 'B belirle',
  'route.build': 'Rota oluştur',
  'route.building': 'Oluşturuluyor…',
  'route.clear': 'Temizle',
  'route.rideComplete': 'Sürüş tamam',
  'route.rideCompleteHint':
    '{{distance}} · {{duration}} — Garmin Connect için indirin (manuel içe aktarma).',
  'route.downloadFit': 'FIT indir',
  'route.downloadGpx': 'GPX indir',
  'route.saveRide': 'Sürüşü profile kaydet',
  'route.saving': 'Kaydediliyor…',
  'route.start': 'Sürüşe başla',
  'route.pause': 'Duraklat',
  'route.resume': 'Devam',
  'route.stop': 'Durdur',
  'route.done': 'Tamam',
  'route.buildFailed': 'Rota oluşturulamadı',
  'route.noExport': 'Dışa aktarılacak sürüş izi yok',
  'route.noSave': 'Kaydedilecek sürüş izi yok',
  'route.loginToSave': 'Sürüş kaydetmek için giriş yapın',
  'route.alreadySaved': 'Bu sürüş zaten kaydedildi',
  'route.saved': 'Profile kaydedildi (#{{id}})',
  'route.gateNoApi':
    'Rota oluşturmak için bulut hesabı gerekir. Pi API için VITE_API_URL ayarlayın, sonra kayıt olun.',
  'route.gateLogin': 'Başlangıç/bitiş seçmek ve rota oluşturmak için giriş yapın veya kayıt olun.',
  'route.gateCta': 'Hesabı aç',

  'map.pickBanner': 'Nokta {{point}} için haritaya dokunun',
  'map.followBanner': 'Yolu takip · 3D sürüş kamerası',
  'map.followMapillary': ' · Mapillary açık',
  'map.lockedBanner': 'Haritada A–B seçmek için giriş yapın',

  'hud.aria': 'Sürüş metrikleri',
  'hud.speed': 'Hız',
  'hud.power': 'Güç',
  'hud.cadence': 'Kadens',
  'hud.heartRate': 'Nabız',
  'hud.grade': 'Eğim',
  'hud.elevation': 'İrtifa',
  'hud.distance': 'Mesafe',
  'hud.time': 'Süre',
  'hud.resistance': 'Direnç hedefi ≈ {{value}} · {{load}} yükü',
  'hud.climb': 'Tırmanış',
  'hud.descent': 'İniş',

  'street.aria': 'Mapillary sokak görüntüsü',
  'street.label': 'Sokak görüntüsü',
  'street.alt': 'Rota boyunca Mapillary sokak görüntüsü',
  'street.empty': 'Burada sokak görüntüsü yok',
  'street.error': 'Sokak görüntüsü yok',
  'street.loading': 'Sokak görüntüsü yükleniyor…',
  'street.compass': 'Çekim yönü {{capture}}° · sürüş {{ride}}°',

  'footer.protocols':
    'Protokoller: FTMS (0x1826) · HR (0x180D) · OSRM · OpenTopoData · MapLibre / OpenFreeMap · Mapillary',
  'footer.test':
    'Test: Chrome/Edge + FTMS trainer · Demo trainer donanımsız çalışır · iOS Safari: Web Bluetooth yok',
};
