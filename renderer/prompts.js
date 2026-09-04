(function initPromptLibrary() {
  const Domain = window.NotchDomain;
  if (!Domain) return;

  const PROMPTS_KEY = 'toplet-prompts-v1';
  const DRAFT_KEY = 'toplet-prompt-draft-v1';
  const CONSENT_KEY = 'toplet-prompt-ai-consent-v1';
  const SAVE_DELAY_MS = 420;

  const promptCount = document.getElementById('prompt-count');
  const promptSearch = document.getElementById('prompt-search');
  const promptList = document.getElementById('prompt-list');
  const promptNew = document.getElementById('prompt-new');
  const promptEmptyNew = document.getElementById('prompt-empty-new');
  const promptDetailEmpty = document.getElementById('prompt-detail-empty');
  const promptEditor = document.getElementById('prompt-editor');
  const promptTitle = document.getElementById('prompt-title');
  const promptTags = document.getElementById('prompt-tags');
  const promptContent = document.getElementById('prompt-content');
  const promptFavorite = document.getElementById('prompt-favorite');
  const promptDelete = document.getElementById('prompt-delete');
  const promptOrganize = document.getElementById('prompt-organize');
  const promptPrimaryAction = document.getElementById('prompt-primary-action');
  const promptStatusDot = document.getElementById('prompt-status-dot');
  const promptStatusLabel = document.getElementById('prompt-status-label');
  const promptSavedState = document.getElementById('prompt-saved-state');
  const promptUsage = document.getElementById('prompt-usage');
  const homePromptsOpen = document.getElementById('home-prompts-open');
  const homePromptList = document.getElementById('home-prompt-list');
  const homePromptsCount = document.getElementById('home-prompts-count');
  const consentBackdrop = document.getElementById('prompt-consent-backdrop');
  const consentAccept = document.getElementById('prompt-consent-accept');
  const consentDecline = document.getElementById('prompt-consent-decline');

  if (!promptList || !promptEditor || !homePromptList) return;

  function loadPrompts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PROMPTS_KEY) || '[]');
      return (Array.isArray(parsed) ? parsed : []).map((item) => Domain.createPrompt(item)).filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  let prompts = loadPrompts();
  let selectedPromptId = Domain.sortPrompts(prompts)[0]?.id || '';
  let creatingPrompt = false;
  let saveTimer = null;
  let dirtyFields = new Set();
  let consentPromptId = '';
  let consentForce = false;
  let consentPreviousFocus = null;

  function loadDraft() {
    try {
      const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? {
        title: String(value.title || ''),
        tags: String(value.tags || ''),
        content: String(value.content || ''),
      } : { title: '', tags: '', content: '' };
    } catch (error) {
      return { title: '', tags: '', content: '' };
    }
  }

  let promptDraft = loadDraft();

  function persistDraft() {
    promptDraft = {
      title: promptTitle.value,
      tags: promptTags.value,
      content: promptContent.value,
    };
    try {
      if (Object.values(promptDraft).some((value) => value.trim())) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(promptDraft));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (error) {
      // 草稿无法持久化时，当前会话内仍保留输入。
    }
  }

  function clearDraft() {
    promptDraft = { title: '', tags: '', content: '' };
    try { localStorage.removeItem(DRAFT_KEY); } catch (error) { /* ignore */ }
  }

  const statusLabels = {
    unclassified: '未分类',
    organizing: 'AI 整理中',
    organized: '已整理',
    failed: '整理失败',
  };

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `prompt-${window.crypto.randomUUID()}`;
    }
    return `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function persistPrompts() {
    try {
      localStorage.setItem(PROMPTS_KEY, JSON.stringify(prompts));
      return true;
    } catch (error) {
      if (typeof showStatusToast === 'function') showStatusToast('提示词保存失败，本机存储空间可能不足');
      return false;
    }
  }

  function selectedPrompt() {
    return prompts.find((prompt) => prompt.id === selectedPromptId) || null;
  }

  function formatShortDate(timestamp) {
    if (!timestamp) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  }

  function setFieldValue(field, value) {
    if (field && document.activeElement !== field) field.value = value;
  }

  function createTag(text) {
    const tag = document.createElement('span');
    tag.className = 'prompt-tag';
    tag.textContent = text;
    return tag;
  }

  function renderPromptList() {
    const query = promptSearch?.value || '';
    const visible = Domain.filterPrompts(prompts, query);
    if (promptCount) promptCount.textContent = query.trim()
      ? `${visible.length} / ${prompts.length} 条`
      : `${prompts.length} 条`;
    promptList.replaceChildren();

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'prompt-list-empty';
      const strong = document.createElement('strong');
      const copy = document.createElement('span');
      strong.textContent = prompts.length ? '没有匹配结果' : '仓库还是空的';
      copy.textContent = prompts.length ? '换个关键词，正文和标签也能被搜索' : '保存第一条值得重复使用的提示词';
      empty.append(strong, copy);
      promptList.appendChild(empty);
      return;
    }

    visible.forEach((prompt) => {
      const button = document.createElement('button');
      button.className = `prompt-list-item${prompt.id === selectedPromptId && !creatingPrompt ? ' active' : ''}`;
      button.type = 'button';
      button.dataset.promptId = prompt.id;
      button.setAttribute('aria-pressed', String(prompt.id === selectedPromptId && !creatingPrompt));

      const heading = document.createElement('span');
      heading.className = 'prompt-list-title';
      if (prompt.favorite) {
        const favorite = document.createElement('span');
        favorite.className = 'prompt-list-favorite';
        favorite.textContent = '★';
        favorite.setAttribute('aria-label', '已收藏');
        heading.appendChild(favorite);
      }
      const title = document.createElement('strong');
      title.textContent = prompt.title;
      heading.appendChild(title);

      const excerpt = document.createElement('span');
      excerpt.className = 'prompt-list-excerpt';
      excerpt.textContent = prompt.content.replace(/\s+/g, ' ').trim();

      const footer = document.createElement('span');
      footer.className = 'prompt-list-footer';
      const tags = document.createElement('span');
      tags.className = 'prompt-list-tags';
      (prompt.tags.length ? prompt.tags.slice(0, 2) : ['未分类']).forEach((tag) => tags.appendChild(createTag(tag)));
      const usage = document.createElement('time');
      usage.textContent = prompt.useCount ? `使用 ${prompt.useCount} 次` : formatShortDate(prompt.updatedAt);
      footer.append(tags, usage);
      button.append(heading, excerpt, footer);
      promptList.appendChild(button);
    });
  }

  function renderPromptDetail() {
    const prompt = selectedPrompt();
    const query = promptSearch?.value.trim() || '';
    const promptMatchesSearch = !query || Boolean(prompt && Domain.filterPrompts([prompt], query).length);
    const showEditor = creatingPrompt || Boolean(prompt && promptMatchesSearch);
    promptDetailEmpty.hidden = showEditor;
    promptEditor.hidden = !showEditor;
    const emptyHeading = promptDetailEmpty.querySelector('strong');
    const emptyCopy = promptDetailEmpty.querySelector('p');
    const emptyAction = promptDetailEmpty.querySelector('button');
    if (!showEditor && query) {
      if (emptyHeading) emptyHeading.textContent = '没有匹配的提示词';
      if (emptyCopy) emptyCopy.textContent = '换一个关键词，标题、正文和标签都可以搜索。';
      if (emptyAction) emptyAction.hidden = true;
    } else {
      if (emptyHeading) emptyHeading.textContent = '把好用的提示词留在这里';
      if (emptyCopy) emptyCopy.textContent = '只需粘贴正文。Toplet 会先保存，再用 AI 补充标题和标签。';
      if (emptyAction) emptyAction.hidden = false;
    }
    if (!showEditor) return;

    if (creatingPrompt) {
      setFieldValue(promptTitle, promptDraft.title);
      setFieldValue(promptTags, promptDraft.tags);
      setFieldValue(promptContent, promptDraft.content);
      promptEditor.dataset.mode = 'create';
      promptStatusDot.dataset.state = 'unclassified';
      promptStatusLabel.textContent = '新提示词';
      promptSavedState.textContent = '尚未保存';
      promptSavedState.dataset.state = '';
      promptUsage.textContent = '正文是唯一必填项';
      promptFavorite.hidden = true;
      promptDelete.hidden = true;
      promptOrganize.hidden = true;
      promptPrimaryAction.textContent = '保存提示词';
      promptPrimaryAction.dataset.action = 'save';
      return;
    }

    promptEditor.dataset.mode = 'edit';
    setFieldValue(promptTitle, prompt.title);
    setFieldValue(promptTags, prompt.tags.join('，'));
    setFieldValue(promptContent, prompt.content);
    promptStatusDot.dataset.state = prompt.organizationStatus;
    promptStatusLabel.textContent = statusLabels[prompt.organizationStatus] || '未分类';
    promptSavedState.textContent = `更新于 ${formatShortDate(prompt.updatedAt)}`;
    promptSavedState.dataset.state = '';
    promptUsage.textContent = prompt.useCount
      ? `使用 ${prompt.useCount} 次 · 最近 ${formatShortDate(prompt.lastUsedAt)}`
      : '尚未使用';
    promptFavorite.hidden = false;
    promptFavorite.classList.toggle('active', prompt.favorite);
    promptFavorite.setAttribute('aria-label', prompt.favorite ? '取消收藏提示词' : '收藏提示词');
    promptFavorite.title = prompt.favorite ? '取消收藏' : '收藏';
    promptDelete.hidden = false;
    promptOrganize.hidden = false;
    promptOrganize.disabled = prompt.organizationStatus === 'organizing';
    promptOrganize.textContent = prompt.organizationStatus === 'organizing'
      ? '整理中…'
      : prompt.organizationStatus === 'failed' ? '重新整理' : 'AI 整理';
    promptPrimaryAction.textContent = '复制提示词';
    promptPrimaryAction.dataset.action = 'copy';
  }

  function renderHomePrompts() {
    const visible = Domain.sortPrompts(prompts).slice(0, 4);
    if (homePromptsCount) homePromptsCount.textContent = `${prompts.length} 条`;
    homePromptList.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('button');
      empty.className = 'home-prompt-empty';
      empty.type = 'button';
      empty.textContent = '保存第一条提示词';
      empty.addEventListener('click', openNewPrompt);
      homePromptList.appendChild(empty);
      return;
    }
    visible.forEach((prompt) => {
      const button = document.createElement('button');
      button.className = 'home-prompt-item';
      button.type = 'button';
      button.dataset.promptId = prompt.id;
      const title = document.createElement('strong');
      title.textContent = prompt.title;
      const meta = document.createElement('span');
      meta.textContent = prompt.favorite ? '★ 收藏' : prompt.tags[0] || '未分类';
      button.append(title, meta);
      button.addEventListener('click', () => copyPrompt(prompt.id, button));
      homePromptList.appendChild(button);
    });
  }

  function renderAll() {
    renderPromptList();
    renderPromptDetail();
    renderHomePrompts();
  }

  function openPromptTab() {
    if (typeof setActiveTab === 'function') setActiveTab('prompts');
  }

  function openNewPrompt() {
    if (!flushEditorSave()) return;
    openPromptTab();
    creatingPrompt = true;
    dirtyFields.clear();
    selectedPromptId = '';
    renderAll();
    requestAnimationFrame(() => promptContent?.focus());
  }

  function selectPrompt(promptId) {
    if (!prompts.some((prompt) => prompt.id === promptId)) return;
    if (!flushEditorSave()) return;
    creatingPrompt = false;
    dirtyFields.clear();
    selectedPromptId = promptId;
    renderAll();
  }

  function saveEditorFields() {
    const prompt = selectedPrompt();
    if (!prompt || creatingPrompt) return true;
    const content = promptContent.value.trim();
    if (!content) {
      promptSavedState.textContent = '正文不能为空';
      promptSavedState.dataset.state = 'error';
      promptContent.focus();
      return false;
    }
    const patch = {};
    if (dirtyFields.has('title')) patch.title = promptTitle.value;
    if (dirtyFields.has('tags')) patch.tags = promptTags.value;
    if (dirtyFields.has('content')) patch.content = content;
    if (!Object.keys(patch).length) return true;
    const next = Domain.updatePrompt(prompt, patch, Date.now());
    prompts = prompts.map((item) => item.id === prompt.id ? next : item);
    dirtyFields.clear();
    if (!persistPrompts()) return false;
    promptSavedState.dataset.state = 'saved';
    promptSavedState.textContent = '已自动保存';
    renderPromptList();
    renderHomePrompts();
    return true;
  }

  function scheduleSave(fieldName) {
    if (creatingPrompt) {
      persistDraft();
      promptSavedState.dataset.state = 'saved';
      promptSavedState.textContent = '草稿已保存';
      return;
    }
    dirtyFields.add(fieldName);
    if (saveTimer) clearTimeout(saveTimer);
    promptSavedState.dataset.state = 'saving';
    promptSavedState.textContent = '保存中…';
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveEditorFields();
    }, SAVE_DELAY_MS);
  }

  function flushEditorSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    return dirtyFields.size ? saveEditorFields() : true;
  }

  function saveNewPrompt() {
    const content = promptContent.value.trim();
    if (!content) {
      promptContent.focus();
      if (typeof showStatusToast === 'function') showStatusToast('先粘贴提示词正文');
      return null;
    }
    const now = Date.now();
    const prompt = Domain.createPrompt({
      title: promptTitle.value,
      content,
      tags: promptTags.value,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    }, uid(), now);
    if (!prompt) return null;
    prompts.push(prompt);
    selectedPromptId = prompt.id;
    creatingPrompt = false;
    dirtyFields.clear();
    clearDraft();
    persistPrompts();
    renderAll();
    if (typeof showStatusToast === 'function') showStatusToast('提示词已保存');
    requestAutomaticOrganization(prompt.id);
    return prompt;
  }

  async function copyPrompt(promptId, feedbackTarget) {
    const prompt = prompts.find((item) => item.id === promptId);
    if (!prompt || !window.notchAPI?.writeClipboard) return false;
    const copied = await window.notchAPI.writeClipboard({ type: 'text', text: prompt.content }).catch(() => false);
    if (!copied) {
      if (typeof showStatusToast === 'function') showStatusToast('复制失败，请重试');
      return false;
    }
    const used = Domain.markPromptUsed(prompt, Date.now());
    prompts = prompts.map((item) => item.id === prompt.id ? used : item);
    persistPrompts();
    feedbackTarget?.classList.add('copied');
    setTimeout(() => feedbackTarget?.classList.remove('copied'), 700);
    renderPromptList();
    renderHomePrompts();
    if (!creatingPrompt && selectedPromptId === prompt.id) renderPromptDetail();
    if (typeof showStatusToast === 'function') showStatusToast('提示词已复制');
    return true;
  }

  function deleteSelectedPrompt() {
    const prompt = selectedPrompt();
    if (!prompt) return;
    const originalIndex = prompts.findIndex((item) => item.id === prompt.id);
    prompts = prompts.filter((item) => item.id !== prompt.id);
    selectedPromptId = Domain.sortPrompts(prompts)[0]?.id || '';
    persistPrompts();
    renderAll();
    if (typeof showStatusToast === 'function') {
      showStatusToast(`已删除“${prompt.title}”`, {
        actionLabel: '撤销',
        onAction: () => {
          prompts.splice(Math.max(0, Math.min(originalIndex, prompts.length)), 0, prompt);
          selectedPromptId = prompt.id;
          persistPrompts();
          renderAll();
          showStatusToast('已撤销删除');
        },
      });
    }
  }

  function showConsent(promptId, force = false) {
    consentPromptId = promptId;
    consentForce = force;
    consentPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    consentBackdrop.hidden = false;
    requestAnimationFrame(() => consentAccept?.focus());
  }

  function hideConsent({ restoreFocus = true } = {}) {
    consentBackdrop.hidden = true;
    consentPromptId = '';
    consentForce = false;
    const focusTarget = consentPreviousFocus;
    consentPreviousFocus = null;
    if (restoreFocus && focusTarget?.isConnected) requestAnimationFrame(() => focusTarget.focus());
  }

  function requestAutomaticOrganization(promptId) {
    const prompt = prompts.find((item) => item.id === promptId);
    if (prompt?.titleSource === 'user' && prompt?.tagsSource === 'user') return;
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === 'accepted') {
      organizePrompt(promptId, false);
    } else if (!consent) {
      showConsent(promptId, false);
    }
  }

  function requestManualOrganization(promptId) {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (consent === 'accepted') organizePrompt(promptId, true);
    else showConsent(promptId, true);
  }

  async function organizePrompt(promptId, force) {
    const before = prompts.find((prompt) => prompt.id === promptId);
    if (!before || !window.notchAPI?.organizePrompt) return;
    prompts = prompts.map((prompt) => prompt.id === promptId
      ? { ...prompt, organizationStatus: 'organizing' }
      : prompt);
    persistPrompts();
    renderAll();

    const existingTags = [...new Set(prompts.flatMap((prompt) => prompt.tags || []))];
    const result = await window.notchAPI.organizePrompt({
      text: before.content,
      existingTags,
    }).catch(() => ({ ok: false, error: 'request_failed' }));
    const current = prompts.find((prompt) => prompt.id === promptId);
    if (!current) return;

    if (current.content !== before.content) {
      prompts = prompts.map((prompt) => prompt.id === promptId ? {
        ...prompt,
        organizationStatus: prompt.tags.length ? 'organized' : 'unclassified',
      } : prompt);
      persistPrompts();
      renderAll();
      if (typeof showStatusToast === 'function') showStatusToast('正文已更新，请重新整理');
      return;
    }

    if (!result?.ok) {
      const notConfigured = result?.error === 'not_configured';
      const failure = Domain.promptOrganizationFailure(result);
      prompts = prompts.map((prompt) => prompt.id === promptId
        ? { ...prompt, organizationStatus: notConfigured ? 'unclassified' : 'failed' }
        : prompt);
      persistPrompts();
      renderAll();
      if (typeof showStatusToast === 'function') {
        showStatusToast(failure.message, failure.needsConfig ? {
          actionLabel: '配置 API',
          onAction: () => document.getElementById('settings-api-configure')?.click(),
        } : {});
      }
      return;
    }

    const organized = Domain.applyPromptOrganization(current, result, Date.now(), force);
    prompts = prompts.map((prompt) => prompt.id === promptId ? organized : prompt);
    persistPrompts();
    renderAll();
    if (typeof showStatusToast === 'function') {
      const changed = organized.title !== current.title
        || organized.tags.join('\u0000') !== current.tags.join('\u0000');
      const successMessage = result.truncated
        ? 'AI 已整理（仅分析正文前 16000 字）'
        : changed ? 'AI 已补充标题和标签' : 'AI 整理完成，已保留手动内容';
      showStatusToast(successMessage, {
        actionLabel: '撤销',
        onAction: () => {
          const latest = prompts.find((prompt) => prompt.id === promptId);
          if (!latest) return;
          prompts = prompts.map((prompt) => prompt.id === promptId ? {
            ...latest,
            title: latest.titleSource === 'user' ? latest.title : before.title,
            tags: latest.tagsSource === 'user' ? latest.tags : before.tags,
            titleSource: latest.titleSource === 'user' ? 'user' : before.titleSource,
            tagsSource: latest.tagsSource === 'user' ? 'user' : before.tagsSource,
            organizationStatus: latest.tagsSource === 'user'
              ? latest.tags.length ? 'organized' : 'unclassified'
              : before.organizationStatus,
          } : prompt);
          persistPrompts();
          renderAll();
          showStatusToast('已撤销 AI 整理');
        },
      });
    }
  }

  promptNew?.addEventListener('click', openNewPrompt);
  promptEmptyNew?.addEventListener('click', openNewPrompt);
  homePromptsOpen?.addEventListener('click', openPromptTab);
  promptSearch?.addEventListener('input', () => {
    flushEditorSave();
    renderPromptList();
    renderPromptDetail();
  });
  promptList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-prompt-id]');
    if (row) selectPrompt(row.dataset.promptId);
  });
  [
    [promptTitle, 'title'],
    [promptTags, 'tags'],
    [promptContent, 'content'],
  ].forEach(([field, fieldName]) => field?.addEventListener('input', () => scheduleSave(fieldName)));
  promptEditor.addEventListener('submit', (event) => {
    event.preventDefault();
    if (creatingPrompt) saveNewPrompt();
    else if (selectedPromptId) {
      if (flushEditorSave()) copyPrompt(selectedPromptId, promptPrimaryAction);
    }
  });
  promptFavorite?.addEventListener('click', () => {
    if (!flushEditorSave()) return;
    const prompt = selectedPrompt();
    if (!prompt) return;
    const next = Domain.updatePrompt(prompt, { favorite: !prompt.favorite }, Date.now());
    prompts = prompts.map((item) => item.id === prompt.id ? next : item);
    persistPrompts();
    renderAll();
  });
  promptDelete?.addEventListener('click', () => {
    flushEditorSave();
    deleteSelectedPrompt();
  });
  promptOrganize?.addEventListener('click', () => {
    if (!flushEditorSave()) return;
    if (selectedPromptId) requestManualOrganization(selectedPromptId);
  });
  consentAccept?.addEventListener('click', () => {
    const promptId = consentPromptId;
    const force = consentForce;
    localStorage.setItem(CONSENT_KEY, 'accepted');
    hideConsent();
    if (promptId) organizePrompt(promptId, force);
  });
  consentDecline?.addEventListener('click', () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    hideConsent();
    if (typeof showStatusToast === 'function') showStatusToast('已关闭自动整理，可随时手动开启');
  });
  consentBackdrop?.addEventListener('click', (event) => {
    if (event.target === consentBackdrop) hideConsent();
  });
  document.addEventListener('keydown', (event) => {
    if (!consentBackdrop.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault();
        hideConsent();
        return;
      }
      if (event.key === 'Tab') {
        const buttons = [consentDecline, consentAccept].filter((button) => button && !button.disabled);
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f'
      && document.querySelector('.tab.active')?.dataset.tab === 'prompts') {
      event.preventDefault();
      promptSearch?.focus();
      promptSearch?.select();
    }
  });
  document.addEventListener('notch:tabchange', (event) => {
    if (event.detail?.tab === 'prompts') renderAll();
  });
  window.addEventListener('beforeunload', () => {
    flushEditorSave();
  });

  renderAll();
})();
