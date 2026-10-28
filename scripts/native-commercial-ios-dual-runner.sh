#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.maestro/bin:$PATH"
test "$AR_NATIVE_QA_LOCAL" = 1
test "$GOOGLE_CLOUD_PROJECT" = demo-american-rider-qa
case "$STRIPE_SECRET_KEY" in sk_test_*) ;; *) echo "QA_ONLY_STRIPE_TEST_REQUIRED"; exit 1;; esac
test -n "$SIM_DEVICE" && test -n "$SIM_OPERATOR"
test "$SIM_DEVICE" != "$SIM_OPERATOR"
mkdir -p artifacts/native-commercial-ios
node scripts/native-qa-ios-prepare-role-flows.cjs
node backend/native-commercial-qa-refresh-presence.cjs
(
 while true; do
   sleep 45
   node backend/native-commercial-qa-refresh-presence.cjs || exit 1
 done
) > artifacts/native-commercial-ios/qa-presence-heartbeat.log 2>&1 &
HEARTBEAT_PID=$!
OFFER_PID=''
cleanup(){
 kill "$HEARTBEAT_PID" 2>/dev/null || true
 if [ -n "$OFFER_PID" ]; then kill "$OFFER_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
# First Maestro invocation must INSTALL and START Apple's XCUITest driver.
# It is not a sign-in failure if Xcode's initial runner start exceeds the
# business-step budget. Later flows must never retry a booking, charge or offer.
# Maestro's own startup timeout remains independent of each flow's cap.
run_maestro(){
  local label="$1" device="$2" flow="$3" limit="$4"
  python3 - "$label" "$device" "$flow" "$limit" <<'PY'
import os,sys,subprocess,signal,pathlib
label,device,flow,limit=sys.argv[1:]; limit=int(limit)
out=pathlib.Path('artifacts/native-commercial-ios/'+label+'.log')
with out.open('w') as f:
    p=subprocess.Popen(['maestro','--device',device,'test',flow],
                       stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
    try: return_code=p.wait(timeout=limit)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid,signal.SIGTERM)
        try: p.wait(timeout=8)
        except subprocess.TimeoutExpired: os.killpg(p.pid,signal.SIGKILL)
        print('QA_IOS_STAGE_TIMEOUT',label,limit,'seconds',flush=True)
        # Inspect XCUITest driver on a cold host before diagnosing app login.
        # Keep the OS/driver logs even when the UI was never reached.
        import glob,shutil
        dest=pathlib.Path('artifacts/native-commercial-ios/driver-evidence-'+label)
        dest.mkdir(parents=True,exist_ok=True)
        roots=glob.glob(os.path.expanduser('~/.maestro/tests/*/'))
        if roots:
            latest=max(roots,key=os.path.getmtime)
            for src in glob.glob(os.path.join(latest,'maestro.log'))+glob.glob(os.path.join(latest,'xctest_runner_*.log')):
                shutil.copy2(src,dest/pathlib.Path(src).name)
            marker=dest/'driver-diagnostic.txt'
            log=(dest/'maestro.log').read_text(errors='replace') if (dest/'maestro.log').exists() else ''
            xctest=' '.join(p.read_text(errors='replace')[-1200:] for p in dest.glob('xctest_runner_*.log'))
            marker.write_text('driver_port_unreachable='+str('Failed to connect to /127.0.0.1:' in log)
                +'\nxcodebuild_interrupted='+str('BUILD INTERRUPTED' in xctest)
                +'\nflow='+label+'\n')
            print('QA_IOS_DRIVER_DIAGNOSIS',marker.read_text().replace('\n',';'),flush=True)
        return_code=124
if return_code:
    print('QA_IOS_STAGE_FAILED',label,'exit',return_code,flush=True)
    print('\n'.join(out.read_text(errors='replace').splitlines()[-45:]),flush=True)
    sys.exit(return_code)
print('PASS: native iPhone stage',label,flush=True)
PY
}
echo 'QA_IOS_STAGE=operator_login_and_on_duty'
# The first native stage initializes XCTest from a cold macOS/Xcode runner.
# Allow the full driver budget plus actual UI time; not a blank 4-minute kill.
run_maestro operator-start "$SIM_OPERATOR" .maestro/generated/qa-commercial-ios-operator-start.yml 660
echo 'QA_IOS_STAGE=two_device_offer_and_traveler_payment'
run_maestro operator-offer "$SIM_OPERATOR" .maestro/generated/qa-commercial-ios-operator-offer.yml 650 &
OFFER_PID=$!
# The Traveler pays in a SEPARATE actual iPhone simulator while the Operator
# is already in service and monitoring offers on their own device.
run_maestro traveler "$SIM_DEVICE" .maestro/generated/qa-commercial-traveler.yml 650
wait "$OFFER_PID"
OFFER_PID=''
node scripts/native-qa-ios-confirm-accepted.cjs
# Only refresh stationary pickup presence until genuine acceptance. Once the
# app is driving, the signed-in Operator must supply live GPS itself; the QA
# heartbeat intentionally refuses to overwrite a destination location.
kill "$HEARTBEAT_PID" 2>/dev/null || true
wait "$HEARTBEAT_PID" 2>/dev/null || true
HEARTBEAT_PID=''
echo 'QA_IOS_STAGE=operator_arrive_board'
run_maestro operator-board "$SIM_OPERATOR" .maestro/generated/qa-commercial-ios-operator-board.yml 240
# This guard reads the same local Travel's destination only AFTER server acceptance
# and on-device boarding. No synthetic Firestore writes or fake completion.
DESTINATION=''
for attempt in $(seq 1 10); do
 if DESTINATION="$(node scripts/native-qa-operator-destination.cjs coordinates 2> artifacts/native-commercial-ios/destination-preflight.log)"; then break; fi
 sleep 2
done
if [ -z "$DESTINATION" ]; then
 echo 'QA_IOS_DESTINATION_NOT_READY'
 tail -25 artifacts/native-commercial-ios/destination-preflight.log
 exit 1
fi
read -r DEST_LNG DEST_LAT <<< "$DESTINATION"
echo 'QA_IOS_STAGE=physical_destination_location'
xcrun simctl location "$SIM_OPERATOR" set "$DEST_LAT,$DEST_LNG"
# Let the actual signed-in Operator app renew authenticated presence; the local
# server still applies the unchanged radius and five-minute freshness gate.
READY=0
for attempt in $(seq 1 55); do
 if node scripts/native-qa-operator-destination.cjs verify > artifacts/native-commercial-ios/destination-position.log 2>&1; then
   READY=1
   break
 fi
 sleep 4
done
if [ "$READY" -ne 1 ]; then
 echo 'QA_IOS_DESTINATION_NOT_RENEWED'
 cat artifacts/native-commercial-ios/destination-position.log
 exit 1
fi
cat artifacts/native-commercial-ios/destination-position.log
echo 'QA_IOS_STAGE=operator_actual_completion'
run_maestro operator-complete "$SIM_OPERATOR" .maestro/generated/qa-commercial-ios-operator-complete.yml 180
# Do not rely on the QA presence heartbeat after the Operator moves.
# Fresh authenticated destination telemetry has already been asserted above.
echo 'QA_IOS_STAGE=real_stripe_test_reconciliation'
node backend/native-commercial-qa-reconcile.cjs | tee artifacts/native-commercial-ios/reconciliation.log
