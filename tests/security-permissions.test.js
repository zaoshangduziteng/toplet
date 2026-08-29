const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { screenRecordingAccessDecision } = require('../main-services');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'renderer', 'workspace.js'), 'utf8');
const signingSource = fs.readFileSync(path.join(root, 'build', 'afterPack.js'), 'utf8');

test('screen recording permission trusts the native macOS status before probing sources', () => {
  assert.equal(typeof screenRecordingAccessDecision, 'function');
  assert.equal(screenRecordingAccessDecision('granted'), true);
  assert.equal(screenRecordingAccessDecision('denied'), false);
  assert.equal(screenRecordingAccessDecision('restricted'), false);
  assert.equal(screenRecordingAccessDecision('not-determined'), null);
  assert.equal(screenRecordingAccessDecision('unknown'), null);
});

test('ad-hoc builds use a stable designated requirement instead of a changing cdhash', () => {
  assert.match(signingSource, /STABLE_DESIGNATED_REQUIREMENT/);
  assert.match(signingSource, /--requirements/);
  assert.match(signingSource, /identifier \\"com\.toplet\.app\\"/);
});

test('startup status rendering does not decrypt secrets or eagerly open the credential vault', () => {
  const publicConfig = mainSource.match(
    /function publicTranscriptionConfig\(\) \{[\s\S]*?\n\}/,
  )?.[0] || '';
  assert.doesNotMatch(publicConfig, /resolveTranscriptionConfig|resolveLlmConfig|decryptStoredSecret/);

  const startup = rendererSource.match(
    /renderCommands\(\);[\s\S]*?window\.NotchWorkspace =/,
  )?.[0] || '';
  assert.doesNotMatch(startup, /\n  loadCredentials\(\);/);
  assert.doesNotMatch(startup, /\n  loadTranscriptionConfig\(\);/);
});

test('decrypted keychain values are cached for the life of the main process', () => {
  assert.match(mainSource, /let credentialsVaultCache = null/);
  assert.match(mainSource, /const decryptedSecretCache = new Map\(\)/);
});
