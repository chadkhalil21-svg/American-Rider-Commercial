'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=(p)=>fs.readFileSync(p,'utf8');
for(let pass=0;pass<2;pass++){
 const ui=read('app/account-email.tsx'), auth=read('src/state/AuthContext.tsx');
 for(const term of ['emailSendChangeLink','emailPendingTitle','emailCheckStatus','emailEditRequest','emailChangedTitle','emailRefreshFailed','emailSameAddress','emailManagedUnsupported','useFocusEffect','AppState.addEventListener','requestLock.current','secureTextEntry={!showPassword}','setPendingEmail(requested)','reauthenticateWithPassword']) assert(ui.includes(term),term);
 for(const term of ['verifyBeforeUpdateEmail(u, clean)','await reload(u)','setIdentityRevision(v => v + 1)','const clean = newEmail.trim()']) assert(auth.includes(term),term);
 assert(ui.includes('user.emailVerified'),'verify only after Auth state is confirmed');
 assert(auth.includes('await u.getIdToken(true)'),'refresh sign-in identity token after new address confirmed');
 assert(auth.includes('u.email !== beforeEmail || u.emailVerified !== beforeVerified'),'do not refresh token if identity unchanged');
 assert(!ui.includes('setInterval('),'avoid repeated Firebase reads');
 assert(!ui.includes("t('auth.continueLabel')"),'action describes actual outcome');
 const security=read('app/account-security.tsx');
 assert(security.includes("router.navigate('/account-email')"),'security opens same verified account editor');
 assert(!security.includes("mode === 'email'"),'cannot re-enter old unverified embedded email editor');
 assert(!security.includes("requestEmailChange(nextEmail"),'single source of truth for email change');
 assert(!security.includes("t('auth.continueLabel')"),'other account entrance cannot display vague Continue');

 assert(ui.includes('ar:email-change-pending:'),'pending email survives app restart per account');
 assert(ui.includes('AsyncStorage.getItem(pendingKey)'),'recover pending request on return');
 assert(ui.includes('AsyncStorage.setItem(pendingKey, requested)'),'persist only proposed address, not credential');
 assert(ui.includes('AsyncStorage.removeItem(pendingKey)'),'remove pending address after verification or correction');
 assert(!ui.includes('AsyncStorage.setItem(pendingKey, password)'),'never write password to storage');
 assert(ui.includes('resetPassword(user.email)'),'forgot password has a working recovery route');
 assert(ui.includes('sameEmail'),'unchanged address is not a valid email change');
 assert(ui.includes('emailTouched'),'invalid field has inline validation');
 assert(ui.includes('style={styles.currentCard}') && ui.includes('style={styles.fieldCard}'),'reuse existing cards');
 const primary=ui.split('<PrimaryButton')[1]?.split('/>')[0] || '';
 assert(!primary.includes('paddingVertical: 16'),'no per-screen primary button enlargement');
 const storage=read('src/state/accountStorage.ts');
 assert(storage.includes("k.startsWith(PREFIX)"),'signout cleans ar: account-scoped keys');
 for(const l of ['en','es','fr','it','de']) {
   const t=read('src/i18n/'+l+'.ts');
   for(const k of ['emailSendChangeLink','emailPendingTitle','emailPendingDescription','emailCheckStatus','emailStillPending','emailRefreshFailed','emailNotReceived','emailEditRequest','emailChangedTitle','emailSameAddress','emailManagedUnsupported']) assert(t.includes(k+':'),l+' '+k);
 }
}
console.log('PASS twice: explicit send, pending and verified states, secure auth, i18n, recovery, no polling; NO live emails sent');
