const assert = require('node:assert/strict');
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
    await window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    await window.webContents.executeJavaScript(`
      localStorage.removeItem('toplet-prompts-v1');
      localStorage.removeItem('toplet-prompt-draft-v1');
      localStorage.removeItem('toplet-prompt-ai-consent-v1');
    `);
    await window.webContents.reload();
    const setup = await window.webContents.executeJavaScript(`
      (() => {
        try {
          window.__copiedTexts = [];
          window.__organizeCalls = [];
          window.notchAPI = {
            setTab: async () => ({ ok: true }),
            writeClipboard: async (payload) => {
              window.__copiedTexts.push(payload.text);
              return true;
            },
            organizePrompt: async (payload) => {
              window.__organizeCalls.push(payload);
              return { ok: true, title: '自动生成标题', tags: ['产品'] };
            },
          };
          document.getElementById('app').classList.replace('collapsed', 'expanded');
          document.getElementById('panel').removeAttribute('inert');
          applyFeatureSettings({ features: { prompts: true } });
          document.getElementById('tab-button-prompts').click();
          document.getElementById('prompt-new').click();
          const content = document.getElementById('prompt-content');
          content.value = '原始正文';
          content.dispatchEvent(new Event('input', { bubbles: true }));
          document.getElementById('prompt-editor').requestSubmit();
          document.getElementById('prompt-consent-decline').click();
          return { ok: true };
        } catch (error) {
          return { ok: false, message: error.message, stack: error.stack };
        }
      })()
    `);
    assert.equal(setup.ok, true, setup.stack || setup.message);
    await wait(80);

    await window.webContents.executeJavaScript(`(() => {
      const content = document.getElementById('prompt-content');
      content.value = '';
      content.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('prompt-editor').requestSubmit();
    })()`);
    await wait(80);
    assert.deepEqual(
      await window.webContents.executeJavaScript(`({
        copied: window.__copiedTexts,
        useCount: JSON.parse(localStorage.getItem('toplet-prompts-v1'))[0].useCount,
        status: document.getElementById('prompt-saved-state').textContent,
      })`),
      { copied: [], useCount: 0, status: '正文不能为空' },
      '无效的空正文不能回退复制旧内容',
    );

    await window.webContents.executeJavaScript(`(() => {
      const content = document.getElementById('prompt-content');
      content.value = '原始正文';
      content.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await wait(500);
    await window.webContents.executeJavaScript(`(() => {
      document.getElementById('prompt-new').click();
      const content = document.getElementById('prompt-content');
      content.value = '尚未保存但不能丢失的草稿';
      content.dispatchEvent(new Event('input', { bubbles: true }));
      const row = document.querySelector('.prompt-list-item');
      row.focus();
      row.click();
      const newButton = document.getElementById('prompt-new');
      newButton.focus();
      newButton.click();
    })()`);
    assert.equal(
      await window.webContents.executeJavaScript(`document.getElementById('prompt-content').value`),
      '尚未保存但不能丢失的草稿',
      '切换列表后重新新建应恢复草稿',
    );

    await window.webContents.executeJavaScript(`(() => {
      document.querySelector('.prompt-list-item').click();
      const search = document.getElementById('prompt-search');
      search.value = '完全不存在的关键词';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    assert.deepEqual(
      await window.webContents.executeJavaScript(`({
        editorHidden: document.getElementById('prompt-editor').hidden,
        emptyHidden: document.getElementById('prompt-detail-empty').hidden,
      })`),
      { editorHidden: true, emptyHidden: false },
      '搜索无结果时右侧不能保留无关提示词',
    );

    await window.webContents.executeJavaScript(`applyFeatureSettings({ features: { prompts: false } })`);
    assert.equal(
      await window.webContents.executeJavaScript(`document.querySelector('[data-home-module="commands"]').hidden`),
      true,
      '隐藏提示词功能时首页快捷模块也应隐藏',
    );

    await window.webContents.executeJavaScript(`(() => {
      applyFeatureSettings({ features: { prompts: true } });
      document.getElementById('tab-button-prompts').click();
      const search = document.getElementById('prompt-search');
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.prompt-list-item').click();
      localStorage.setItem('toplet-prompt-ai-consent-v1', 'accepted');
      window.notchAPI.organizePrompt = (payload) => {
        window.__organizeCalls.push(payload);
        return new Promise((resolve) => { window.__resolveOrganization = resolve; });
      };
      document.getElementById('prompt-organize').click();
    })()`);
    await wait(40);
    await window.webContents.executeJavaScript(`(() => {
      const content = document.getElementById('prompt-content');
      content.value = 'AI 请求期间修改后的新正文';
      content.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await wait(500);
    await window.webContents.executeJavaScript(`(() => {
      window.__resolveOrganization({ ok: true, title: '旧正文生成的标题', tags: ['旧标签'] });
    })()`);
    await wait(80);
    assert.deepEqual(
      await window.webContents.executeJavaScript(`(() => {
        const row = JSON.parse(localStorage.getItem('toplet-prompts-v1'))[0];
        return { content: row.content, title: row.title, tags: row.tags, status: row.organizationStatus };
      })()`),
      { content: 'AI 请求期间修改后的新正文', title: 'AI 请求期间修改后的新正文', tags: [], status: 'unclassified' },
      'AI 旧请求的结果不能应用到已经修改的正文',
    );

    await window.webContents.executeJavaScript(`(() => {
      localStorage.removeItem('toplet-prompt-ai-consent-v1');
      document.getElementById('prompt-organize').click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()`);
    assert.equal(
      await window.webContents.executeJavaScript(`localStorage.getItem('toplet-prompt-ai-consent-v1')`),
      null,
      '关闭授权弹窗不应被持久化为拒绝授权',
    );

    const callsBeforeManualMetadata = await window.webContents.executeJavaScript(`window.__organizeCalls.length`);
    await window.webContents.executeJavaScript(`(() => {
      localStorage.setItem('toplet-prompt-ai-consent-v1', 'accepted');
      window.notchAPI.organizePrompt = async (payload) => {
        window.__organizeCalls.push(payload);
        return { ok: true, title: '不应调用', tags: ['不应调用'] };
      };
      document.getElementById('prompt-new').click();
      const title = document.getElementById('prompt-title');
      const tags = document.getElementById('prompt-tags');
      const content = document.getElementById('prompt-content');
      title.value = '手动填写标题';
      tags.value = '手动标签';
      content.value = '手动填写完整元数据的正文';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      tags.dispatchEvent(new Event('input', { bubbles: true }));
      content.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('prompt-editor').requestSubmit();
    })()`);
    await wait(80);
    assert.equal(
      await window.webContents.executeJavaScript(`window.__organizeCalls.length`),
      callsBeforeManualMetadata,
      '用户已经填写标题和标签时不应再调用 AI',
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
