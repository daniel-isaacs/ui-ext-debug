// Validates and publishes a new dev version, then reports whether the CMS install moved to it.
//
//   yarn deploy                       # validate + prepare --bump-dev-version --publish
//   yarn deploy --skip-validate       # when `yarn validate` has just passed
//   yarn deploy --upgrade-only        # only upgrade the install to the version in app.yml
//   yarn deploy --scope <cms-uuid>    # the install to upgrade (default: OCP_SCOPE, or .ocp-scope)
//
// `ocp app prepare --publish` waits until the version is published, as long as it shows its
// progress. An earlier version of this script passed --no-progress, and prepare then returned
// while the version was still BUILT. Publishing seems to move dev installs to the new version
// by itself; an extra `ocp directory upgrade` on top ran the upgrade hooks twice. So this
// script doesn't upgrade, it only checks.
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

/** Tracker IDs of the installs on a version. The CLI shows scope names, not UUIDs, so trackers identify installs. */
function trackersOn(version) {
  const result = spawnSync(`ocp directory list-installs ${APP_ID}@${version}`, {cwd: root, encoding: 'utf8', shell: true});
  return `${result.stdout}`
    .split('\n')
    .map((line) => line.trim().split(/\s{2,}/))
    .filter((cells) => cells.length >= 4 && cells[0] !== 'Tracker')
    .map((cells) => cells[0]);
}

function fail(message) {
  console.error(`\ndeploy: ${message}`);
  process.exit(1);
}

function upgrade(version) {
  if (!scope) fail(`No CMS instance UUID. Pass --scope <uuid>, set OCP_SCOPE, or put it in ${SCOPE_FILE}.`);
  run('ocp', ['directory', 'upgrade', APP_ID, '-v', version, '--scope', scope]);
  console.log(`\ndeploy: upgraded the install on ${scope} to ${version}.`);
}

if (args.includes('--upgrade-only')) {
  upgrade(appVersion());
  process.exit(0);
}

if (!args.includes('--skip-validate')) run('yarn', ['validate']);

const before = appVersion();
const installsBefore = trackersOn(before);
run('ocp', ['app', 'prepare', '--bump-dev-version', '--publish']);
const version = appVersion();
if (version === before) fail(`app.yml is still at ${before}; the version was not bumped.`);

const installsAfter = trackersOn(version);
const moved = installsBefore.filter((tracker) => installsAfter.includes(tracker));
const stayed = installsBefore.filter((tracker) => !installsAfter.includes(tracker));
console.log(`\ndeploy: ${APP_ID}@${version} is published.`);
if (moved.length > 0) console.log(`deploy: moved to ${version} by itself: ${moved.join(', ')}`);
if (stayed.length > 0) {
  console.log(`deploy: still on ${before}: ${stayed.join(', ')}. To move it: yarn deploy --upgrade-only`);
}
if (installsBefore.length === 0) console.log(`deploy: no installs were on ${before}.`);
if (scope) console.log(`Logs: ocp app logs --appId ${APP_ID} --scope ${scope} --tail`);
