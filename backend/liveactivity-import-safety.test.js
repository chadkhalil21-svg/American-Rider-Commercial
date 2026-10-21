// Exercises the OPTIONAL widget boundary instead of merely looking for a try/catch.
// Compile actual TS, then evaluate it with an iOS widget module that throws on import.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const src = fs.readFileSync('src/backend/liveActivity.ts', 'utf8');
const compiled = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const sample = { stage: 'assigned', operator: 'Test', destination: 'Zoo Miami', tripNo: 'A1' };

function instantiate(platform, widgetFactory) {
  let imports = 0;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (id) => {
      if (id === 'react-native') return { Platform: { OS: platform } };
      if (id === '../widgets/TravelActivity') {
        imports++;
        return widgetFactory();
      }
      throw new Error('Unexpected runtime import: ' + id);
    },
  }, { filename: 'src/backend/liveActivity.ts' });
  return { api: module.exports, imports: () => imports };
}

const brokenWidget = () => { throw new Error('ArgumentCastException: widget cannot initialize'); };
const ios = instantiate('ios', brokenWidget);
assert.equal(ios.imports(), 0, 'widget initialization must not run during app import');
assert.doesNotThrow(() => ios.api.startTravelActivity(sample));
assert.equal(ios.imports(), 1, 'failure must be caught inside startTravelActivity');
assert.doesNotThrow(() => ios.api.endTravelActivity(true));
assert.doesNotThrow(() => ios.api.updateTravelActivity(sample));

const web = instantiate('web', brokenWidget);
assert.equal(web.imports(), 0);
web.api.startTravelActivity(sample);
web.api.endTravelActivity();
assert.equal(web.imports(), 0, 'non-iOS platforms must never load the widget');

let starts = 0, updates = 0, ends = 0;
const active = {
  update: async () => { updates++; },
  end: async () => { ends++; },
};
const healthy = instantiate('ios', () => ({ TravelActivity: {
  start: () => { starts++; return active; },
  getInstances: () => [],
} }));
assert.equal(healthy.imports(), 0);
healthy.api.startTravelActivity(sample);
assert.equal(starts, 1, 'healthy iOS Live Activity must still start');
healthy.api.updateTravelActivity(sample);
healthy.api.endTravelActivity(true);
assert.equal(updates, 1, 'healthy iOS Live Activity must still update');
assert.equal(ends, 1, 'healthy iOS Live Activity must still end');
console.log('optional native live activity import/execution safety: PASS');
