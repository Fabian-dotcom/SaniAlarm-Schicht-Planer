/* Tests für wiederkehrende ("Generell verhindert") Sperrtage im Solver */
const test = require('node:test');
const assert = require('node:assert/strict');
const solver = require('../js/solver.js');

const member = (id, cls) => ({ id, first: 'P' + id, last: '', cls, stufe: parseInt(cls) || 0, available: true, springer: false, ausb: true, team: null });
const members = [member(0, '10-2'), member(1, '10-2'), member(2, '9-1')];

test("wöchentliche Sperre sperrt Person an konfigurierten Wochentagen", () => {
  // Block: Person 0 ist generell verhindert (unbefristet), jeden Montag (dow=1)
  const block = {
    id: 1, type: 'Generell', title: 'Generell verhindert',
    from: '2000-01-01', to: '9999-12-31',
    scope: { kind: 'person', value: [0] },
    weekly: { enabled: true, days: [1] },
  };
  // Nehme einen bekannten Montag: 2026-11-09 ist ein Montag, 2026-11-10 Dienstag
  const monday = new Date(2026, 10, 9);
  const tuesday = new Date(2026, 10, 10);
  assert.equal(monday.getDay(), 1, 'Testdatum muss Montag sein');
  const bmMo = solver.blockedMap(monday, [block], members);
  const bmDi = solver.blockedMap(tuesday, [block], members);
  assert.ok(bmMo.has(0), 'Montag: Person 0 muss gesperrt sein');
  assert.ok(!bmDi.has(0), 'Dienstag: Person 0 darf nicht gesperrt sein');
});

test("wöchentliche Sperre mit mehreren Wochentagen (Mo + Mi)", () => {
  const block = {
    id: 1, type: 'Generell', title: 'Generell verhindert',
    from: '2000-01-01', to: '9999-12-31',
    scope: { kind: 'person', value: [1] },
    weekly: { enabled: true, days: [1, 3] },
  };
  const monday = new Date(2026, 10, 9);
  const wednesday = new Date(2026, 10, 11);
  const friday = new Date(2026, 10, 13);
  assert.ok(solver.blockedMap(monday, [block], members).has(1));
  assert.ok(solver.blockedMap(wednesday, [block], members).has(1));
  assert.ok(!solver.blockedMap(friday, [block], members).has(1), 'Freitag darf frei sein');
});

test("normale (datumsbasierte) Sperrtage funktionieren unverändert weiter", () => {
  const block = { id: 2, type: 'Verhindert', title: 'Arzttermin', from: '2026-11-10', to: '2026-11-11', scope: { kind: 'person', value: [2] } };
  assert.ok(solver.blockedMap(new Date(2026, 10, 10), [block], members).has(2));
  assert.ok(solver.blockedMap(new Date(2026, 10, 11), [block], members).has(2));
  assert.ok(!solver.blockedMap(new Date(2026, 10, 12), [block], members).has(2));
});

test("Sperre ohne weekly-Feld mit sehr weitem Datumsbereich sperrt jeden Tag im Bereich", () => {
  // Regression: alte Blocks ohne weekly verhalten sich weiterhin datumsbasiert
  const block = { id: 3, type: 'Klassenfahrt', title: 'Fahrt', from: '2026-11-09', to: '2026-11-13', scope: { kind: 'person', value: [0] } };
  [9, 10, 11, 12, 13].forEach(d => {
    assert.ok(solver.blockedMap(new Date(2026, 10, d), [block], members).has(0), `Tag ${d} muss gesperrt sein`);
  });
});
