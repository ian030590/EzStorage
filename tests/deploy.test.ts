import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const project = resolve(import.meta.dirname, '..');

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'ezstorage-deploy-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin');
  mkdirSync(bin);
  copyFileSync(join(project, 'deploy.sh'), join(directory, 'deploy.sh'));
  copyFileSync(join(project, '.env.example'), join(directory, '.env.example'));
  const log = join(directory, 'docker.log');
  writeFileSync(join(bin, 'docker'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DEPLOY_TEST_LOG"
if [[ "$*" == "info" && "$DEPLOY_TEST_FAILURE" == "daemon" ]]; then exit 9; fi
if [[ "$*" == "compose config --quiet" && "$DEPLOY_TEST_FAILURE" == "config" ]]; then exit 11; fi
if [[ "$*" == "compose up --build --detach --wait --wait-timeout 180" && "$DEPLOY_TEST_FAILURE" == "up" ]]; then exit 17; fi
`, { mode: 0o700 });
  return {
    directory,
    envFile: join(directory, '.env'),
    calls: () => readFileSync(log, 'utf8').trim().split('\n'),
    run: (failure = '') => spawnSync('bash', [join(directory, 'deploy.sh')], {
      cwd: tmpdir(), encoding: 'utf8',
      env: { ...process.env, PATH: bin + ':' + process.env.PATH, DEPLOY_TEST_LOG: log, DEPLOY_TEST_FAILURE: failure }
    })
  };
}

test('deployment script has valid Bash syntax', () => {
  const result = spawnSync('bash', ['-n', join(project, 'deploy.sh')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('first deployment generates private credentials and repeated deployment preserves them', (t) => {
  const deploy = fixture(t);
  const first = deploy.run();
  assert.equal(first.status, 0, first.stderr);
  const configuration = readFileSync(deploy.envFile, 'utf8');
  assert.match(configuration, /^ADMIN_PASSWORD=[a-f0-9]{48}$/m);
  assert.equal(statSync(deploy.envFile).mode & 0o777, 0o600);
  assert.doesNotMatch(first.stdout, /^ADMIN_PASSWORD=/m);
  assert.match(first.stdout, /http:\/\/localhost:3000/);
  assert.equal(deploy.run().status, 0);
  assert.equal(readFileSync(deploy.envFile, 'utf8'), configuration);
  assert.deepEqual(deploy.calls(), [...Array(2)].flatMap(() => [
    'compose version', 'info', 'compose config --quiet', 'compose up --build --detach --wait --wait-timeout 180'
  ]));
});

test('unavailable Docker daemon fails before creating credentials', (t) => {
  const deploy = fixture(t);
  const result = deploy.run('daemon');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Docker daemon/);
  assert.equal(existsSync(deploy.envFile), false);
  assert.deepEqual(deploy.calls(), ['compose version', 'info']);
});

test('invalid Compose configuration propagates failure and does not start containers', (t) => {
  const deploy = fixture(t);
  const result = deploy.run('config');
  assert.equal(result.status, 11);
  assert.equal(deploy.calls().some((call) => call.startsWith('compose up')), false);
  assert.doesNotMatch(result.stdout, /已啟動/);
});

test('container startup failure propagates without claiming successful deployment', (t) => {
  const deploy = fixture(t);
  const result = deploy.run('up');
  assert.equal(result.status, 17);
  assert.doesNotMatch(result.stdout, /已啟動/);
  assert.equal(existsSync(deploy.envFile), true);
});
