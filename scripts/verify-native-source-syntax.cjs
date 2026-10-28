'use strict';
// Zero-native-build parse gate: guard every app/source TS/TSX component against
// malformed JSX before Gradle/Xcode, preventing 14-minute Metro failures.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const entries=[];
function visit(dir){
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,e.name);
    if(e.isDirectory())visit(full);
    else if(e.isFile()&&/\.(tsx?|jsx?)$/.test(e.name)&&!e.name.endsWith('.d.ts'))
      entries.push(full);
  }
}
visit(path.join(root,'app'));
visit(path.join(root,'src'));
assert.ok(entries.length>30,'Unusually few app/source files; cannot certify syntax');
let errors=0;
for(const file of entries){
  const source=fs.readFileSync(file,'utf8');
  const kind=file.endsWith('.tsx')?ts.ScriptKind.TSX:
    file.endsWith('.jsx')?ts.ScriptKind.JSX:
    file.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS;
  const syntax=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,kind);
  for(const issue of syntax.parseDiagnostics){
    const location=syntax.getLineAndCharacterOfPosition(issue.start||0);
    console.error(path.relative(root,file)+':'+(location.line+1)+':'+
      (location.character+1)+' TS'+issue.code+' '+
      ts.flattenDiagnosticMessageText(issue.messageText,' '));
    errors++;
  }
}
if(errors){console.error('BLOCK native compilation: '+errors+' JSX/TS syntax faults');process.exitCode=1;}
else console.log('PASS: '+entries.length+' app/source files parsed using TypeScript compiler BEFORE native builds');
