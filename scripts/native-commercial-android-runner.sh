#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.maestro/bin:$PATH"
mkdir -p artifacts/native-commercial-android
APK='.qa-native-build-cache/android/app-release.apk'
test -s "$APK"
OP='emulator-5554'
TR='emulator-5556'
SECONDARY_PID=''
OP_FLOW_PID=''
cleanup() {
  if [ -n "$OP_FLOW_PID" ]; then kill "$OP_FLOW_PID" 2>/dev/null || true; fi
  if [ -n "$SECONDARY_PID" ]; then
    adb -s "$TR" emu kill >/dev/null 2>&1 || true
    kill "$SECONDARY_PID" 2>/dev/null || true
  fi
}
# Do not diagnose from a single missing button. Keep BOTH device screens,
# native logs, Maestro command hierarchies, and read-only LOCAL ride state.
collect_failure() {
  node backend/native-commercial-qa-readonly-snapshot.cjs > artifacts/native-commercial-android/failure-local-dispatch.json 2>&1 || true
  for device in "$OP" "$TR"; do
    adb -s "$device" exec-out screencap -p > "artifacts/native-commercial-android/failure-${device}.png" 2>/dev/null || true
    adb -s "$device" logcat -d -t 2000 > "artifacts/native-commercial-android/failure-${device}.logcat" 2>/dev/null || true
  done
  mkdir -p artifacts/native-commercial-android/maestro-debug
  if [ -d "$HOME/.maestro/tests" ]; then
    for folder in $(ls -1dt "$HOME"/.maestro/tests/* 2>/dev/null | head -2); do
      cp -R "$folder" artifacts/native-commercial-android/maestro-debug/ 2>/dev/null || true
    done
  fi
}
finish() {
  local exit_code=$?
  trap - EXIT
  if [ "$exit_code" -ne 0 ]; then collect_failure; fi
  cleanup
  exit "$exit_code"
}
trap finish EXIT
# A server-assigned offer cannot be accepted after its response window expires.
# The former sequential, same-emulator role swap cleared the active session
# and spent the offer window signing the Operator in AFTER Traveler booking.
# Use two real concurrent emulator instances; NEVER fake a request or relax TTL.
AVDMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
test -x "$AVDMANAGER"
printf 'no\n' | "$AVDMANAGER" create avd --force --name qa-native-traveler --package 'system-images;android-35;google_apis;x86_64' --device 'pixel_6'
"$ANDROID_HOME/emulator/emulator" -avd qa-native-traveler -port 5556 -no-window -no-audio -no-snapshot -no-boot-anim -gpu swiftshader_indirect -memory 2048 > artifacts/native-commercial-android/traveler-emulator.log 2>&1 &
SECONDARY_PID=$!
for attempt in $(seq 1 180); do
  state="$(adb -s "$TR" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
  [ "$state" = '1' ] && break
  kill -0 "$SECONDARY_PID" || { echo 'QA secondary emulator exited'; tail -50 artifacts/native-commercial-android/traveler-emulator.log; exit 1; }
  sleep 2
done
[ "$(adb -s "$TR" shell getprop sys.boot_completed | tr -d '\r')" = '1' ] || { echo 'QA second emulator did not boot'; exit 1; }
for device in "$OP" "$TR"; do
  adb -s "$device" wait-for-device
  adb -s "$device" install -r "$APK"
  adb -s "$device" emu geo fix -80.1918 25.7617
  adb -s "$device" shell pm grant com.americanrider.app android.permission.ACCESS_FINE_LOCATION
  adb -s "$device" shell pm grant com.americanrider.app android.permission.ACCESS_COARSE_LOCATION
  adb -s "$device" shell settings put global window_animation_scale 0
  adb -s "$device" shell settings put global transition_animation_scale 0
  adb -s "$device" shell settings put global animator_duration_scale 0
done
node scripts/prepare-native-maestro-parallel-roles.cjs
# Operator signs in and enters service BEFORE a Traveler books on the
# other emulator. Keep both sessions independently running.
if ! maestro --device "$OP" test --test-output-dir=artifacts/native-commercial-android/maestro-operator-start .maestro/generated/qa-commercial-operator-start.yml > artifacts/native-commercial-android/operator-start.log 2>&1; then
  tail -90 artifacts/native-commercial-android/operator-start.log
  exit 1
fi
node backend/native-commercial-qa-refresh-presence.cjs
# Wait on the actual, same local Firestore Travel from the Operator device
# while the Traveler enters Stripe TEST payment on the second device.
maestro --device "$OP" test --test-output-dir=artifacts/native-commercial-android/maestro-operator-fulfill .maestro/generated/qa-commercial-operator-fulfill.yml > artifacts/native-commercial-android/operator.log 2>&1 &
OP_FLOW_PID=$!
# The 28 October dual-device run 40710541111 lost ADB transport while
# launching the second emulator, BEFORE any Traveler UI assertion or payment.
# Permit ONE bounded recovery exclusively for that proven infrastructure error.
# Never retry a partially booked/charged Travel, or conceal a real app failure.
if ! maestro --device "$TR" test --test-output-dir=artifacts/native-commercial-android/maestro-traveler .maestro/generated/qa-commercial-traveler.yml > artifacts/native-commercial-android/traveler.log 2>&1; then
  if grep -q 'Launch app "com.americanrider.app" with clear state' artifacts/native-commercial-android/traveler.log \
    && ! grep -Eq 'Assert that|Tap on|Input text|COMPLETED' artifacts/native-commercial-android/traveler.log \
    && grep -Rq 'device offline' artifacts/native-commercial-android/maestro-traveler/ 2>/dev/null; then
    echo 'QA infrastructure: Traveler device went offline during app launch; probing bounded ADB recovery.'
    ready=0
    for attempt in $(seq 1 25); do
      state="$(adb -s "$TR" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
      if [ "$state" = '1' ]; then ready=1; break; fi
      sleep 2
    done
    # Only retry when the isolated Firestore has NO booked Travel, guaranteed
    # by the interrupted launch step and checked again before any new tap.
    node backend/native-commercial-qa-readonly-snapshot.cjs > artifacts/native-commercial-android/pre-retry-readonly-snapshot.json 2>&1 || true
    if [ "$ready" -eq 1 ] && grep -q '"rides": \[\]' artifacts/native-commercial-android/pre-retry-readonly-snapshot.json; then
      echo 'QA infrastructure: both device connectivity and zero booked Travels verified; single launch retry.'
      if maestro --device "$TR" test --test-output-dir=artifacts/native-commercial-android/maestro-traveler-retry .maestro/generated/qa-commercial-traveler.yml > artifacts/native-commercial-android/traveler-retry.log 2>&1; then
        echo 'PASS: Traveler recovered after transient ADB disconnect before booking.'
      else
        tail -90 artifacts/native-commercial-android/traveler-retry.log
        exit 1
      fi
    else
      echo 'QA infrastructure: ADB/zero-Travel preconditions unavailable; refusing an unsafe retry.'
      exit 1
    fi
  else
    tail -90 artifacts/native-commercial-android/traveler.log
    exit 1
  fi
fi
# Record actual matching/assignment state independent of the onscreen button.
node backend/native-commercial-qa-readonly-snapshot.cjs > artifacts/native-commercial-android/dispatch-after-traveler.json 2>&1 || true
if ! wait "$OP_FLOW_PID"; then
  OP_FLOW_PID=''
  tail -90 artifacts/native-commercial-android/operator.log
  exit 1
fi
OP_FLOW_PID=''
node backend/native-commercial-qa-reconcile.cjs
