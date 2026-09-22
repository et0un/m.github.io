(() => {
  const AUTH_USER = 'inproxy';
  const AUTH_HASH = '75788c53f8603f1babcab5dd16059bf6c2e1be6ae264b5062961e23fde58ba41';
  const courseName = document.body.dataset.courseName || 'Курс';
  const loginGate = document.getElementById('loginGate');
  const studio = document.getElementById('studio');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutButton = document.getElementById('logoutButton');
  const authKey = `studio-auth:${courseName}`;

  const enc = new TextEncoder();
  async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', enc.encode(value));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Must be initialized before restoring an existing session.
  // Otherwise initEditor() is called while `initialized` is still in the TDZ
  // and the visible editor opens without any working controls.
  let initialized = false;

  function showStudio() {
    loginGate.hidden = true;
    studio.hidden = false;
    initEditor();
  }

  if (sessionStorage.getItem(authKey) === '1') showStudio();

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.textContent = '';
    const fd = new FormData(loginForm);
    try {
      const passHash = await sha256(String(fd.get('password') || ''));
      if (String(fd.get('username') || '') === AUTH_USER && passHash === AUTH_HASH) {
        sessionStorage.setItem(authKey, '1');
        loginForm.reset();
        showStudio();
      } else {
        loginError.textContent = 'Неверный логин или пароль.';
      }
    } catch (error) {
      loginError.textContent = 'Не удалось проверить пароль. Откройте редактор через опубликованный HTTPS-сайт.';
    }
  });

  logoutButton?.addEventListener('click', () => {
    sessionStorage.removeItem(authKey);
    location.reload();
  });

  function initEditor() {
    if (initialized) return;
    initialized = true;

    const baseTopics = Array.isArray(window.COURSE_TOPICS) ? window.COURSE_TOPICS : [];
    let editorTopics = baseTopics.map(t => ({ slug: t.slug, title: t.title, tags: Array.isArray(t.tags) ? [...t.tags] : [] }));

    const topicSelect = document.getElementById('topicSelect');
    const slugInput = document.getElementById('slugInput');
    const titleInput = document.getElementById('titleInput');
    const tagsInput = document.getElementById('tagsInput');
    const previewTitle = document.getElementById('previewTitle');
    const previewTags = document.getElementById('previewTags');
    const editable = document.getElementById('editableContent');
    const status = document.getElementById('editorStatus');
    const codeBox = document.getElementById('codeBox');
    const lectureControls = document.getElementById('lectureControls');
    const homeControls = document.getElementById('homeControls');
    const lecturePreview = document.getElementById('lecturePreview');
    const homePreview = document.getElementById('homePreview');
    const assetList = document.getElementById('assetList');
    const imageFileInput = document.getElementById('imageFileInput');
    const removeMedia = document.getElementById('removeMedia');

    const homeAboutTitle = document.getElementById('homeAboutTitle');
    const homeLinksTitle = document.getElementById('homeLinksTitle');
    const homeAboutEditable = document.getElementById('homeAboutEditable');
    const homePreviewAboutTitle = document.getElementById('homePreviewAboutTitle');
    const homePreviewLinksTitle = document.getElementById('homePreviewLinksTitle');
    const homeLinkFields = document.getElementById('homeLinkFields');
    const homeLinksPreview = document.getElementById('homeLinksPreview');

    const resourceControls = document.getElementById('resourceControls');
    const resourcePreview = document.getElementById('resourcePreview');
    const resourceSelect = document.getElementById('resourceSelect');
    const resourcePath = document.getElementById('resourcePath');
    const resourceTitle = document.getElementById('resourceTitle');
    const resourcePreviewTitle = document.getElementById('resourcePreviewTitle');
    const resourceEditable = document.getElementById('resourceEditable');

    const githubOwner = document.getElementById('githubOwner');
    const githubRepo = document.getElementById('githubRepo');
    const githubBranch = document.getElementById('githubBranch');
    const githubToken = document.getElementById('githubToken');
    const githubState = document.getElementById('githubState');

    let activeMode = 'lecture';
    let publishedHomeSource = '';
    let homeLoaded = false;
    let homeLinks = [];
    let publishedResourceSource = '';
    let resourceLoadedPath = '';
    let resourceDraftTimer = null;
    let homeDraftTimer = null;
    const assetFiles = new Map();
    const assetUrls = new Map();
    let selectedMedia = null;

    const escapeHtml = (s) => String(s ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const tagClass = t => t === 'Актуально' ? 'actual'
      : t === 'Теория' ? 'theory'
      : t === 'Практика' ? 'practice'
      : t === 'Софт' ? 'soft'
      : t === 'Д/з' ? 'home'
      : t === 'Курсовая работа' ? 'coursework'
      : '';

    const parseTags = () => tagsInput.value.split(',').map(s => s.trim()).filter(Boolean);
    const slugify = value => value.toLowerCase().trim()
      .replace(/ё/g, 'e').replace(/[^a-z0-9а-я\s-]/gi, '')
      .replace(/\s+/g, '-').replace(/-+/g, '-');

    const setStatus = (message) => {
      status.textContent = message;
      clearTimeout(setStatus.timer);
      setStatus.timer = setTimeout(() => { if (status.textContent === message) status.textContent = ''; }, 3500);
    };


    // ---------------- direct GitHub publishing ----------------
    const githubStorageKey = `studio-github:${courseName}`;
    const githubTokenKey = `studio-github-token:${courseName}`;

    function detectGitHubPagesRepo() {
      const host = location.hostname || '';
      if (!host.endsWith('.github.io')) return {};
      const owner = host.slice(0, -'.github.io'.length);
      const parts = location.pathname.split('/').filter(Boolean);
      const repo = parts[0] && parts[0] !== 'studio' ? parts[0] : `${owner}.github.io`;
      return { owner, repo, branch: 'main' };
    }

    function loadGithubSettings() {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(githubStorageKey) || '{}'); } catch (_) {}
      const detected = detectGitHubPagesRepo();
      githubOwner.value = saved.owner || detected.owner || '';
      githubRepo.value = saved.repo || detected.repo || '';
      githubBranch.value = saved.branch || detected.branch || 'main';
      githubToken.value = sessionStorage.getItem(githubTokenKey) || '';
    }

    function githubConfig(requireToken = true) {
      const cfg = {
        owner: githubOwner.value.trim(),
        repo: githubRepo.value.trim(),
        branch: githubBranch.value.trim() || 'main',
        token: githubToken.value.trim()
      };
      localStorage.setItem(githubStorageKey, JSON.stringify({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch }));
      if (cfg.token) sessionStorage.setItem(githubTokenKey, cfg.token);
      if (!cfg.owner || !cfg.repo || (requireToken && !cfg.token)) throw new Error('Заполните GitHub owner, repo и token');
      return cfg;
    }

    function githubApiPath(path) {
      return path.split('/').map(encodeURIComponent).join('/');
    }

    async function githubFetch(url, options = {}) {
      const cfg = githubConfig(true);
      const headers = {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${cfg.token}`,
        ...options.headers
      };
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json()).message || ''; } catch (_) {}
        throw new Error(`${response.status}${detail ? ' · ' + detail : ''}`);
      }
      return response;
    }

    function bytesToBase64(bytes) {
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      return btoa(binary);
    }

    async function githubPublishBytes(path, bytes, message) {
      const cfg = githubConfig(true);
      const api = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${githubApiPath(path)}`;
      let sha;
      const current = await fetch(`${api}?ref=${encodeURIComponent(cfg.branch)}`, {
        cache: 'no-store',
        headers: { 'Accept':'application/vnd.github+json', 'Authorization':`Bearer ${cfg.token}` }
      });
      if (current.ok) {
        const data = await current.json(); sha = data.sha;
      } else if (current.status !== 404) {
        let detail = ''; try { detail = (await current.json()).message || ''; } catch (_) {}
        throw new Error(`${current.status}${detail ? ' · ' + detail : ''}`);
      }
      const payload = { message, content: bytesToBase64(bytes), branch: cfg.branch };
      if (sha) payload.sha = sha;
      const response = await githubFetch(api, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      return response.json();
    }

    async function githubPublishText(path, text, message) {
      return githubPublishBytes(path, enc.encode(text), message);
    }

    async function checkGithubConnection() {
      try {
        const cfg = githubConfig(true);
        githubState.textContent = 'Проверяю доступ…';
        await githubFetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`);
        githubState.textContent = `✓ Подключено: ${cfg.owner}/${cfg.repo} · ${cfg.branch}. Токен останется только в этой вкладке.`;
        setStatus('GitHub подключён');
      } catch (error) {
        githubState.textContent = `Не удалось подключиться: ${error.message}`;
        setStatus('Ошибка подключения GitHub');
      }
    }

    document.getElementById('githubConnect')?.addEventListener('click', checkGithubConnection);
    [githubOwner, githubRepo, githubBranch].forEach(input => input?.addEventListener('change', () => { try { githubConfig(false); } catch (_) {} }));
    githubToken?.addEventListener('change', () => { if (githubToken.value.trim()) sessionStorage.setItem(githubTokenKey, githubToken.value.trim()); });
    loadGithubSettings();

    function switchMode(mode) {
      activeMode = mode;
      document.querySelectorAll('[data-editor-mode]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.editorMode === mode));
      lectureControls.hidden = mode !== 'lecture';
      homeControls.hidden = mode !== 'home';
      resourceControls.hidden = mode !== 'resource';
      lecturePreview.hidden = mode !== 'lecture';
      homePreview.hidden = mode !== 'home';
      resourcePreview.hidden = mode !== 'resource';
      if (mode === 'home' && !homeLoaded) loadPublishedHome();
      if (mode === 'resource' && !resourceLoadedPath) loadPublishedResource();
    }
    document.querySelectorAll('[data-editor-mode]').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.editorMode)));

    function renderTopicSelect(selected = '') {
      topicSelect.innerHTML = '<option value="">+ Новая лекция</option>' + editorTopics.map((t, i) =>
        `<option value="${escapeHtml(t.slug)}">${String(i + 1).padStart(2, '0')} — ${escapeHtml(t.title)}</option>`
      ).join('');
      topicSelect.value = selected;
    }

    function currentRecord() {
      return { slug: slugInput.value.trim(), title: titleInput.value.trim(), tags: parseTags() };
    }

    function topicObjectText() {
      return JSON.stringify(currentRecord(), null, 2);
    }

    function updateCodeBox() {
      codeBox.value = topicObjectText();
    }

    function renderMeta() {
      previewTitle.textContent = titleInput.value.trim() || 'Название темы';
      const tags = parseTags();
      previewTags.innerHTML = tags.map(t => `<span class="tag ${tagClass(t)}">${escapeHtml(t)}</span>`).join('');
      previewTags.hidden = tags.length === 0;
      updateCodeBox();
      scheduleDraftSave();
    }

    titleInput.addEventListener('input', () => {
      if (!slugInput.dataset.touched) slugInput.value = slugify(titleInput.value);
      renderMeta();
    });
    slugInput.addEventListener('input', () => { slugInput.dataset.touched = '1'; renderMeta(); });
    tagsInput.addEventListener('input', renderMeta);
    editable.addEventListener('input', () => { updateCodeBox(); scheduleDraftSave(); });

    function newLecture() {
      topicSelect.value = '';
      slugInput.value = '';
      slugInput.dataset.touched = '';
      titleInput.value = '';
      tagsInput.value = '';
      editable.innerHTML = '<p class="lead">Краткое вступление к лекции.</p><h2>Первый раздел</h2><p>Начните писать текст…</p>';
      clearAssets();
      selectMediaBlock(null);
      renderMeta();
      setStatus('Новая лекция');
    }

    topicSelect.addEventListener('change', () => {
      const topic = editorTopics.find(t => t.slug === topicSelect.value);
      if (!topic) return newLecture();
      slugInput.value = topic.slug;
      slugInput.dataset.touched = '1';
      titleInput.value = topic.title;
      tagsInput.value = topic.tags.join(', ');
      const draft = loadDraft(topic.slug);
      if (draft?.content) {
        editable.innerHTML = draft.content;
        if (draft.title) titleInput.value = draft.title;
        if (Array.isArray(draft.tags)) tagsInput.value = draft.tags.join(', ');
        setStatus('Загружен локальный черновик');
      } else {
        editable.innerHTML = '<p class="lead">Нажмите «Загрузить опубликованную», чтобы получить текущий текст с сайта.</p>';
      }
      clearAssets();
      selectMediaBlock(null);
      renderMeta();
    });

    document.getElementById('loadPublished').addEventListener('click', async () => {
      const slug = slugInput.value.trim();
      if (!slug) return setStatus('Сначала выберите лекцию');
      try {
        const response = await fetch(`../lectures/${encodeURIComponent(slug)}.html?studio=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('not found');
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const article = doc.querySelector('.lecture-article');
        if (!article) throw new Error('article missing');
        const nodes = [];
        let started = false;
        [...article.children].forEach(node => {
          if (node.classList?.contains('lecture-pagination')) return;
          if (!started) {
            if (node.matches('.tags')) started = true;
            return;
          }
          nodes.push(node.outerHTML);
        });
        editable.innerHTML = nodes.join('\n') || '<p class="lead">Пустая лекция.</p>';
        clearAssets();
        selectMediaBlock(null);
        renderMeta();
        setStatus('Опубликованная лекция загружена');
      } catch (e) {
        setStatus('Не удалось загрузить страницу');
      }
    });

    // Formatting toolbar for lecture.
    document.querySelectorAll('[data-format]').forEach(button => {
      button.addEventListener('click', () => {
        editable.focus();
        const cmd = button.dataset.format;
        if (cmd === 'h2') document.execCommand('formatBlock', false, 'h2');
        else if (cmd === 'p') document.execCommand('formatBlock', false, 'p');
        else if (cmd === 'blockquote') document.execCommand('formatBlock', false, 'blockquote');
        else if (cmd === 'ul') document.execCommand('insertUnorderedList');
        else if (cmd === 'ol') document.execCommand('insertOrderedList');
        else document.execCommand(cmd, false, null);
        editable.dispatchEvent(new Event('input'));
      });
    });

    function insertAtCaret(html, root = editable) {
      root.focus();
      const selection = getSelection();
      if (!selection || !selection.rangeCount || !root.contains(selection.anchorNode)) {
        root.insertAdjacentHTML('beforeend', html);
        return;
      }
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const frag = range.createContextualFragment(html);
      const last = frag.lastChild;
      range.insertNode(frag);
      if (last) {
        range.setStartAfter(last); range.collapse(true);
        selection.removeAllRanges(); selection.addRange(range);
      }
    }

    document.getElementById('addLead').addEventListener('click', () => {
      insertAtCaret('<p class="lead">Вступительный текст…</p>');
      editable.dispatchEvent(new Event('input'));
    });

    document.getElementById('addLink').addEventListener('click', () => {
      const url = prompt('URL ссылки:');
      if (!url) return;
      editable.focus();
      const sel = getSelection();
      if (sel && !sel.isCollapsed && editable.contains(sel.anchorNode)) {
        document.execCommand('createLink', false, url);
      } else {
        const label = prompt('Текст ссылки:', 'Ссылка') || 'Ссылка';
        insertAtCaret(`<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`);
      }
      editable.dispatchEvent(new Event('input'));
    });

    function sanitiseFileName(name) {
      const lastDot = name.lastIndexOf('.');
      const ext = lastDot >= 0 ? name.slice(lastDot).toLowerCase() : '';
      const stem = (lastDot >= 0 ? name.slice(0, lastDot) : name)
        .toLowerCase().replace(/ё/g, 'e').replace(/[^a-z0-9а-я_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'image';
      let candidate = `${stem}${ext}`;
      let i = 2;
      while (assetFiles.has(candidate)) candidate = `${stem}-${i++}${ext}`;
      return candidate;
    }

    function clearAssets() {
      assetUrls.forEach(url => URL.revokeObjectURL(url));
      assetUrls.clear();
      assetFiles.clear();
      renderAssetList();
    }

    function renderAssetList() {
      if (!assetList) return;
      assetList.innerHTML = [...assetFiles.entries()].map(([name, file]) => {
        const url = assetUrls.get(name) || '';
        return `<div class="editor-asset" data-asset-name="${escapeHtml(name)}"><img src="${escapeHtml(url)}" alt=""><div class="editor-asset-copy"><strong>${escapeHtml(name)}</strong><small>assets/images/${escapeHtml(name)}</small></div><button type="button" aria-label="Убрать из пакета">×</button></div>`;
      }).join('');
      assetList.querySelectorAll('.editor-asset button').forEach(btn => btn.addEventListener('click', () => {
        const row = btn.closest('.editor-asset');
        const name = row.dataset.assetName;
        const url = assetUrls.get(name);
        if (url) URL.revokeObjectURL(url);
        assetUrls.delete(name);
        assetFiles.delete(name);
        renderAssetList();
      }));
    }

    function addLocalImage(file, options = {}) {
      if (!file || !file.type.startsWith('image/')) return;
      const name = sanitiseFileName(file.name || 'image.png');
      const url = URL.createObjectURL(file);
      assetFiles.set(name, file);
      assetUrls.set(name, url);
      renderAssetList();
      const alt = options.alt ?? (prompt('Описание изображения (alt):', '') || '');
      const caption = options.caption ?? (prompt('Подпись под изображением (можно оставить пустой):', '') || '');
      const cap = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
      insertAtCaret(`<figure class="embedded-media"><img src="${escapeHtml(url)}" data-export-src="../assets/images/${escapeHtml(name)}" data-studio-asset="${escapeHtml(name)}" alt="${escapeHtml(alt)}">${cap}</figure><p><br></p>`);
      editable.dispatchEvent(new Event('input'));
      setStatus(`Фото добавлено: ${name}`);
    }

    document.getElementById('addImage').addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', () => {
      const file = imageFileInput.files?.[0];
      if (file) addLocalImage(file);
      imageFileInput.value = '';
    });

    document.getElementById('addImageUrl').addEventListener('click', () => {
      const src = prompt('URL изображения или путь на сайте:');
      if (!src) return;
      const alt = prompt('Описание изображения (alt):', '') || '';
      const caption = prompt('Подпись под изображением (можно оставить пустой):', '') || '';
      const cap = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
      insertAtCaret(`<figure class="embedded-media"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">${cap}</figure><p><br></p>`);
      editable.dispatchEvent(new Event('input'));
    });

    editable.addEventListener('dragover', event => {
      if ([...(event.dataTransfer?.items || [])].some(item => item.kind === 'file' && item.type.startsWith('image/'))) {
        event.preventDefault();
        editable.classList.add('editor-drop-active');
      }
    });
    editable.addEventListener('dragleave', () => editable.classList.remove('editor-drop-active'));
    editable.addEventListener('drop', event => {
      const file = [...(event.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      editable.classList.remove('editor-drop-active');
      addLocalImage(file, { alt: '', caption: '' });
    });

    function selectMediaBlock(figure) {
      if (selectedMedia && selectedMedia !== figure) selectedMedia.classList.remove('is-selected-media');
      selectedMedia = figure && editable.contains(figure) ? figure : null;
      if (selectedMedia) selectedMedia.classList.add('is-selected-media');
      if (removeMedia) removeMedia.disabled = !selectedMedia;
    }

    editable.addEventListener('click', event => {
      const figure = event.target.closest?.('figure.embedded-media');
      if (figure && editable.contains(figure)) {
        event.preventDefault();
        selectMediaBlock(figure);
      } else if (!event.target.closest?.('.editor-tool')) {
        selectMediaBlock(null);
      }
    });

    removeMedia?.addEventListener('click', () => {
      if (!selectedMedia || !editable.contains(selectedMedia)) {
        selectMediaBlock(null);
        return setStatus('Сначала нажмите на фото или видео в предпросмотре');
      }
      const wasVideo = !!selectedMedia.querySelector('iframe');
      const img = selectedMedia.querySelector('img[data-studio-asset]');
      if (img?.dataset.studioAsset) {
        const name = img.dataset.studioAsset;
        const url = assetUrls.get(name);
        if (url) URL.revokeObjectURL(url);
        assetUrls.delete(name);
        assetFiles.delete(name);
        renderAssetList();
      }
      selectedMedia.remove();
      selectMediaBlock(null);
      editable.dispatchEvent(new Event('input'));
      editable.focus();
      setStatus(wasVideo ? 'Видео удалено' : 'Изображение удалено');
    });

    function extractVideoSource(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';

      // Можно вставить не только URL, но и целиком iframe-код из YouTube/Vimeo.
      if (/<iframe\b/i.test(raw)) {
        try {
          const doc = new DOMParser().parseFromString(raw, 'text/html');
          const src = doc.querySelector('iframe')?.getAttribute('src');
          if (src) return src.replaceAll('&amp;', '&');
        } catch (_) {}
        const match = raw.match(/src\s*=\s*["']([^"']+)["']/i);
        if (match?.[1]) return match[1].replaceAll('&amp;', '&');
      }
      return raw.replaceAll('&amp;', '&');
    }

    function youtubeStartSeconds(value) {
      if (!value) return 0;
      if (/^\d+$/.test(value)) return Number(value);
      const h = Number(value.match(/(\d+)h/)?.[1] || 0);
      const m = Number(value.match(/(\d+)m/)?.[1] || 0);
      const s = Number(value.match(/(\d+)s/)?.[1] || 0);
      return h * 3600 + m * 60 + s;
    }

    function normaliseVideoEmbed(value) {
      const source = extractVideoSource(value);
      if (!source) return null;

      let u;
      try { u = new URL(source, location.href); }
      catch (_) { return null; }

      const host = u.hostname.toLowerCase().replace(/^www\./, '');
      const parts = u.pathname.split('/').filter(Boolean);

      // YouTube: watch, youtu.be, Shorts, Live и уже готовый embed.
      if (host === 'youtu.be' || host.endsWith('.youtu.be')) {
        const id = parts[0];
        if (!id) return null;
        const out = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
        const start = youtubeStartSeconds(u.searchParams.get('t') || u.searchParams.get('start'));
        if (start) out.searchParams.set('start', start);
        return { url: out.href, provider: 'YouTube' };
      }
      if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) {
        let id = '';
        if (parts[0] === 'embed') id = parts[1] || '';
        else if (parts[0] === 'shorts' || parts[0] === 'live') id = parts[1] || '';
        else id = u.searchParams.get('v') || '';
        if (!id) return null;
        const out = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
        const start = youtubeStartSeconds(u.searchParams.get('t') || u.searchParams.get('start'));
        if (start) out.searchParams.set('start', start);
        return { url: out.href, provider: 'YouTube' };
      }

      // Vimeo: обычная страница vimeo.com/123..., private/unlisted и player.vimeo.com/video/...
      if (host === 'player.vimeo.com' && parts[0] === 'video' && parts[1]) {
        return { url: u.href, provider: 'Vimeo' };
      }
      if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
        const idIndex = parts.findIndex(part => /^\d+$/.test(part));
        if (idIndex >= 0) {
          const id = parts[idIndex];
          const out = new URL(`https://player.vimeo.com/video/${id}`);
          const hashFromPath = parts[idIndex + 1] && !/^\d+$/.test(parts[idIndex + 1]) ? parts[idIndex + 1] : '';
          const hash = u.searchParams.get('h') || hashFromPath;
          if (hash) out.searchParams.set('h', hash);
          return { url: out.href, provider: 'Vimeo' };
        }
      }

      // Сохраняем совместимость с готовыми embed-ссылками Rutube/VK.
      if (host.endsWith('rutube.ru')) {
        if (parts[0] === 'play' && parts[1] === 'embed') return { url: u.href, provider: 'Rutube' };
        if (parts[0] === 'video' && parts[1]) return { url: `https://rutube.ru/play/embed/${parts[1]}`, provider: 'Rutube' };
      }
      if ((host === 'vk.com' || host === 'vkvideo.ru' || host.endsWith('.vk.com')) && u.pathname.includes('video_ext.php')) {
        return { url: u.href, provider: 'VK Video' };
      }

      // Если пользователь вставил iframe неизвестного сервиса — используем его src как готовый embed.
      if (/<iframe\b/i.test(String(value || '')) && /^https?:$/.test(u.protocol)) {
        return { url: u.href, provider: 'Видео' };
      }
      return null;
    }

    document.getElementById('addVideo').addEventListener('click', () => {
      const src = prompt('Вставьте обычную ссылку YouTube/Vimeo или iframe-код. Также поддерживаются embed-ссылки Rutube/VK Video:');
      if (!src) return;
      const video = normaliseVideoEmbed(src);
      if (!video) {
        setStatus('Не удалось распознать видео. Вставьте обычную ссылку YouTube/Vimeo или iframe-код.');
        alert('Не удалось распознать ссылку. Для YouTube/Vimeo можно вставить обычный URL ролика или целиком iframe-код из кнопки «Поделиться / Встроить».');
        return;
      }
      const title = prompt('Название видео:', video.provider) || video.provider;
      const allow = video.provider === 'Vimeo'
        ? 'autoplay; fullscreen; picture-in-picture; clipboard-write'
        : 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      insertAtCaret(`<figure class="embedded-media" data-video-provider="${escapeHtml(video.provider)}"><div class="video-frame"><iframe src="${escapeHtml(video.url)}" title="${escapeHtml(title)}" loading="lazy" allow="${escapeHtml(allow)}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div></figure><p><br></p>`);
      editable.dispatchEvent(new Event('input'));
      setStatus(`${video.provider}: видео добавлено`);
    });

    document.getElementById('saveTopic').addEventListener('click', () => {
      const record = currentRecord();
      if (!record.slug || !record.title) return setStatus('Нужны slug и название');
      const index = editorTopics.findIndex(t => t.slug === record.slug);
      if (index >= 0) editorTopics[index] = record;
      else editorTopics.push(record);
      renderTopicSelect(record.slug);
      setStatus('Тема обновлена в редакторе');
    });

    document.getElementById('deleteTopic').addEventListener('click', () => {
      const slug = slugInput.value.trim();
      if (!slug) return;
      if (!confirm('Удалить тему из списка редактора? Файл лекции на GitHub нужно будет удалить отдельно.')) return;
      editorTopics = editorTopics.filter(t => t.slug !== slug);
      renderTopicSelect('');
      newLecture();
      setStatus('Тема удалена из списка');
    });

    function exportLectureContent() {
      const clone = editable.cloneNode(true);
      clone.querySelectorAll('img[data-export-src]').forEach(img => {
        img.setAttribute('src', img.dataset.exportSrc);
        img.removeAttribute('data-export-src');
        img.removeAttribute('data-studio-asset');
      });
      clone.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
      clone.querySelectorAll('.is-selected-media').forEach(el => el.classList.remove('is-selected-media'));
      clone.querySelectorAll('[data-studio-control]').forEach(el => el.remove());
      return clone.innerHTML.trim();
    }

    function lectureHtml() {
      const record = currentRecord();
      const safeSlug = escapeHtml(record.slug);
      const safeTitle = escapeHtml(record.title || 'Лекция');
      const content = exportLectureContent();
      return `<!doctype html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <meta name="description" content="Лекция курса «${escapeHtml(courseName)}»">\n  <title>${safeTitle} — ${escapeHtml(courseName)}</title>\n  <link rel="stylesheet" href="../styles.css">\n</head>\n<body class="lecture-page" data-topic="${safeSlug}">\n<header class="lecture-topbar">\n  <nav aria-label="Главная навигация">\n    <a href="../index.html">Главная</a>\n    <a href="../index.html#about">О курсе</a>\n    <a href="../index.html#links">Ссылки</a>\n    <a class="active" href="../index.html#topics">Темы</a>\n  </nav>\n</header>\n<button class="topics-toggle" type="button" aria-expanded="false"><strong>Темы курса</strong><span>Темы · открыть</span></button>\n<div class="lecture-shell">\n  <aside class="lecture-sidebar" aria-label="Темы курса">\n    <div class="sidebar-head"><span>ТЕМЫ КУРСА</span><button class="sidebar-close" type="button" aria-label="Закрыть список тем">×</button></div>\n    <div id="lectureTopics" class="lecture-topic-list"></div>\n  </aside>\n  <main class="lecture-main">\n    <article class="lecture-article">\n      <div class="lecture-kicker">ТЕМА</div>\n      <h1>${safeTitle}</h1>\n      <div class="tags"></div>\n${content.split('\n').map(line => '      ' + line).join('\n')}\n      <nav class="lecture-pagination" aria-label="Навигация по лекциям">\n        <a id="prevLecture" href="#">← <span>Предыдущая тема</span></a>\n        <a id="nextLecture" href="#"><span>Следующая тема</span> →</a>\n      </nav>\n    </article>\n  </main>\n</div>\n<div class="sidebar-backdrop" aria-hidden="true"></div>\n<script src="../topics.js"></script>\n<script src="../lecture.js"></script>\n</body>\n</html>\n`;
    }

    function download(name, content, type = 'text/html;charset=utf-8') {
      const blob = content instanceof Blob ? content : new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1200);
    }

    function topicsJsText() {
      return `window.COURSE_TOPICS = ${JSON.stringify(editorTopics, null, 2)};\n`;
    }

    // Minimal uncompressed ZIP writer — no external library required.
    const crcTable = (() => {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
      return table;
    })();
    function crc32(bytes) {
      let c = 0xffffffff;
      for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    }
    function u16(n) { return new Uint8Array([n & 255, (n >>> 8) & 255]); }
    function u32(n) { return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]); }
    function concatBytes(parts) {
      const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
      let offset = 0;
      for (const p of parts) { out.set(p, offset); offset += p.length; }
      return out;
    }
    async function makeZip(entries) {
      const local = [];
      const central = [];
      let offset = 0;
      for (const entry of entries) {
        const nameBytes = enc.encode(entry.name.replaceAll('\\', '/'));
        const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(await entry.data.arrayBuffer());
        const crc = crc32(data);
        const localHeader = concatBytes([
          u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes
        ]);
        local.push(localHeader, data);
        const centralHeader = concatBytes([
          u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
        ]);
        central.push(centralHeader);
        offset += localHeader.length + data.length;
      }
      const centralBytes = concatBytes(central);
      const end = concatBytes([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(offset), u16(0)]);
      return new Blob([concatBytes([...local, centralBytes, end])], { type: 'application/zip' });
    }

    document.getElementById('downloadLecture').addEventListener('click', () => {
      const slug = slugInput.value.trim();
      if (!slug) return setStatus('Укажите slug');
      download(`${slug}.html`, lectureHtml());
      setStatus('HTML лекции скачан');
    });

    document.getElementById('downloadTopics').addEventListener('click', () => {
      download('topics.js', topicsJsText(), 'text/javascript;charset=utf-8');
      setStatus('topics.js скачан');
    });

    document.getElementById('downloadPackage').addEventListener('click', async () => {
      const slug = slugInput.value.trim();
      if (!slug) return setStatus('Укажите slug');
      const entries = [
        { name: `lectures/${slug}.html`, data: new Blob([lectureHtml()], { type: 'text/html;charset=utf-8' }) },
        { name: 'topics.js', data: new Blob([topicsJsText()], { type: 'text/javascript;charset=utf-8' }) },
        { name: 'README_UPLOAD.txt', data: new Blob(['Загрузите lectures/*.html в папку lectures, topics.js в корень репозитория, а файлы из assets/images — в assets/images.\n'], { type: 'text/plain;charset=utf-8' }) }
      ];
      for (const [name, file] of assetFiles) entries.push({ name: `assets/images/${name}`, data: file });
      const zip = await makeZip(entries);
      download(`${slug}-package.zip`, zip, 'application/zip');
      setStatus(`Пакет скачан · изображений: ${assetFiles.size}`);
    });


    function upsertCurrentTopic() {
      const record = currentRecord();
      if (!record.slug || !record.title) throw new Error('Нужны slug и название');
      const index = editorTopics.findIndex(t => t.slug === record.slug);
      if (index >= 0) editorTopics[index] = record;
      else editorTopics.push(record);
      renderTopicSelect(record.slug);
      return record;
    }

    document.getElementById('publishLecture')?.addEventListener('click', async () => {
      try {
        const record = upsertCurrentTopic();
        setStatus('Публикую лекцию…');
        await githubPublishText(`lectures/${record.slug}.html`, lectureHtml(), `Обновить лекцию: ${record.title}`);
        await githubPublishText('topics.js', topicsJsText(), `Обновить список тем · ${courseName}`);
        let uploaded = 0;
        for (const [name, file] of assetFiles) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          await githubPublishBytes(`assets/images/${name}`, bytes, `Добавить изображение ${name}`);
          uploaded++;
        }
        setStatus(`✓ Лекция опубликована${uploaded ? ` · картинок: ${uploaded}` : ''}`);
      } catch (error) { setStatus(`GitHub: ${error.message}`); }
    });

    document.getElementById('copyTopic').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(topicObjectText()); setStatus('Запись скопирована'); }
      catch (_) { codeBox.select(); document.execCommand('copy'); setStatus('Запись скопирована'); }
    });

    document.getElementById('copyContent').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(exportLectureContent()); setStatus('HTML содержимого скопирован'); }
      catch (_) { setStatus('Не удалось скопировать'); }
    });

    document.getElementById('newLecture').addEventListener('click', newLecture);

    // Local drafts live only in this browser.
    const draftKey = slug => `studio-draft:${courseName}:${slug || '_new'}`;
    let draftTimer = null;
    function scheduleDraftSave() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        const rec = currentRecord();
        // Do not save blob URLs; replace them with final asset paths in local draft HTML.
        const clone = editable.cloneNode(true);
        clone.querySelectorAll('img[data-export-src]').forEach(img => img.setAttribute('src', img.dataset.exportSrc));
        const data = { title: rec.title, tags: rec.tags, content: clone.innerHTML, updated: Date.now() };
        try { localStorage.setItem(draftKey(rec.slug), JSON.stringify(data)); status.textContent = 'Черновик сохранён в браузере'; } catch (_) {}
      }, 650);
    }
    function loadDraft(slug) {
      try { return JSON.parse(localStorage.getItem(draftKey(slug))); } catch (_) { return null; }
    }

    // ---------------- homepage editor ----------------
    function renderHomeLinksFields() {
      homeLinkFields.innerHTML = homeLinks.map((item, index) => `
        <div class="home-link-row" data-link-index="${index}">
          <div class="home-link-row-top">
            <input class="icon-input" data-role="icon" value="${escapeHtml(item.icon || '')}" aria-label="Иконка">
            <input data-role="label" value="${escapeHtml(item.label || '')}" aria-label="Название">
            <button class="home-link-remove" type="button" aria-label="Удалить карточку">×</button>
          </div>
          <input class="href-input" data-role="href" value="${escapeHtml(item.href || '')}" aria-label="Ссылка">
        </div>`).join('');
      homeLinkFields.querySelectorAll('input').forEach(input => input.addEventListener('input', event => {
        const row = event.target.closest('.home-link-row');
        const i = Number(row.dataset.linkIndex);
        homeLinks[i][event.target.dataset.role] = event.target.value;
        renderHomeLinksPreview();
        scheduleHomeDraftSave();
      }));
      homeLinkFields.querySelectorAll('.home-link-remove').forEach(btn => btn.addEventListener('click', event => {
        const i = Number(event.target.closest('.home-link-row').dataset.linkIndex);
        homeLinks.splice(i, 1);
        renderHomeLinksFields();
        renderHomeLinksPreview();
        scheduleHomeDraftSave();
      }));
    }

    function renderHomeLinksPreview() {
      homeLinksPreview.innerHTML = homeLinks.map(item => `<a class="resource" href="${escapeHtml(item.href || '#')}" onclick="return false"><b>${escapeHtml(item.icon || '↗')}</b><span>${escapeHtml(item.label || 'Новая ссылка')}</span></a>`).join('');
    }

    function renderHomeTitles() {
      homePreviewAboutTitle.textContent = homeAboutTitle.value.trim() || 'О КУРСЕ';
      homePreviewLinksTitle.textContent = homeLinksTitle.value.trim() || 'ПОЛЕЗНЫЕ ССЫЛКИ';
    }
    homeAboutTitle.addEventListener('input', () => { renderHomeTitles(); scheduleHomeDraftSave(); });
    homeLinksTitle.addEventListener('input', () => { renderHomeTitles(); scheduleHomeDraftSave(); });
    homeAboutEditable.addEventListener('input', scheduleHomeDraftSave);

    document.querySelectorAll('[data-home-format]').forEach(button => button.addEventListener('click', () => {
      homeAboutEditable.focus();
      const cmd = button.dataset.homeFormat;
      if (cmd === 'p') document.execCommand('formatBlock', false, 'p');
      else if (cmd === 'ul') document.execCommand('insertUnorderedList');
      else if (cmd === 'ol') document.execCommand('insertOrderedList');
      else document.execCommand(cmd, false, null);
    }));

    document.getElementById('homeAddLink').addEventListener('click', () => {
      const url = prompt('URL ссылки:');
      if (!url) return;
      homeAboutEditable.focus();
      const sel = getSelection();
      if (sel && !sel.isCollapsed && homeAboutEditable.contains(sel.anchorNode)) document.execCommand('createLink', false, url);
      else {
        const label = prompt('Текст ссылки:', 'Ссылка') || 'Ссылка';
        insertAtCaret(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`, homeAboutEditable);
      }
    });

    document.getElementById('homeAddCard').addEventListener('click', () => {
      homeLinks.push({ icon: '↗', label: 'Новая ссылка', href: '#' });
      renderHomeLinksFields(); renderHomeLinksPreview(); scheduleHomeDraftSave();
    });

    const homeDraftKey = `studio-home-draft:${courseName}`;
    function scheduleHomeDraftSave() {
      clearTimeout(homeDraftTimer);
      homeDraftTimer = setTimeout(() => {
        try {
          localStorage.setItem(homeDraftKey, JSON.stringify({
            aboutTitle: homeAboutTitle.value,
            aboutHtml: homeAboutEditable.innerHTML,
            linksTitle: homeLinksTitle.value,
            links: homeLinks,
            updated: Date.now()
          }));
          status.textContent = 'Черновик главной сохранён';
        } catch (_) {}
      }, 650);
    }
    function loadHomeDraft() {
      try { return JSON.parse(localStorage.getItem(homeDraftKey)); } catch (_) { return null; }
    }

    async function loadPublishedHome() {
      try {
        const response = await fetch(`../index.html?studio=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('not found');
        publishedHomeSource = await response.text();
        const doc = new DOMParser().parseFromString(publishedHomeSource, 'text/html');
        const about = doc.querySelector('#about');
        const links = doc.querySelector('#links');
        homeAboutTitle.value = about?.querySelector('.section-title h2')?.textContent?.trim() || 'О КУРСЕ';
        homeAboutEditable.innerHTML = about?.querySelector('.prose')?.innerHTML?.trim() || '<p>Описание курса.</p>';
        homeLinksTitle.value = links?.querySelector('.section-title h2')?.textContent?.trim() || 'ПОЛЕЗНЫЕ ССЫЛКИ';
        homeLinks = [...(links?.querySelectorAll('.resource') || [])].map(a => ({
          icon: a.querySelector('b')?.textContent?.trim() || '↗',
          label: a.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim() || 'Ссылка',
          href: a.getAttribute('href') || '#'
        }));
        if (!homeLinks.length) homeLinks = [{ icon: '↗', label: 'Ссылка', href: '#' }];
        renderHomeTitles(); renderHomeLinksFields(); renderHomeLinksPreview();
        homeLoaded = true;
        setStatus('Главная страница загружена');
      } catch (error) {
        setStatus('Не удалось загрузить главную страницу');
      }
    }

    document.getElementById('loadHomePublished').addEventListener('click', loadPublishedHome);

    function buildHomeHtml() {
      if (!publishedHomeSource) return '';
      const doc = new DOMParser().parseFromString(publishedHomeSource, 'text/html');
      const about = doc.querySelector('#about');
      const links = doc.querySelector('#links');
      if (about) {
        const h2 = about.querySelector('.section-title h2'); if (h2) h2.textContent = homeAboutTitle.value.trim() || 'О КУРСЕ';
        const prose = about.querySelector('.prose'); if (prose) prose.innerHTML = homeAboutEditable.innerHTML.trim();
      }
      if (links) {
        const h2 = links.querySelector('.section-title h2'); if (h2) h2.textContent = homeLinksTitle.value.trim() || 'ПОЛЕЗНЫЕ ССЫЛКИ';
        const track = links.querySelector('.link-track');
        if (track) track.innerHTML = homeLinks.map(item => `<a class="resource" href="${escapeHtml(item.href || '#')}"><b>${escapeHtml(item.icon || '↗')}</b><span>${escapeHtml(item.label || 'Ссылка')}</span></a>`).join('');
      }
      return '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
    }

    document.getElementById('downloadHome').addEventListener('click', async () => {
      if (!publishedHomeSource) await loadPublishedHome();
      const html = buildHomeHtml();
      if (!html) return setStatus('Не удалось подготовить index.html');
      download('index.html', html);
      setStatus('index.html скачан');
    });


    document.getElementById('publishHome')?.addEventListener('click', async () => {
      try {
        if (!publishedHomeSource) await loadPublishedHome();
        const html = buildHomeHtml();
        if (!html) return setStatus('Не удалось подготовить index.html');
        setStatus('Публикую главную…');
        await githubPublishText('index.html', html, `Обновить главную · ${courseName}`);
        publishedHomeSource = html;
        setStatus('✓ Главная опубликована на GitHub');
      } catch (error) { setStatus(`GitHub: ${error.message}`); }
    });

    document.getElementById('copyHomeAbout').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(homeAboutEditable.innerHTML.trim()); setStatus('HTML «О курсе» скопирован'); }
      catch (_) { setStatus('Не удалось скопировать'); }
    });


    // ---------------- resource-page editor ----------------
    const resourceDraftKey = path => `studio-resource-draft:${courseName}:${path || 'resource'}`;

    function resourceRelativeFetchPath(path) {
      return '../' + path.replace(/^\/+/, '');
    }

    function scheduleResourceDraftSave() {
      clearTimeout(resourceDraftTimer);
      resourceDraftTimer = setTimeout(() => {
        const path = resourcePath.value.trim();
        if (!path) return;
        try {
          localStorage.setItem(resourceDraftKey(path), JSON.stringify({ title:resourceTitle.value, html:resourceEditable.innerHTML, updated:Date.now() }));
          status.textContent = 'Черновик страницы сохранён';
        } catch (_) {}
      }, 650);
    }

    resourceSelect?.addEventListener('change', () => {
      resourcePath.value = resourceSelect.value;
      loadPublishedResource();
    });
    resourcePath?.addEventListener('change', () => { resourceLoadedPath = ''; });
    resourceTitle?.addEventListener('input', () => { resourcePreviewTitle.textContent = resourceTitle.value.trim() || 'Страница'; scheduleResourceDraftSave(); });
    resourceEditable?.addEventListener('input', scheduleResourceDraftSave);
    resourceEditable?.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });

    async function loadPublishedResource() {
      const path = resourcePath.value.trim() || resourceSelect.value;
      if (!path) return setStatus('Укажите путь страницы');
      try {
        const response = await fetch(`${resourceRelativeFetchPath(path)}?studio=${Date.now()}`, { cache:'no-store' });
        if (!response.ok) throw new Error('not found');
        publishedResourceSource = await response.text();
        const doc = new DOMParser().parseFromString(publishedResourceSource, 'text/html');
        const article = doc.querySelector('.resource-article');
        if (!article) throw new Error('article missing');
        const h1 = article.querySelector('h1');
        resourceTitle.value = h1?.textContent?.trim() || 'Страница';
        resourcePreviewTitle.textContent = resourceTitle.value;
        const bodyNodes = [];
        let afterTitle = false;
        [...article.children].forEach(node => {
          if (node === h1) { afterTitle = true; return; }
          if (afterTitle) bodyNodes.push(node.outerHTML);
        });
        resourceEditable.innerHTML = bodyNodes.join('\n') || '<p>Начните писать…</p>';
        resourceLoadedPath = path;
        setStatus('Страница загружена');
      } catch (error) { setStatus('Не удалось загрузить страницу'); }
    }
    document.getElementById('loadResourcePublished')?.addEventListener('click', loadPublishedResource);

    document.querySelectorAll('[data-resource-format]').forEach(button => button.addEventListener('click', () => {
      resourceEditable.focus();
      const cmd = button.dataset.resourceFormat;
      if (cmd === 'h2') document.execCommand('formatBlock', false, 'h2');
      else if (cmd === 'p') document.execCommand('formatBlock', false, 'p');
      else if (cmd === 'blockquote') document.execCommand('formatBlock', false, 'blockquote');
      else if (cmd === 'ul') document.execCommand('insertUnorderedList');
      else if (cmd === 'ol') document.execCommand('insertOrderedList');
      else document.execCommand(cmd, false, null);
      resourceEditable.dispatchEvent(new Event('input'));
    }));

    document.getElementById('resourceEditLink')?.addEventListener('click', () => {
      resourceEditable.focus();
      const sel = getSelection();
      let anchor = null;
      if (sel?.anchorNode) anchor = (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest?.('a');
      if (anchor && resourceEditable.contains(anchor)) {
        const url = prompt('Адрес ссылки:', anchor.getAttribute('href') || '');
        if (url !== null) anchor.setAttribute('href', url || '#');
      } else {
        const url = prompt('Адрес ссылки:');
        if (!url) return;
        if (sel && !sel.isCollapsed && resourceEditable.contains(sel.anchorNode)) document.execCommand('createLink', false, url);
        else {
          const label = prompt('Текст ссылки:', 'Ссылка') || 'Ссылка';
          insertAtCaret(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`, resourceEditable);
        }
      }
      resourceEditable.dispatchEvent(new Event('input'));
    });

    function buildResourceHtml() {
      if (!publishedResourceSource) return '';
      const doc = new DOMParser().parseFromString(publishedResourceSource, 'text/html');
      const article = doc.querySelector('.resource-article');
      if (!article) return '';
      const h1 = article.querySelector('h1');
      if (h1) h1.textContent = resourceTitle.value.trim() || 'Страница';
      let remove = false;
      [...article.children].forEach(node => {
        if (node === h1) { remove = true; return; }
        if (remove) node.remove();
      });
      const tmp = doc.createElement('div');
      tmp.innerHTML = resourceEditable.innerHTML.trim();
      [...tmp.childNodes].forEach(node => article.appendChild(node));
      const title = doc.querySelector('title');
      if (title) title.textContent = `${resourceTitle.value.trim() || 'Страница'} — ${courseName}`;
      const meta = doc.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute('content', `${resourceTitle.value.trim() || 'Страница'} — курс «${courseName}»`);
      return '<!doctype html>\n' + doc.documentElement.outerHTML + '\n';
    }

    document.getElementById('downloadResource')?.addEventListener('click', async () => {
      if (!publishedResourceSource) await loadPublishedResource();
      const html = buildResourceHtml();
      if (!html) return setStatus('Не удалось подготовить страницу');
      download((resourcePath.value.trim().split('/').pop() || 'resource.html'), html);
      setStatus('HTML страницы скачан');
    });

    document.getElementById('publishResource')?.addEventListener('click', async () => {
      try {
        if (!publishedResourceSource) await loadPublishedResource();
        const path = resourcePath.value.trim();
        const html = buildResourceHtml();
        if (!path || !html) return setStatus('Не удалось подготовить страницу');
        setStatus('Публикую страницу…');
        await githubPublishText(path, html, `Обновить страницу: ${resourceTitle.value.trim() || path}`);
        publishedResourceSource = html;
        resourceLoadedPath = path;
        setStatus('✓ Страница опубликована на GitHub');
      } catch (error) { setStatus(`GitHub: ${error.message}`); }
    });

    renderTopicSelect();
    newLecture();
    renderHomeTitles();
  }
})();
