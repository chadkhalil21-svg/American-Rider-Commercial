'use strict';
// Audit every source-defined interactive tap surface in the shipped native app.
// This catches silent/empty handlers regardless of screen or callback spelling;
// it does NOT certify remote services or actual signed-device behavior.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const directories = ['app', 'src/components', 'src/screens'];
const presses = new Set(['Pressable', 'PrimaryButton', 'OutlineButton', 'Button',
  'TouchableOpacity', 'TouchableHighlight', 'Chip']);
const changes = new Set(['Switch', 'Checkbox', 'CheckBox']);
const issues = [];
let checked = 0, files = 0, modalGuards = 0;
function visitFiles(dir, found = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) visitFiles(relative, found);
    else if (/\\.tsx$/.test(entry.name)) found.push(relative);
  }
  return found;
}
function tagName(tag) {return tag.tagName?.getText?.() || '';}
function getProp(tag, key) {
  return tag.attributes?.properties?.find(p =>
    ts.isJsxAttribute(p) && p.name.getText() === key);
}
function sourcePosition(source, node) {
  const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
  return (pos.line+1);
}
function expressionOf(attr) {
  if (!attr?.initializer || !ts.isJsxExpression(attr.initializer)) return null;
  let exp = attr.initializer.expression;
  while (exp && ts.isParenthesizedExpression(exp)) exp = exp.expression;
  return exp;
}
function emptyPress(exp) {
  if (!exp) return true;
  if (exp.kind === ts.SyntaxKind.NullKeyword ||
      ts.isIdentifier(exp) && exp.text === 'undefined') return true;
  if (ts.isArrowFunction(exp) || ts.isFunctionExpression(exp)) {
    if (ts.isBlock(exp.body)) return exp.body.statements.length === 0;
    const body=exp.body;
    return body.kind === ts.SyntaxKind.NullKeyword ||
      ts.isIdentifier(body) && body.text === 'undefined' ||
      ts.isVoidExpression(body) && ts.isNumericLiteral(body.expression) && body.expression.text === '0';
  }
  return false;
}
const all = directories.flatMap(d => visitFiles(d));
for (const rel of all) {
  const content = fs.readFileSync(path.join(root, rel),'utf8');
  const source = ts.createSourceFile(rel,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  if (source.parseDiagnostics.length) {
    for (const diagnostic of source.parseDiagnostics) issues.push(rel+':'+
      (source.getLineAndCharacterOfPosition(diagnostic.start||0).line+1)+' cannot parse native screen');
    continue;
  }
  files++;
  function walk(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node);
      const key = presses.has(tag) ? 'onPress' : changes.has(tag) ? 'onValueChange' : null;
      if (key) {
        checked++;
        const line = sourcePosition(source,node), attr = getProp(node,key);
        const spread = node.attributes.properties.some(p=>ts.isJsxSpreadAttribute(p));
        if (!attr && !spread)
          issues.push(rel+':'+line+' <'+tag+'> has no '+key);
        else if (attr && emptyPress(expressionOf(attr)))
          issues.push(rel+':'+line+' <'+tag+'> has no-op '+key);
        const disabled = getProp(node,'disabled');
        if (disabled && ts.isJsxExpression(disabled.initializer) &&
            disabled.initializer.expression?.kind === ts.SyntaxKind.TrueKeyword)
          issues.push(rel+':'+line+' <'+tag+'> is permanently disabled without an alternate action');
        if (attr?.initializer?.getText()?.includes('stopPropagation')) modalGuards++;
      }
    }
    ts.forEachChild(node,walk);
  }
  walk(source);
}
assert(checked>=300,'Visible action inventory unexpectedly contracted: '+checked);
assert.equal(issues.length,0,'Visible controls need real handlers:\\n'+issues.join('\\n'));
console.log('PASS: '+checked+' interactive native controls across '+files+
  ' TSX screens/components have nonempty actions; '+modalGuards+
  ' intentional, explicit modal tap guards. Remote actions still require device/provider tests.');
