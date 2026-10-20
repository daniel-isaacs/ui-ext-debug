// Validates, publishes a new dev version and upgrades the CMS install to it.
//
//   yarn deploy                       # scope from OCP_SCOPE, or the gitignored .ocp-scope file
//   yarn deploy --scope <cms-uuid>    # another CMS instance
//   yarn deploy --skip-validate       # when `yarn validate` has just passed
//   yarn deploy --upgrade-only        # resume: upgrade to the version already in app.yml
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const APP_ID = 'steve_ui_ext_debug';
// Your CMS instance UUID lives outside git: in OCP_SCOPE, or on one line in .ocp-scope.
const SCOPE_FILE = '.ocp-scope';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const scopeIndex = args.indexOf('--scope');
const scope = scopeIndex >= 0 ? args[scopeIndex + 1] : defaultScope();
if (!scope) {
  fail(`No CMS instance UUID. Pass --scope <uuid>, set OCP_SCOPE, or put it in ${SCOPE_FILE}.`);
}

function defaultScope() {
  if (process.env.OCP_SCOPE) return process.env.OCP_SCOPE.trim();
  const file = path.join(root, SCOPE_FILE);
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
}

function run(command, commandArgs) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  // shell: true so `ocp` and `yarn` resolve to their .cmd shims on Windows.
  const result = spawnSync([command, ...commandArgs].join(' '), {cwd: root, stdio: 'inherit', shell: true});
  if (result.status !== 0) fail(`${command} exited with ${result.status ?? result.signal}.`);
}

function appVersion() {
  const match = readFileSync(path.join(root, 'app.yml'), 'utf8').match(/^\s+version:\s*['"]?([^\s'"]+)/m);
  if (!match) fail('Could not read meta.version from app.yml.');
  return match[1];
}

function fail(message) {
  console.error(`\ndeploy: ${message}`);
  process.exit(1);
}

// `prepare --publish` returns while the version is still PUBLISHING, and upgrading then fails
// with "is not running". Poll `ocp directory status` until it says PUBLISHED.
function waitUntilPublished(version) {
  const deadline = Date.now() + 15 * 60_000;
  let last = '';
  while (Date.now() < deadline) {
    const result = spawnSync(`ocp directory status ${APP_ID}@${version}`, {cwd: root, encoding: 'utf8', shell: true});
    const state = `${result.stdout}`.match(/Version state:\s*(\S+)/)?.[1] ?? 'unknown';
    if (state !== last) console.log(`deploy: ${APP_ID}@${version} is ${state}`);
    last = state;
    if (state === 'PUBLISHED') return;
    if (/FAIL|ERROR|REJECT/i.test(state)) fail(`publishing ended in state ${state}.`);
    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 10000)']);
  }
  fail(`${APP_ID}@${version} was not PUBLISHED after 15 minutes. Resume with: yarn deploy --upgrade-only`);
}

let version = appVersion();
if (!args.includes('--upgrade-only')) {
  if (!args.includes('--skip-validate')) run('yarn', ['validate']);
  const before = version;
  run('ocp', ['app', 'prepare', '--bump-dev-version', '--publish', '--no-progress']);
  version = appVersion();
  if (version === before) fail(`app.yml is still at ${before}; the version was not bumped.`);
}

waitUntilPublished(version);
run('ocp', ['directory', 'upgrade', APP_ID, '-v', version, '--scope', scope]);

console.log(`\ndeploy: ${APP_ID}@${version} is published and installed on ${scope}.`);
console.log(`Logs: ocp app logs --appId ${APP_ID} --scope ${scope} --tail`);
