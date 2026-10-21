// SDK 57 widget functions are serialized in isolation: no module-scope closures.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync('src/widgets/TravelActivity.tsx', 'utf8');
const tree = ts.createSourceFile('TravelActivity.tsx',source,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);
const layout=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='TravelActivityLayout');
assert.ok(layout?.body,'Live Activity layout must be a declared function');
assert.equal(layout.body.statements[0].expression?.text,'widget','widget directive must be first statement');
const outer=tree.statements.filter(n=>n!==layout).map(n=>n.getText(tree)).join('\n');
for(const symbol of ['MUTED','INK','mins','headline','detail']){
  assert.ok(layout.body.getText(tree).includes(symbol),'layout missing local '+symbol);
  assert.ok(!new RegExp('(?:const|function)\\s+'+symbol+'\\b').test(outer),
    'isolated widget must not depend on top-level '+symbol);
}
const local=layout.body.getText(tree);
for(const name of ['MUTED','INK','mins','headline','detail']){
  assert.match(local,new RegExp('const\\s+'+name+'\\b'),
    name+' must be declared inside widget directive');
}
console.log('Expo Live Activity isolated widget serialization invariants: PASS');
