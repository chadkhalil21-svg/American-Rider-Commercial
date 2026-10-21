'use strict';
// Execute the actual transpiled Expo Router root against a module-load throw.
// This must fail safely even before the first app screen can render.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const bootstrap = fs.readFileSync('app/_layout.tsx', 'utf8');
const appRoot = fs.readFileSync('src/boot/FullRoot.tsx', 'utf8');
const compiled = ts.transpileModule(bootstrap, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.React,
    esModuleInterop: true,
  },
}).outputText;

const React = {
  Component: class {},
  useState: () => [0, () => {}],
  createElement: (type, props, ...children) => ({
    type, props: { ...(props || {}), children },
  }),
};
function loadRuntime(appModule) {
  const module = { exports: {} };
  let loaded = 0;
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === 'react') return { __esModule: true, default: React };
      if (id === 'react-native') return {
        View: 'View', Text: 'Text', Pressable: 'Pressable',
        StyleSheet: { create: (x) => x },
      };
      if (id === '../src/i18n/startup') return {
        getStartupCopy: () => ({
          title: 'Unable to open American Rider',
          body: 'The application could not initialize.',
          tryAgain: 'Try Again',
          note: 'Please share a screenshot.',
          generic: 'Unable to finish application initialization',
        }),
      };
      if (id === '../src/boot/FullRoot') {
        loaded++;
        return appModule();
      }
      throw Error('unexpected import ' + id);
    },
  }, { filename: 'app/_layout.tsx' });
  return { root: module.exports.default, imports: () => loaded };
}

assert.ok(!bootstrap.includes("from '../src/firebase'"));
assert.ok(!bootstrap.includes("from '../src/state/"));
assert.ok(!bootstrap.includes("from '../src/backend/"));
assert.ok(bootstrap.includes("require('../src/boot/FullRoot')"));
assert.ok(appRoot.includes('AuthProvider'));
assert.ok(appRoot.includes('OperatorProvider'));
assert.ok(appRoot.includes('RideProvider'));
assert.ok(appRoot.includes('PaymentConfigProvider'));
assert.ok(appRoot.includes('registerForPush'));
assert.ok(appRoot.includes('pingSweep'));

const invalid = loadRuntime(() => {
  throw Object.assign(new Error('firebase/native-persistence-unavailable'), {
    code: 'firebase/native-persistence-unavailable',
  });
});
assert.equal(invalid.imports(), 0, 'App modules must not evaluate during bootstrap import');
const recovered = invalid.root();
assert.equal(invalid.imports(), 1);
assert.equal(recovered.type.name, 'BootFailure', 'module evaluation throw must render recovery');
const screen = recovered.type(recovered.props);
const printed = JSON.stringify(screen);
assert.ok(printed.includes('firebase/native-persistence-unavailable'));
assert.ok(printed.includes('Try Again'));

const secrets = loadRuntime(() => {
  throw new Error('Failed for user@example.com https://private.example.com sk_live_secret');
});
const fail = secrets.root();
const rendered = JSON.stringify(fail.type(fail.props));
assert.ok(!rendered.includes('user@example.com'));
assert.ok(!rendered.includes('private.example.com'));
assert.ok(!rendered.includes('sk_live_secret'));
assert.ok(rendered.includes('[REDACTED]'));

const healthy = loadRuntime(() => ({ default: function FullRoot() {} }));
const tree = healthy.root();
assert.equal(tree.type.name, 'StartupBoundary');
assert.equal(healthy.imports(), 1);
assert.equal(tree.props.children[0].type.name, 'FullRoot');

const boundary = new tree.type();
boundary.props = { onRetry: () => {}, children: tree.props.children };
boundary.state = { error: new Error('render-root-failed') };
const fallback = boundary.render();
assert.equal(fallback.type.name, 'BootFailure', 'React subtree throw must be contained');
console.log('Root import, JS boot error and render error containment: PASS');
