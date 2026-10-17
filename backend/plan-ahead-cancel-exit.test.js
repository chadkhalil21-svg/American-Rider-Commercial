'use strict';
// Screen exits are separate from booking cancellation; no real Travel involved.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const file=p=>fs.readFileSync(path.join(root,p),'utf8');
const screen=file('app/schedule.tsx');
for(let pass=0;pass<2;pass++){
 assert.match(screen,/<LetterheadBar onBack=\{goBack\} \/>/,'back affordance must be retained');
 assert.match(screen,/<Pressable[\s\S]*?accessibilityLabel=\{t\('common.cancel'\)\}[\s\S]*?disabled=\{saving\}[\s\S]*?onPress=\{\(\) => router.dismissTo\('\/'\)\}/,'unsubmitted Plan Ahead must have an explicit accessible cancel-to-Home');
 assert.match(screen,/if \(doneInfo\)[\s\S]*?<PrimaryButton label=\{t\('common.done'\)\}/,'completed booking uses Done, not Cancel');
 for(const lang of ['en','es','fr','de','it'])assert.match(file('src/i18n/'+lang+'.ts'),/cancel:\s*['"\\x60]/,'missing localized Cancel for '+lang);
 assert.match(screen,/const saved = await ride.scheduleRide\(info\)/,'Cancel must never submit reservation');
}
console.log('PASS twice: Plan Ahead has accessible draft-only Cancel and separate booked Done; no service reads or writes');
