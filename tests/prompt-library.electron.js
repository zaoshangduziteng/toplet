const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
    const pagePath = path.join(__dirname, '..', 'renderer', 'index.html');
    await window.loadFile(pagePath);
    await window.webContents.executeJavaScript(`
      localStorage.removeItem('toplet-prompts-v1');
      localStorage.removeItem('toplet-prompt-ai-consent-v1');
    `);
    await window.webContents.reload();
    window.show();
    window.focus();
    window.webContents.focus();

    await window.webContents.executeJavaScript(`
      window.notchAPI = {
        setTab: async () => ({ ok: true }),
        writeClipboard: async () => true,
        organizePrompt: async () => ({
          ok: true,
          title: '用户反馈需求分析',
          tags: ['产品', '用户研究'],
        }),
      };
      const surface = document.getElementById('app');
      surface.classList.remove('collapsed');
      surface.classList.add('expanded');
      document.getElementById('panel').removeAttribute('inert');
      applyFeatureSettings({ features: { prompts: true } });
      document.getElementById('tab-button-prompts').click();
    `);
    await wait(120);

    const initialLayout = await window.webContents.executeJavaScript(`
      (() => {
        const page = document.querySelector('.prompts-page');
        const library = document.querySelector('.prompt-library');
        const detail = document.querySelector('.prompt-detail');
        return {
          active: document.getElementById('tab-prompts').classList.contains('active'),
          columns: getComputedStyle(page).gridTemplateColumns.split(' ').filter(Boolean).length,
          pageHeight: Math.round(page.getBoundingClientRect().height),
          libraryWidth: Math.round(library.getBoundingClientRect().width),
          detailWidth: Math.round(detail.getBoundingClientRect().width),
        };
      })()
    `);
    assert.equal(initialLayout.active, true);
    assert.equal(initialLayout.columns, 2);
    assert.ok(initialLayout.pageHeight >= 500, `提示词页面高度不足：${initialLayout.pageHeight}`);
    assert.ok(initialLayout.libraryWidth >= 340, `提示词列表过窄：${initialLayout.libraryWidth}`);
    assert.ok(initialLayout.detailWidth >= 780, `提示词编辑器过窄：${initialLayout.detailWidth}`);

    await window.webContents.executeJavaScript(`
      document.getElementById('prompt-new').click();
      const content = document.getElementById('prompt-content');
      content.value = '你是一名资深产品经理，请根据用户反馈提炼问题、机会点和下一步行动。';
      document.getElementById('prompt-editor').requestSubmit();
    `);
    await wait(80);
    assert.equal(
      await window.webContents.executeJavaScript(`!document.getElementById('prompt-consent-backdrop').hidden`),
      true,
      '首次 AI 整理前应显示隐私授权',
    );

    await window.webContents.executeJavaScript(`document.getElementById('prompt-consent-accept').click()`);
    await wait(180);
    const organized = await window.webContents.executeJavaScript(`
      (() => {
        const rows = JSON.parse(localStorage.getItem('toplet-prompts-v1') || '[]');
        return {
          title: document.getElementById('prompt-title').value,
          tags: document.getElementById('prompt-tags').value,
          status: document.getElementById('prompt-status-label').textContent,
          listRows: document.querySelectorAll('.prompt-list-item').length,
          homeRows: document.querySelectorAll('.home-prompt-item').length,
          stored: rows.length,
        };
      })()
    `);
    assert.deepEqual(organized, {
      title: '用户反馈需求分析',
      tags: '产品，用户研究',
      status: '已整理',
      listRows: 1,
      homeRows: 1,
      stored: 1,
    });

    await window.webContents.executeJavaScript(`
      (() => {
        const content = document.getElementById('prompt-content');
        content.value = '【任务】用附件真实照片生成1:1方形3D纺织艺术玩偶雕像，严格遵循主体、构图、风格、色彩、材质光影与限制条件，并保留所有必要细节。';
        content.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await wait(500);
    const longExcerptLayout = await window.webContents.executeJavaScript(`
      (() => {
        const item = document.querySelector('.prompt-list-item');
        const excerpt = item.querySelector('.prompt-list-excerpt');
        const itemRect = item.getBoundingClientRect();
        const excerptRect = excerpt.getBoundingClientRect();
        return {
          itemRight: Math.round(itemRect.right),
          excerptRight: Math.round(excerptRect.right),
        };
      })()
    `);
    assert.ok(
      longExcerptLayout.excerptRight <= longExcerptLayout.itemRight,
      `长提示词摘要超出卡片：摘要右边界 ${longExcerptLayout.excerptRight}，卡片右边界 ${longExcerptLayout.itemRight}`,
    );

    await window.webContents.executeJavaScript(`
      const search = document.getElementById('prompt-search');
      search.value = '用户研究';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('prompt-primary-action').click();
    `);
    await wait(100);
    const afterUse = await window.webContents.executeJavaScript(`
      (() => {
        const row = JSON.parse(localStorage.getItem('toplet-prompts-v1'))[0];
        return {
          visibleRows: document.querySelectorAll('.prompt-list-item').length,
          useCount: row.useCount,
          lastUsed: row.lastUsedAt > 0,
        };
      })()
    `);
    assert.deepEqual(afterUse, { visibleRows: 1, useCount: 1, lastUsed: true });

    const screenshot = await window.webContents.capturePage();
    fs.writeFileSync('/private/tmp/toplet-prompt-library.png', screenshot.toPNG());

    window.setSize(860, 616);
    await wait(120);
    const narrowLayout = await window.webContents.executeJavaScript(`
      (() => {
        const page = document.querySelector('.prompts-page');
        const detail = document.querySelector('.prompt-detail');
        const primary = document.getElementById('prompt-primary-action');
        const activeTab = document.querySelector('.tab.active');
        const indicator = document.getElementById('tab-indicator');
        const activeRect = activeTab.getBoundingClientRect();
        const indicatorRect = indicator.getBoundingClientRect();
        return {
          pageFits: page.scrollWidth <= page.clientWidth,
          documentFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          detailWidth: Math.round(detail.getBoundingClientRect().width),
          primaryWidth: Math.round(primary.getBoundingClientRect().width),
          labelsHidden: getComputedStyle(document.querySelector('.tab-label')).display === 'none',
          indicatorOffset: Math.round(indicatorRect.left - activeRect.left),
          indicatorWidthDelta: Math.round(indicatorRect.width - activeRect.width),
        };
      })()
    `);
    assert.equal(narrowLayout.pageFits, true, '窄屏提示词双栏不应横向溢出');
    assert.equal(narrowLayout.documentFits, true, '窄屏页面不应横向溢出');
    assert.ok(narrowLayout.detailWidth >= 470, `窄屏编辑区过窄：${narrowLayout.detailWidth}`);
    assert.ok(narrowLayout.primaryWidth >= 72, `窄屏复制按钮不可用：${narrowLayout.primaryWidth}`);
    assert.equal(narrowLayout.labelsHidden, true, '窄屏顶部标签应只保留图标');
    assert.ok(Math.abs(narrowLayout.indicatorOffset) <= 3, `窄屏激活胶囊横向错位：${narrowLayout.indicatorOffset}`);
    assert.ok(Math.abs(narrowLayout.indicatorWidthDelta) <= 2, `窄屏激活胶囊宽度错误：${narrowLayout.indicatorWidthDelta}`);
    const narrowScreenshot = await window.webContents.capturePage();
    fs.writeFileSync('/private/tmp/toplet-prompt-library-narrow.png', narrowScreenshot.toPNG());
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
