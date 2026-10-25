import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// Evaluate the production TypeScript helper, not a second hand-written casing algorithm.
const code = ts.transpileModule(read('src/menuTitleCase.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(code, { exports });
const title = exports.menuTitleCase;
assert.equal(typeof title, 'function');
for (const [text, expected] of [
  ['American Rider messages', 'American Rider Messages'],
  ['Scheduled travel', 'Scheduled Travel'],
  ['Operator qualification status', 'Operator Qualification Status'],
  ['Travel in progress', 'Travel in Progress'],
  ['Switch to Operator view', 'Switch to Operator View'],
  ['Invite a Traveler', 'Invite a Traveler'],
  ['Operate with American Rider', 'Operate with American Rider'],
  ['About American Rider', 'About American Rider'],
  ['Sign Out', 'Sign Out'],
  ['QR code and PIN entry', 'QR Code and PIN Entry'],
]) assert.equal(title(text, 'en'), expected, text);

for (const [locale, phrase] of [
  ['es','Mensajes de American Rider'],
  ['fr','Messages d’American Rider'],
  ['de','Nachrichten von American Rider'],
  ['it','Messaggi di American Rider'],
]) assert.equal(title(phrase, locale), phrase, 'Do not impose English casing on '+locale);

const traveler = read('app/index.tsx');
const legacy = read('app/account.tsx');
const operator = read('src/components/operator.tsx');
assert.match(traveler, /<DrawerRow key={item.label} label={menuTitleCase\(item.label, language\)}/);
assert.match(legacy, /<Text style={styles.rowTitle}>{menuTitleCase\(item.title, language\)}<\/Text>/);
assert.match(operator, /<DrawerRow key={item.label} label={menuTitleCase\(item.label, language\)}/);
assert.match(traveler, /onPress: \(\) => go\('\/inbox'\)/, 'Platform inbox route is unchanged');
assert.match(traveler, /onPress: \(\) => go\('\/operator\/review'\)/, 'Pending Operator review route is unchanged');
const inbox = read('app/operator/inbox.tsx');
assert.match(inbox,/fetchOperatorInbox\(/);
assert.doesNotMatch(inbox, /TextInput|sendMessage\(|sendTravelMessage\(/, 'Official platform messages remain read-only');
const travelChat = read('app/message.tsx');
assert.match(travelChat, /await ride.sendMsgTo\(/, 'Traveler-Operator travel-specific chat still sends messages');
console.log('PASS: navigation-only English Title Case, existing translations preserved, messages and qualification navigation unchanged');
