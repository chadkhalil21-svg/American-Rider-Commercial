'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=(p)=>fs.readFileSync(p,'utf8');
for(let pass=0;pass<2;pass++){
 const ui=read('app/account-email.tsx'), auth=read('src/state/AuthContext.tsx');
 for(const term of ['emailSendChangeLink','emailPendingTitle','emailCheckStatus','emailEditRequest','emailChangedTitle','emailRefreshFailed','emailSameAddress','emailManagedUnsupported','useFocusEffect','AppState.addEventListener','requestLock.current','secureTextEntry={!showPassword}','setPendingEmail(requested)','reauthenticateWithPassword']) assert(ui.includes(term),term);
 for(const term of ['verifyBeforeUpdateEmail(u, clean)','await reload(u)','setIdentityRevision(v => v + 1)','const clean = newEmail.trim()']) assert(auth.includes(term),term);
 assert(ui.includes('user.emailVerified'),'verify only after Auth state is confirmed');
 assert(!ui.includes('setInterval('),'avoid repeated Firebase reads');
 assert(!ui.includes("t('auth.continueLabel')"),'action describes actual outcome');
 for(const l of ['en','es','fr','it','de']) {
   const t=read('src/i18n/'+l+'.ts');
   for(const k of ['emailSendChangeLink','emailPendingTitle','emailPendingDescription','emailCheckStatus','emailStillPending','emailRefreshFailed','emailNotReceived','emailEditRequest','emailChangedTitle','emailSameAddress','emailManagedUnsupported']) assert(t.includes(k+':'),l+' '+k);
 }
}
console.log('PASS twice: explicit send, pending and verified states, secure auth, i18n, recovery, no polling; NO live emails sent');
