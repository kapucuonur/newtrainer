#!/usr/bin/env bash
# Build the signed Play Store bundle with the same config as the production web app.
# The Maps key is read from Google Cloud into the build env only (never written to disk or printed).
# Requires: gcloud logged in with access to project roadlab-513516, android/keystore.properties.
set -euo pipefail
cd "$(dirname "$0")/.."

export VITE_API_URL=https://newtrainer-api.trihonor.com
VITE_GOOGLE_MAPS_API_KEY="$(gcloud services api-keys get-key-string \
  projects/roadlab-513516/locations/global/keys/6fe9fd06-4296-4f8a-b939-747a4350eaff \
  --format='value(keyString)')"
export VITE_GOOGLE_MAPS_API_KEY
test -n "$VITE_GOOGLE_MAPS_API_KEY" || { echo "Maps key not available from gcloud" >&2; exit 1; }

npm run build:android
(cd android && ./gradlew bundleRelease -q)

AAB=android/app/build/outputs/bundle/release/app-release.aab
jarsigner -verify "$AAB" >/dev/null && echo "signature ok"
# Fail if the bundle is missing production config (would ship without accounts or Street View).
JS="$(mktemp)"; trap 'rm -f "$JS"' EXIT
unzip -p "$AAB" 'base/assets/public/assets/*.js' > "$JS"
grep -q 'newtrainer-api.trihonor.com' "$JS" || { echo "API URL missing from bundle" >&2; exit 1; }
grep -qE 'AIza[0-9A-Za-z_-]{35}' "$JS" || { echo "Maps key missing from bundle" >&2; exit 1; }
echo "bundle ok: $AAB"
