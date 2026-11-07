# Google Play Console — ROADLAB (`com.roadlab.app`)

Everything to paste into Play Console. Graphics are in this folder.

| Asset | File |
|---|---|
| App icon 512×512 | `icon-512.png` |
| Feature graphic 1024×500 | `feature-graphic-1024x500.png` |
| Phone screenshots 1080×1920 | `screenshots/1-ride.png` … `4-map.png` |
| Privacy policy URL | https://newtrainer.trihonor.com/privacy.html |
| Account deletion URL | https://newtrainer.trihonor.com/privacy.html#delete-account |

## Store listing — English (default)

**App name** (≤30): `ROADLAB – Indoor Road Ride`

**Short description** (≤80):
`Ride real roads on your smart trainer. Any route on the map, real climbs.`

**Full description:**

```
ROADLAB turns your smart trainer into a ride on real roads.

Pick any start and finish on the world map, build a route, and ride it from home. The app follows the real elevation of the road and sets your trainer's resistance as the gradient changes, so climbs feel like climbs.

• Connect Bluetooth smart trainers (FTMS) and heart-rate straps
• Build routes anywhere in the world, with waypoints and place search
• Real-road elevation: trainer resistance follows the gradient
• Satellite, outdoor and street maps; street-level photos while you ride
• Live power, speed, cadence, heart rate and grade
• ERG mode with power targets for workouts and FTP tests
• Group rides: share a room code and ride the same route together
• Export your ride as FIT or GPX
• Demo trainer: try everything without hardware
• Free, no ads. An account is optional, only for saving ride summaries and group rides

Works with trainers that support the Bluetooth Fitness Machine Service (FTMS).

ROADLAB is a training tool, not a medical device. If you feel unwell, stop and see a professional.
```

## Store listing — Türkçe

**Uygulama adı:** `ROADLAB – Evde Gerçek Yol`

**Kısa açıklama:**
`Akıllı trainer'ında gerçek yollarda sür. Haritada istediğin rota, gerçek tırmanış.`

**Tam açıklama:**

```
ROADLAB akıllı trainer'ını gerçek yollarda bir sürüşe dönüştürür.

Dünya haritasında başlangıç ve bitişi seç, rotanı oluştur ve evden sür. Uygulama yolun gerçek yükseltisini takip eder ve eğim değiştikçe trainer'ının direncini ayarlar; tırmanışlar gerçekten tırmanış gibi hissettirir.

• Bluetooth akıllı trainer (FTMS) ve nabız kemeri bağlantısı
• Dünyanın her yerinde rota: ara noktalar ve yer arama
• Gerçek yol yükseltisi: direnç eğime göre değişir
• Uydu, outdoor ve sokak haritaları; sürüşte sokak fotoğrafları
• Canlı güç, hız, kadans, nabız ve eğim
• Antrenman ve FTP testi için güç hedefli ERG modu
• Grup sürüşü: oda koduyla aynı rotada birlikte sür
• Sürüşünü FIT veya GPX olarak dışa aktar
• Demo trainer: donanım olmadan her şeyi dene
• Ücretsiz, reklamsız. Hesap isteğe bağlı; sadece sürüş özeti kaydetmek ve grup sürüşü için

Bluetooth Fitness Machine Service (FTMS) destekleyen trainer'larla çalışır.

ROADLAB bir antrenman aracıdır, tıbbi cihaz değildir. Kendini iyi hissetmezsen dur ve bir uzmana danış.
```

**Category:** Health & Fitness · **Tags:** Cycling, Fitness tracking · **Contact email:** (Play developer email)

## App content (Policy → App content)

**Privacy policy:** URL above.

**Ads:** No, the app does not contain ads.

**App access:** All functionality is available without special access. (Reviewers can use *Menu → Use demo trainer*; account is optional.)

**Target audience:** 16-17 and 18+ (matches the 16+ account age in the Terms; nothing under 13, which keeps the app out of the Families program). Not designed to appeal to children.

**Content rating (IARC questionnaire):** Category *All other app types*. Answer **No** to violence, sexual content, language, controlled substances, gambling. Users can interact: **Yes**, limited, since group riders see each other's display name and position; no chat or free text messaging. Shares user location: **No**. Digital purchases: **No**. Expected rating: Everyone / PEGI 3.

**Health apps declaration:** Activity and fitness. Not a medical device; no health-condition features.

**Government app / Financial features / News:** No.

**Data safety:**

| Question | Answer |
|---|---|
| Collects or shares any required user data types? | Yes |
| All data encrypted in transit? | Yes |
| Users can request data deletion? | Yes (in-app + URL above) |
| Account creation | Username + password (email login). Account is optional |
| Account deletion URL | URL above |

Data types, all **Collected**, **not Shared**, **Optional** (only with an account), purpose **App functionality** + **Account management**, not processed ephemerally:

- Personal info → **Email address**
- Personal info → **Name** (display name)
- Health and fitness → **Fitness info** (ride summaries: power, heart rate, cadence, speed, distance; body weight, FTP)

Do **not** tick Location: the app never reads device location (Bluetooth scan uses `neverForLocation`; location permission is only declared for Android ≤ 11, where the system requires it for Bluetooth scanning). Map/route providers (see privacy policy) receive the points the user picks; that is processing by service providers, not sharing.

## Release

1. Build with `npm run release:android` (bakes in the production API URL and the Maps key from Google Cloud and fails if either is missing; never use a plain `bundleRelease`). Then Testing → **Internal testing** → Create release → upload `android/app/build/outputs/bundle/release/app-release.aab`.
2. Release notes:
   ```
   <en-US>
   First release: smart trainer + heart rate over Bluetooth, routes anywhere on the map, real-road climbs, group rides, FIT/GPX export.
   </en-US>
   <tr-TR>
   İlk sürüm: Bluetooth ile akıllı trainer + nabız, haritada her yere rota, gerçek yol tırmanışları, grup sürüşü, FIT/GPX dışa aktarma.
   </tr-TR>
   ```
3. Personal developer accounts created after Nov 2023 must run a **closed test with at least 12 testers for 14 days** before Production access is granted.
