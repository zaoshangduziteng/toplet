const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');

test('collapsed notch follows the physical macOS display cutout width', () => {
  assert.match(mainSource, /auxiliaryTopLeftArea/);
  assert.match(mainSource, /auxiliaryTopRightArea/);
  assert.match(mainSource, /stripWidth:\s*getCollapsedWidth\(d\)/);
  assert.match(rendererSource, /style\.setProperty\('--notch-w'/);
  assert.match(stylesSource, /\.notch\s*\{[\s\S]*?width:\s*var\(--notch-w,\s*200px\)/);
});

test('desktop blur immediately collapses native bounds after notifying the renderer', () => {
  const blurHandler = mainSource.match(/mainWindow\.on\('blur',[\s\S]*?\n  \}\);/)?.[0] || '';
  assert.match(
    blurHandler,
    /requestRendererCollapse\(\);\s*applyMode\('collapsed'\);/,
  );
});

test('collapse endpoint does not add two idle frames after the CSS motion', () => {
  const collapseBranch = rendererSource.match(
    /const motion = waitForPanelMotion\(\);[\s\S]*?await ipcSetMode\('collapsed'\);/,
  )?.[0] || '';
  assert.doesNotMatch(
    collapseBranch,
    /await motion;\s*await nextAnimationFrame\(\);\s*await nextAnimationFrame\(\);/,
  );
});
