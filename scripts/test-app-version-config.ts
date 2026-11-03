/**
 * App version + build force-update rules.
 * Run: npm run test:app-version-config
 */
import {
  compareAppVersions,
  isAppUpdateRequired,
  normalizeAppVersionString,
} from '../src/utils/config/appVersionConfig';

function assert(name: string, ok: boolean, detail: string) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) process.exitCode = 1;
}

console.log('App version / build policy\n');

assert('normalize 10 → 10.0.0', normalizeAppVersionString('10') === '10.0.0', '');
assert('normalize 10.0.0 unchanged', normalizeAppVersionString('10.0.0') === '10.0.0', '');
assert(
  '10.0.0+18 vs min 10.0.0 build 19 → update',
  isAppUpdateRequired({
    installedVersion: '10.0.0',
    installedBuild: 18,
    minimumVersion: '10.0.0',
    minimumBuild: 19,
  }),
  ''
);
assert(
  '9.0.0+1 vs min 9.0.0 build 2 → update',
  isAppUpdateRequired({
    installedVersion: '9.0.0',
    installedBuild: 1,
    minimumVersion: '9.0.0',
    minimumBuild: 2,
  }),
  ''
);
assert(
  '10.0.1+1 vs min 10.0.0 build 99 → allow',
  !isAppUpdateRequired({
    installedVersion: '10.0.1',
    installedBuild: 1,
    minimumVersion: '10.0.0',
    minimumBuild: 99,
  }),
  ''
);
assert('compare 9.0.0 < 10.0.0', compareAppVersions('9.0.0', '10.0.0') < 0, '');

console.log('');
