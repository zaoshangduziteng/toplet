const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function clickAt(window, x, y) {
  window.webContents.sendInputEvent({
    type: 'mouseDown',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  window.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left' });
  await wait(450);
}

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 1240,
    height: 616,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
  });

  try {
    await window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    window.show();
    window.focus();
    window.webContents.focus();
    await window.webContents.executeJavaScript('applyFeatureSettings({ features: {} })');

    const centerX = Math.round(window.getContentBounds().width / 2);
    const notchY = 18;
    await clickAt(window, centerX, notchY);
    assert.equal(
      await window.webContents.executeJavaScript(
        "document.getElementById('app').classList.contains('expanded')",
      ),
      true,
      '第一次点击刘海中心应展开面板',
    );

    await window.webContents.executeJavaScript(
      "document.getElementById('tab-button-todo').click()",
    );
    assert.equal(
      await window.webContents.executeJavaScript(
        "document.getElementById('app').classList.contains('expanded')",
      ),
      true,
      '点击真实功能标签不应收起面板',
    );

    await clickAt(window, centerX, notchY);
    assert.equal(
      await window.webContents.executeJavaScript(
        "document.getElementById('app').classList.contains('collapsed')",
      ),
      true,
      '展开后再点击同一个刘海位置应收起面板',
    );
  } finally {
    window.destroy();
  }
}

main().then(
  () => app.quit(),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);
