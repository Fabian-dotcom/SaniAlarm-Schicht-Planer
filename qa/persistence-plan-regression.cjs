const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const solver = require('../js/solver.js');

const source = fs.readFileSync('js/core.js', 'utf8') + `
globalThis.inspect = {
  snapshot, restore, upsertMember,
  generate: window.SaniPlanerData.generate,
  get members() { return members; }
};`;
const saved = new Map();
const context = {
  console,
  localStorage: {
    setItem: (key, value) => saved.set(key, value),
    getItem: key => saved.get(key) || null,
    removeItem: key => saved.delete(key),
  },
  window: {},
  document: { querySelector: () => null, querySelectorAll: () => [] },
  location: { search: '' }, URLSearchParams, Date, Map, Set, Math, JSON, Array, Object,
  Number, String, parseInt, Promise, Error, URL, Blob: function Blob() { }, SaniSolver: solver,
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);
const app = context.inspect;
const file = JSON.parse(fs.readFileSync('SaniAlarm-Komplett-2026-11-12.saniteam', 'utf8'));
app.restore(file);
for (const key of ['2026-11-02', '2026-11-11', '2026-11-12', '2026-11-13']) {
  assert.deepEqual(app.snapshot().plan[key], file.plan[key], `Import soll ${key} unverändert übernehmen`);
}
assert.equal(app.members.length, file.members.length);

const member = app.members.find(person => person.id === 19);
app.upsertMember({ ...member, quali: 'ausbildung', ausbildungsStatus: 'ausbildung', ausb: false }, member.id);
const afterEdit = app.snapshot();
assert.equal(afterEdit.members.find(person => person.id === 19).quali, 'ausbildung');
app.restore(JSON.parse(JSON.stringify(afterEdit)));
assert.equal(app.members.find(person => person.id === 19).quali, 'ausbildung');
assert.equal(app.members.find(person => person.id === 19).ausb, false);
assert.equal(afterEdit.members.find(person => person.id === 19).ausbildungsStatus, 'ausbildung');

const locked = JSON.stringify(file.plan['2026-11-12']);
const result = app.generate('2026-11-12', '2026-11-20');
assert.equal(JSON.stringify(result.plan['2026-11-12']), locked);
assert(result.stats.days > 0);
assert(Object.keys(result.plan).some(key => key >= '2026-11-12' && key <= '2026-11-20'));
console.log('Saniteam-Import, Azubi-Speicherung/Reload und unveränderte Vorbelegungen: OK');
