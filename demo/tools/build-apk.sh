#!/usr/bin/env bash
# Builds the Android app, dist/SkillForgeArena.apk, without Gradle or Google's SDK servers: the
# build tools and the API-23 platform jar come from the Ubuntu archive.
#
#   tools/build-apk.sh               page (tools/build.js --offline) + APK
#   tools/build-apk.sh --skip-page   package the dist/offline/index.html already there
#
# Pipeline: offline page -> android/assets/www/index.html, javac (Java 8 bytecode against
# android.jar) -> dx -> aapt package (manifest, res, assets) -> add classes.dex -> zipalign ->
# apksigner (android/debug.keystore, made once) -> verify. Intermediates go to android/build/.
set -euo pipefail

DEMO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEMO"

ANDROID_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
APP=android
BUILD=$APP/build
APK=dist/SkillForgeArena.apk
KEYSTORE=$APP/debug.keystore
PACKAGES=(aapt zipalign apksigner dalvik-exchange android-sdk-platform-23)

skip_page=0
for arg in "$@"; do
  case "$arg" in
    --skip-page) skip_page=1 ;;
    *) echo "usage: tools/build-apk.sh [--skip-page]" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$*"; }
# The Java tools below are local-only; without the proxy settings they stop printing
# "Picked up JAVA_TOOL_OPTIONS" on every call.
java_tool() { env -u JAVA_TOOL_OPTIONS "$@"; }

step "build tools"
missing=()
for p in "${PACKAGES[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p"); done
if ((${#missing[@]})); then
  sudo=""
  if [ "$(id -u)" -ne 0 ]; then sudo=sudo; fi
  echo "installing ${missing[*]}"
  $sudo apt-get update -qq || true # an unreachable third-party list must not stop us
  DEBIAN_FRONTEND=noninteractive $sudo apt-get install -y -qq "${missing[@]}"
fi
for t in aapt zipalign apksigner dalvik-exchange javac keytool node; do
  command -v "$t" >/dev/null || { echo "missing tool: $t" >&2; exit 1; }
done
[ -f "$ANDROID_JAR" ] || { echo "missing $ANDROID_JAR" >&2; exit 1; }
echo "ok: $(aapt version), dx $(java_tool dalvik-exchange --version 2>&1 | sed 's/^dx version //'), $(java_tool javac -version 2>&1)"

if ((skip_page)); then
  step "page: using the existing dist/offline/index.html"
else
  step "page: node tools/build.js --offline"
  node tools/build.js --offline
fi
[ -s dist/offline/index.html ] || { echo "no dist/offline/index.html" >&2; exit 1; }
mkdir -p "$APP/assets/www"
cp dist/offline/index.html "$APP/assets/www/index.html"

step "javac"
rm -rf "$BUILD"
mkdir -p "$BUILD/classes"
mapfile -t sources < <(find "$APP/src" -name '*.java' | sort)
java_tool javac -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -encoding UTF-8 \
  -Xlint:all -Xlint:-options -d "$BUILD/classes" "${sources[@]}"
echo "${#sources[@]} sources"

step "dx"
java_tool dalvik-exchange --dex --output="$BUILD/classes.dex" "$BUILD/classes"
ls -l "$BUILD/classes.dex"

step "aapt package"
aapt package -f -M "$APP/AndroidManifest.xml" -S "$APP/res" -A "$APP/assets" -I "$ANDROID_JAR" \
  -F "$BUILD/unaligned.apk"
(cd "$BUILD" && aapt add -f unaligned.apk classes.dex >/dev/null)
aapt list "$BUILD/unaligned.apk"

step "zipalign"
zipalign -f -p 4 "$BUILD/unaligned.apk" "$BUILD/aligned.apk"

step "sign"
if [ ! -f "$KEYSTORE" ]; then
  echo "creating $KEYSTORE (debug key, password android)"
  java_tool keytool -genkeypair -noprompt -keystore "$KEYSTORE" -storetype PKCS12 \
    -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 \
    -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
fi
mkdir -p dist
java_tool apksigner sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey --out "$APK" "$BUILD/aligned.apk"
rm -f "$APK.idsig"

step "verify"
zipalign -c -p 4 "$APK" && echo "zipalign: ok"
java_tool apksigner verify --verbose "$APK"
aapt dump badging "$APK"

printf '\n%s  %s bytes\n' "$DEMO/$APK" "$(stat -c %s "$APK")"
