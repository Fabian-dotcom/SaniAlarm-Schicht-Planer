const { execSync } = require('child_process');
const NODE = 'C:\\Users\\fabia\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe';
const ENV = { ...process.env, NODE_PATH: 'C:\\Users\\fabia\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules' };
let bad = 0;
const run = (label, cmd) => {
  console.log(`\n=== ${label} ===`);
  try { console.log(execSync(cmd, { encoding: 'utf8', timeout: 120000, env: ENV }).split('\n').filter(l => /pass|fail|✅|❌|tests/.test(l)).join('\n')); }
  catch (e) { console.log((e.stdout || '').slice(-1500)); bad = 1; }
};
run('solver', `"${NODE}" --test tests/solver.test.js`);
run('blocking', `"${NODE}" --test tests/blocking.test.js`);
run('fairness e2e', `"${NODE}" qa/fairness-test.cjs`);
run('beitritt', `"${NODE}" --test beitritt-website/test/beitritt.test.js`);
run('team shift', `"${NODE}" qa/team2-final.cjs`);
process.exitCode = bad;
