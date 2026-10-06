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
    const thumbnailDraftKey = `studio-topic-thumbnails:${courseName}`;
    let thumbnailDrafts = {};
    try { thumbnailDrafts = JSON.parse(localStorage.getItem(thumbnailDraftKey) || '{}'); } catch (_) {}
    let editorTopics = baseTopics.map(t => ({ ...t, tags: Array.isArray(t.tags) ? [...t.tags] : [], ...(Object.hasOwn(thumbnailDrafts, t.slug) ? { thumbnail:thumbnailDrafts[t.slug] } : {}) }));
    let currentThumbnail = '';

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
    const resourceCardFields = document.getElementById('resourceCardFields');
    const resourceAddCard = document.getElementById('resourceAddCard');
    const resourceRefreshCards = document.getElementById('resourceRefreshCards');

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
    let resourceCards = [];
    let resourceGridClasses = 'resource-card-grid';
    let homeDraftTimer = null;

    const escapeHtml = (s) => String(s ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const tagClass = t => t === 'Актуально' ? 'actual'
      : t === 'Теория' ? 'theory'
      : t === 'Практика' ? 'practice'
      : t === 'Софт' ? 'soft'
      : t === 'Д/з' ? 'home'
      : (t === 'Курсовая работа' || t === 'Зачёт') ? 'coursework'
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
      selectMediaBlock(null);
      document.querySelectorAll('[data-editor-mode]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.editorMode === mode));
      lectureControls.hidden = mode !== 'lecture';
      homeControls.hidden = mode !== 'home';
      resourceControls.hidden = mode !== 'resource';
      lecturePreview.hidden = mode !== 'lecture';
      homePreview.hidden = mode !== 'home';
      resourcePreview.hidden = mode !== 'resource';
      if (mode === 'home' && !homeLoaded) loadPublishedHome(true);
      if (mode === 'resource' && !resourceLoadedPath) loadPublishedResource(true);
    }
    document.querySelectorAll('[data-editor-mode]').forEach(button => button.addEventListener('click', () => switchMode(button.dataset.editorMode)));

    function renderTopicSelect(selected = '') {
      topicSelect.innerHTML = '<option value="">+ Новая лекция</option>' + editorTopics.map((t, i) =>
        `<option value="${escapeHtml(t.slug)}">${String(i + 1).padStart(2, '0')} — ${escapeHtml(t.title)}</option>`
      ).join('');
      topicSelect.value = selected;
    }

    function currentRecord() {
      const slug = slugInput.value.trim();
      const record = { ...editorTopics.find(topic => topic.slug === slug), slug, title:titleInput.value.trim(), tags:parseTags() };
      if (currentThumbnail) record.thumbnail = currentThumbnail;
      else delete record.thumbnail;
      return record;
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
      renderThumbnail();
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
      currentThumbnail = '';
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
      currentThumbnail = topic.thumbnail || '';
      const draft = loadDraft(topic.slug);
      if (draft?.content) {
        editable.innerHTML = draft.content;
        if (draft.title) titleInput.value = draft.title;
        if (Array.isArray(draft.tags)) tagsInput.value = draft.tags.join(', ');
        if (typeof draft.thumbnail === 'string') currentThumbnail = draft.thumbnail;
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

    window.normaliseCourseVideo = normaliseVideoEmbed;
    const rich = window.createCourseEditor({
      roots: { lecture: editable, home: homeAboutEditable, resource: resourceEditable },
      controls: { lecture: lectureControls, home: homeControls, resource: resourceControls },
      getMode: () => activeMode, setStatus, courseName
    });
    const thumbnailPreview = document.getElementById('topicThumbnailPreview');
    const thumbnailInput = document.getElementById('topicThumbnailFile');
    async function renderThumbnail() {
      const path = currentThumbnail;
      document.getElementById('removeTopicThumbnail').disabled = !path;
      if (!path) { thumbnailPreview.innerHTML = '<span>Стандартное превью</span>'; return; }
      const url = await rich.assetPreviewUrl(path);
      if (path !== currentThumbnail) return;
      thumbnailPreview.innerHTML = `<img src="${escapeHtml(url)}" alt="Превью темы: ${escapeHtml(titleInput.value)}">`;
    }
    function rememberThumbnail(record) {
      thumbnailDrafts[record.slug] = record.thumbnail || '';
      try { localStorage.setItem(thumbnailDraftKey, JSON.stringify(thumbnailDrafts)); } catch (_) { setStatus('Не удалось сохранить черновик превью. Скачайте ZIP.'); }
      const index = editorTopics.findIndex(topic => topic.slug === record.slug);
      if (index >= 0) editorTopics[index] = record; else editorTopics.push(record);
      renderTopicSelect(slugInput.value.trim());
    }
    document.getElementById('chooseTopicThumbnail').addEventListener('click', () => {
      if (!slugInput.value.trim() || !titleInput.value.trim()) return setStatus('Выберите тему или задайте имя файла и название новой темы');
      thumbnailInput.click();
    });
    thumbnailInput.addEventListener('change', async () => {
      const file = thumbnailInput.files?.[0]; if (!file) return;
      const record = currentRecord();
      try {
        const item = await rich.addThumbnail(file);
        record.thumbnail = item.path; rememberThumbnail(record);
        if (record.slug === slugInput.value.trim()) { currentThumbnail = item.path; renderMeta(); }
        setStatus('Превью загружено отдельно от текста лекции');
      } catch (error) { setStatus(error.message); }
      finally { thumbnailInput.value = ''; }
    });
    document.getElementById('removeTopicThumbnail').addEventListener('click', () => {
      currentThumbnail = ''; const record = currentRecord(); rememberThumbnail(record); renderMeta(); setStatus('Восстановлено стандартное превью');
    });
    async function thumbnailAssets() { return rich.assetsForPaths(editorTopics.map(topic => topic.thumbnail)); }
    async function publishThumbnailAssets() {
      for (const [path, file] of await thumbnailAssets()) await githubPublishBytes(path, new Uint8Array(await file.arrayBuffer()), 'Добавить превью: ' + path);
    }
    document.getElementById('publishTopicThumbnail').addEventListener('click', async () => {
      try {
        upsertCurrentTopic(); setStatus('Публикую превью…');
        await publishThumbnailAssets();
        await githubPublishText('topics.js', topicsJsText(), 'Обновить превью тем · ' + courseName);
        setStatus('✓ Превью опубликованы; текст лекций не изменён');
      } catch (error) { setStatus('GitHub: ' + error.message); }
    });
    document.getElementById('downloadThumbnailPackage').addEventListener('click', async () => {
      try {
        upsertCurrentTopic();
        const entries = [{ name:'topics.js', data:new Blob([topicsJsText()]) }];
        for (const [path,file] of await thumbnailAssets()) entries.push({ name:path, data:file });
        download('topic-thumbnails.zip', await makeZip(entries), 'application/zip'); setStatus('ZIP превью и topics.js скачан');
      } catch (error) { setStatus(error.message); }
    });
    // Assets stay available across page switches and are stored in IndexedDB.
    function clearAssets() {}
    function selectMediaBlock(figure) { rich.selectMedia(figure); }
    async function publishAssets(root) {
      for (const [path, file] of await rich.usedAssets(root)) {
        await githubPublishBytes(path, new Uint8Array(await file.arrayBuffer()), 'Добавить медиа: ' + path);
      }
    }
    async function downloadPagePackage(root, pagePath, html) {
      const entries = [{ name: pagePath, data: new Blob([html]) }];
      for (const [path, file] of await rich.usedAssets(root)) entries.push({ name: path, data: file });
      const settings = await fetch('../site-settings.js').then(r => r.text());
      entries.push({ name:'site-settings.js', data:new Blob([settings]) });
      download(pagePath.split('/').pop().replace('.html','') + '-package.zip', await makeZip(entries), 'application/zip');
      setStatus('ZIP страницы и медиа скачан');
    }

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

    function exportLectureContent() { return rich.exportContent(editable); }

    function lectureHtml() {
      const record = currentRecord();
      const safeSlug = escapeHtml(record.slug);
      const safeTitle = escapeHtml(record.title || 'Лекция');
      const content = exportLectureContent();
      return `<!doctype html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <meta name="description" content="Лекция курса «${escapeHtml(courseName)}»">\n  <title>${safeTitle} — ${escapeHtml(courseName)}</title>\n  <link rel="stylesheet" href="../styles.css?v=20">\n</head>\n<body class="lecture-page" data-topic="${safeSlug}">\n<header class="lecture-topbar">\n  <nav aria-label="Главная навигация">\n    <a href="../index.html">Главная</a>\n    <a href="../index.html#about">О курсе</a>\n    <a href="../index.html#links">Ссылки</a>\n    <a class="active" href="../index.html#topics">Темы</a>\n  </nav>\n</header>\n<button class="topics-toggle" type="button" aria-expanded="false"><strong>Темы курса</strong><span>Темы · открыть</span></button>\n<div class="lecture-shell">\n  <aside class="lecture-sidebar" aria-label="Темы курса">\n    <div class="sidebar-head"><span>ТЕМЫ КУРСА</span><button class="sidebar-close" type="button" aria-label="Закрыть список тем">×</button></div>\n    <div id="lectureTopics" class="lecture-topic-list"></div>\n  </aside>\n  <main class="lecture-main">\n    <article class="lecture-article">\n      <div class="lecture-kicker">ТЕМА</div>\n      <h1>${safeTitle}</h1>\n      <div class="tags"></div>\n${content.split('\n').map(line => '      ' + line).join('\n')}\n      <nav class="lecture-pagination" aria-label="Навигация по лекциям">\n        <a id="prevLecture" href="#">← <span>Предыдущая тема</span></a>\n        <a id="nextLecture" href="#"><span>Следующая тема</span> →</a>\n      </nav>\n    </article>\n  </main>\n</div>\n<div class="sidebar-backdrop" aria-hidden="true"></div>\n<script src="../topics.js?v=20"></script>\n<script src="../lecture.js"></script>\n<script src="../site-settings.js?v=20"></script>\n<script src="../course-design.js?v=20"></script>\n</body>\n</html>\n`;
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
      if (slugInput.value.trim() && titleInput.value.trim()) upsertCurrentTopic();
      download('topics.js', topicsJsText(), 'text/javascript;charset=utf-8');
      setStatus('topics.js скачан');
    });

    document.getElementById('downloadPackage').addEventListener('click', async () => {
      const slug = slugInput.value.trim();
      if (!slug) return setStatus('Укажите slug');
      if (titleInput.value.trim()) upsertCurrentTopic();
      const entries = [
        { name: `lectures/${slug}.html`, data: new Blob([lectureHtml()], { type: 'text/html;charset=utf-8' }) },
        { name: 'topics.js', data: new Blob([topicsJsText()], { type: 'text/javascript;charset=utf-8' }) },
        { name: 'README_UPLOAD.txt', data: new Blob(['Загрузите lectures/*.html в папку lectures, topics.js в корень репозитория, а папку assets — в assets (изображения, GIF и видео).\n'], { type: 'text/plain;charset=utf-8' }) }
      ];
      for (const [path, file] of await rich.usedAssets(editable)) entries.push({ name: path, data: file });
      for (const [path, file] of await thumbnailAssets()) if (!entries.some(entry => entry.name === path)) entries.push({ name:path, data:file });
      const zip = await makeZip(entries);
      download(`${slug}-package.zip`, zip, 'application/zip');
      setStatus('Пакет лекции и медиа скачан');
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
        await publishAssets(editable);
        await publishThumbnailAssets();
        await githubPublishText(`lectures/${record.slug}.html`, lectureHtml(), `Обновить лекцию: ${record.title}`);
        await githubPublishText('topics.js', topicsJsText(), `Обновить список тем · ${courseName}`);
        setStatus('✓ Лекция и медиа опубликованы');
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
        const data = { title: rec.title, tags: rec.tags, thumbnail:currentThumbnail, content: rich.exportContent(editable, { draft:true }), updated: Date.now() };
        try { localStorage.setItem(`studio-last-lecture:${courseName}`, JSON.stringify(rec)); } catch (_) {}
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
          <div class="card-text-controls home-card-text-controls">
            <label>Название · размер <select data-role="fontSize"><option value="14" ${Number(item.fontSize||16)===14?'selected':''}>14 px</option><option value="16" ${Number(item.fontSize||16)===16?'selected':''}>16 px</option><option value="18" ${Number(item.fontSize||16)===18?'selected':''}>18 px</option><option value="20" ${Number(item.fontSize||16)===20?'selected':''}>20 px</option><option value="24" ${Number(item.fontSize||16)===24?'selected':''}>24 px</option></select></label>
            <label>Выравнивание <select data-role="textAlign"><option value="left" ${(!item.textAlign||item.textAlign==='left')?'selected':''}>Слева</option><option value="center" ${item.textAlign==='center'?'selected':''}>По центру</option><option value="right" ${item.textAlign==='right'?'selected':''}>Справа</option></select></label>
          </div>
        </div>`).join('');
      homeLinkFields.querySelectorAll('input,select').forEach(input => {
        const updateHomeCard = event => {
        const row = event.target.closest('.home-link-row');
        const i = Number(row.dataset.linkIndex);
        const role = event.target.dataset.role;
        homeLinks[i][role] = role === 'fontSize' ? Number(event.target.value) : event.target.value;
        renderHomeLinksPreview();
        scheduleHomeDraftSave();
        };
        input.addEventListener('input', updateHomeCard);
        input.addEventListener('change', updateHomeCard);
      });
      homeLinkFields.querySelectorAll('.home-link-remove').forEach(btn => btn.addEventListener('click', event => {
        const i = Number(event.target.closest('.home-link-row').dataset.linkIndex);
        homeLinks.splice(i, 1);
        renderHomeLinksFields();
        renderHomeLinksPreview();
        scheduleHomeDraftSave();
      }));
    }

    function renderHomeLinksPreview() {
      homeLinksPreview.innerHTML = homeLinks.map(item => {
        const fontSize = [14,16,18,20,24].includes(Number(item.fontSize)) ? Number(item.fontSize) : 16;
        const textAlign = ['left','center','right'].includes(item.textAlign) ? item.textAlign : 'left';
        return `<a class="resource" href="${escapeHtml(item.href || '#')}" onclick="return false"><b>${escapeHtml(item.icon || '↗')}</b><span style="font-size:${fontSize}px;text-align:${textAlign};justify-content:${textAlign === 'right' ? 'flex-end' : textAlign === 'center' ? 'center' : 'flex-start'}">${escapeHtml(item.label || 'Новая ссылка')}</span></a>`;
      }).join('');
    }

    function renderHomeTitles() {
      homePreviewAboutTitle.textContent = homeAboutTitle.value.trim() || 'О КУРСЕ';
      homePreviewLinksTitle.textContent = homeLinksTitle.value.trim() || 'ПОЛЕЗНЫЕ ССЫЛКИ';
    }
    homeAboutTitle.addEventListener('input', () => { renderHomeTitles(); scheduleHomeDraftSave(); });
    homeLinksTitle.addEventListener('input', () => { renderHomeTitles(); scheduleHomeDraftSave(); });
    homeAboutEditable.addEventListener('input', scheduleHomeDraftSave);

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
            aboutHtml: rich.exportContent(homeAboutEditable, { draft:true }),
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

    async function loadPublishedHome(restoreDraft = false) {
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
        const draft = restoreDraft === true ? loadHomeDraft() : null;
        if (draft) {
          homeAboutTitle.value = draft.aboutTitle || homeAboutTitle.value;
          homeAboutEditable.innerHTML = draft.aboutHtml || homeAboutEditable.innerHTML;
          homeLinksTitle.value = draft.linksTitle || homeLinksTitle.value;
          homeLinks = draft.links || homeLinks;
        }
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
        const prose = about.querySelector('.prose'); if (prose) prose.innerHTML = rich.exportContent(homeAboutEditable);
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
        await publishAssets(homeAboutEditable);
        await githubPublishText('index.html', html, `Обновить главную · ${courseName}`);
        publishedHomeSource = html;
        setStatus('✓ Главная опубликована на GitHub');
      } catch (error) { setStatus(`GitHub: ${error.message}`); }
    });

    document.getElementById('copyHomeAbout').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(rich.exportContent(homeAboutEditable)); setStatus('HTML «О курсе» скопирован'); }
      catch (_) { setStatus('Не удалось скопировать'); }
    });


    // ---------------- structured cards / menus ----------------
    function resourceCardGrid() {
      return resourceEditable?.querySelector('.resource-card-grid') || null;
    }

    function readResourceCardsFromPreview() {
      const grid = resourceCardGrid();
      if (!grid) {
        resourceCards = [];
        resourceGridClasses = 'resource-card-grid';
        renderResourceCardFields();
        return;
      }
      resourceGridClasses = grid.className || 'resource-card-grid';
      resourceCards = [...grid.children]
        .filter(el => el.classList?.contains('resource-detail-card'))
        .map(el => ({
          title: el.querySelector('strong')?.textContent?.trim() || 'Новая карточка',
          description: el.querySelector('span')?.textContent?.trim() || '',
          titleHtml: el.querySelector('strong')?.innerHTML || '',
          descriptionHtml: el.querySelector('span')?.innerHTML || '',
          titleSize: Number.parseInt(el.querySelector('strong')?.style.fontSize, 10) || 16,
          titleAlign: ['left','center','right'].includes(el.querySelector('strong')?.style.textAlign) ? el.querySelector('strong').style.textAlign : 'left',
          descriptionSize: Number.parseInt(el.querySelector('span')?.style.fontSize, 10) || 14,
          descriptionAlign: ['left','center','right'].includes(el.querySelector('span')?.style.textAlign) ? el.querySelector('span').style.textAlign : 'left',
          href: el.tagName === 'A' ? (el.getAttribute('href') || '') : '',
          newTab: el.tagName === 'A' && el.getAttribute('target') === '_blank',
          extraClasses: [...el.classList].filter(c => !['resource-detail-card','external-card','internal-card'].includes(c))
        }));
      renderResourceCardFields();
    }

    function cardMarkup(card) {
      const href = String(card.href || '').trim();
      const extras = Array.isArray(card.extraClasses) ? card.extraClasses.filter(Boolean) : [];
      const isExternal = /^(https?:)?\/\//i.test(href) || /^(mailto:|tel:)/i.test(href);
      const classes = ['resource-detail-card', ...(href ? [isExternal ? 'external-card' : 'internal-card'] : []), ...extras]
        .filter((v, i, a) => a.indexOf(v) === i).join(' ');
      const titleSize = [14,16,18,20,24,28,32].includes(Number(card.titleSize)) ? Number(card.titleSize) : 16;
      const descriptionSize = [12,14,16,18,20,24].includes(Number(card.descriptionSize)) ? Number(card.descriptionSize) : 14;
      const titleAlign = ['left','center','right'].includes(card.titleAlign) ? card.titleAlign : 'left';
      const descriptionAlign = ['left','center','right'].includes(card.descriptionAlign) ? card.descriptionAlign : 'left';
      const inner = `<strong style="font-size:${titleSize}px;text-align:${titleAlign}">${card.titleHtml || escapeHtml(card.title || 'Новая карточка')}</strong><span style="font-size:${descriptionSize}px;text-align:${descriptionAlign}">${card.descriptionHtml || escapeHtml(card.description || '')}</span>`;
      if (!href) return `<div class="${escapeHtml(classes)}">${inner}</div>`;
      const target = card.newTab || isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a class="${escapeHtml(classes)}" href="${escapeHtml(href)}"${target}>${inner}</a>`;
    }

    function syncResourceCardsToPreview() {
      if (!resourceEditable) return;
      let grid = resourceCardGrid();
      if (!grid) {
        grid = document.createElement('div');
        grid.className = resourceGridClasses || 'resource-card-grid';
        resourceEditable.appendChild(grid);
      }
      grid.className = resourceGridClasses || 'resource-card-grid';
      grid.innerHTML = resourceCards.map(cardMarkup).join('');
      resourceEditable.dispatchEvent(new Event('input'));
    }

    function renderResourceCardFields() {
      if (!resourceCardFields) return;
      if (!resourceCards.length) {
        resourceCardFields.innerHTML = '<div class="resource-card-empty">На этой странице пока нет карточек. Нажмите «+ Добавить карточку», чтобы создать блок.</div>';
        return;
      }
      resourceCardFields.innerHTML = resourceCards.map((card, i) => `
        <div class="resource-card-edit-row" data-card-index="${i}">
          <div class="resource-card-edit-top">
            <input data-card-field="title" value="${escapeHtml(card.title || '')}" placeholder="Название карточки">
            <button class="resource-card-remove" type="button" title="Удалить карточку" aria-label="Удалить карточку">×</button>
          </div>
          <div class="card-text-controls">
            <label>Название · размер <select data-card-setting="titleSize"><option value="16" ${Number(card.titleSize || 16)===16?'selected':''}>16 px</option><option value="18" ${Number(card.titleSize || 16)===18?'selected':''}>18 px</option><option value="20" ${Number(card.titleSize || 16)===20?'selected':''}>20 px</option><option value="24" ${Number(card.titleSize || 16)===24?'selected':''}>24 px</option><option value="28" ${Number(card.titleSize || 16)===28?'selected':''}>28 px</option></select></label>
            <label>Название · выравнивание <select data-card-setting="titleAlign"><option value="left" ${(!card.titleAlign||card.titleAlign==='left')?'selected':''}>Слева</option><option value="center" ${card.titleAlign==='center'?'selected':''}>По центру</option><option value="right" ${card.titleAlign==='right'?'selected':''}>Справа</option></select></label>
          </div>
          <textarea data-card-field="description" placeholder="Описание">${escapeHtml(card.description || '')}</textarea>
          <div class="card-text-controls">
            <label>Описание · размер <select data-card-setting="descriptionSize"><option value="12" ${Number(card.descriptionSize || 14)===12?'selected':''}>12 px</option><option value="14" ${Number(card.descriptionSize || 14)===14?'selected':''}>14 px</option><option value="16" ${Number(card.descriptionSize || 14)===16?'selected':''}>16 px</option><option value="18" ${Number(card.descriptionSize || 14)===18?'selected':''}>18 px</option><option value="20" ${Number(card.descriptionSize || 14)===20?'selected':''}>20 px</option></select></label>
            <label>Описание · выравнивание <select data-card-setting="descriptionAlign"><option value="left" ${(!card.descriptionAlign||card.descriptionAlign==='left')?'selected':''}>Слева</option><option value="center" ${card.descriptionAlign==='center'?'selected':''}>По центру</option><option value="right" ${card.descriptionAlign==='right'?'selected':''}>Справа</option></select></label>
          </div>
          <input class="resource-card-href" data-card-field="href" value="${escapeHtml(card.href || '')}" placeholder="Ссылка, например https://... или requirements.html">
          <div class="resource-card-edit-meta">
            <span>Карточка ${i + 1}</span>
            <label><input type="checkbox" data-card-field="newTab" ${card.newTab ? 'checked' : ''}> открыть в новой вкладке</label>
          </div>
        </div>`).join('');
    }

    const updateResourceCard = event => {
      const row = event.target.closest('.resource-card-edit-row');
      if (!row) return;
      const i = Number(row.dataset.cardIndex);
      const card = resourceCards[i];
      if (!card) return;
      // Inline formatting edited in the preview must survive changes in card fields.
      const previewCards = [...(resourceCardGrid()?.children || [])];
      resourceCards.forEach((record, index) => {
        const preview = previewCards[index];
        if (preview) { record.titleHtml = preview.querySelector('strong')?.innerHTML || ''; record.descriptionHtml = preview.querySelector('span')?.innerHTML || ''; }
      });
      const field = event.target.dataset.cardField;
      const setting = event.target.dataset.cardSetting;
      if (field === 'newTab') card.newTab = event.target.checked;
      else if (field) card[field] = event.target.value;
      else if (setting) card[setting] = ['titleSize','descriptionSize'].includes(setting) ? Number(event.target.value) : event.target.value;
      else return;
      if (field === 'title') card.titleHtml = '';
      if (field === 'description') card.descriptionHtml = '';
      syncResourceCardsToPreview();
    };
    resourceCardFields?.addEventListener('input', updateResourceCard);
    resourceCardFields?.addEventListener('change', event => {
      if (event.target.dataset.cardSetting) updateResourceCard(event);
    });
    resourceCardFields?.addEventListener('change', event => {
      if (event.target.dataset.cardField !== 'newTab') return;
      const row = event.target.closest('.resource-card-edit-row');
      const card = resourceCards[Number(row?.dataset.cardIndex)];
      if (!card) return;
      card.newTab = event.target.checked;
      syncResourceCardsToPreview();
    });
    resourceCardFields?.addEventListener('click', event => {
      const remove = event.target.closest('.resource-card-remove');
      if (!remove) return;
      const row = remove.closest('.resource-card-edit-row');
      const i = Number(row?.dataset.cardIndex);
      if (!Number.isInteger(i)) return;
      resourceCards.splice(i, 1);
      renderResourceCardFields();
      syncResourceCardsToPreview();
      setStatus('Карточка удалена');
    });

    resourceAddCard?.addEventListener('click', () => {
      resourceCards.push({ title:'Новая карточка', description:'Описание карточки.', titleSize:16, titleAlign:'left', descriptionSize:14, descriptionAlign:'left', href:'', newTab:false, extraClasses:[] });
      renderResourceCardFields();
      syncResourceCardsToPreview();
      resourceCardFields?.querySelector(`[data-card-index="${resourceCards.length - 1}"] input[data-card-field="title"]`)?.focus();
      setStatus('Карточка добавлена');
    });

    resourceRefreshCards?.addEventListener('click', () => {
      readResourceCardsFromPreview();
      setStatus('Карточки обновлены из предпросмотра');
    });

    function normalizeResourceBlocks(root) {
      if (!root) return;
      [...root.childNodes].forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const value = node.textContent.replace(/\s+/g, ' ').trim();
          if (!value) { node.remove(); return; }
          const p = root.ownerDocument.createElement('p');
          p.textContent = value;
          node.replaceWith(p);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        if (tag === 'div' && !node.className && !node.querySelector('div,figure,pre,p,ul,ol,h2,h3')) {
          const p = root.ownerDocument.createElement('p');
          [...node.attributes].forEach(a => p.setAttribute(a.name, a.value));
          p.innerHTML = node.innerHTML;
          node.replaceWith(p);
        }
      });
    }

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
          localStorage.setItem(resourceDraftKey(path), JSON.stringify({ title:resourceTitle.value, html:rich.exportContent(resourceEditable, { draft:true }), updated:Date.now() }));
          status.textContent = 'Черновик страницы сохранён';
        } catch (_) {}
      }, 650);
    }

    resourceSelect?.addEventListener('change', () => {
      resourcePath.value = resourceSelect.value;
      loadPublishedResource(true);
    });
    resourcePath?.addEventListener('change', () => { resourceLoadedPath = ''; });
    resourceTitle?.addEventListener('input', () => { resourcePreviewTitle.textContent = resourceTitle.value.trim() || 'Страница'; scheduleResourceDraftSave(); });
    resourceEditable?.addEventListener('input', scheduleResourceDraftSave);
    resourceEditable?.addEventListener('blur', () => { normalizeResourceBlocks(resourceEditable); scheduleResourceDraftSave(); });
    resourceEditable?.addEventListener('paste', () => setTimeout(() => { normalizeResourceBlocks(resourceEditable); scheduleResourceDraftSave(); }, 0));
    resourceEditable?.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });

    async function loadPublishedResource(restoreDraft = false) {
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
        if (restoreDraft === true) {
          try {
            const draft = JSON.parse(localStorage.getItem(resourceDraftKey(path)) || 'null');
            if (draft) { resourceEditable.innerHTML = draft.html; resourceTitle.value = draft.title; resourcePreviewTitle.textContent = draft.title; }
          } catch (_) {}
        }
        normalizeResourceBlocks(resourceEditable);
        readResourceCardsFromPreview();
        resourceLoadedPath = path;
        setStatus('Страница загружена');
      } catch (error) { setStatus('Не удалось загрузить страницу'); }
    }
    document.getElementById('loadResourcePublished')?.addEventListener('click', loadPublishedResource);

    function buildResourceHtml() {
      if (!publishedResourceSource) return '';
      const doc = new DOMParser().parseFromString(publishedResourceSource, 'text/html');
      const main = doc.querySelector('.resource-main');
      const oldArticle = doc.querySelector('.resource-article');
      if (!main || !oldArticle) return '';

      // Rebuild the article from scratch. This deliberately removes any stale
      // fragments left by an older Studio version, so the published page is an
      // exact mirror of the current preview instead of accumulating old text.
      const article = doc.createElement('article');
      article.className = 'resource-article';

      const oldKicker = oldArticle.querySelector('.resource-kicker');
      const kicker = doc.createElement('div');
      kicker.className = 'resource-kicker';
      kicker.textContent = oldKicker?.textContent?.trim() || 'ПОЛЕЗНЫЕ ССЫЛКИ';
      article.appendChild(kicker);

      const h1 = doc.createElement('h1');
      h1.textContent = resourceTitle.value.trim() || 'Страница';
      article.appendChild(h1);

      const tmp = doc.createElement('div');
      tmp.innerHTML = rich.exportContent(resourceEditable);
      normalizeResourceBlocks(tmp);
      [...tmp.childNodes].forEach(node => article.appendChild(node));

      // Replace everything inside resource-main, including accidental orphaned
      // nodes that could survive previous publishes.
      main.replaceChildren(article);

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
        await publishAssets(resourceEditable);
        await githubPublishText(path, html, `Обновить страницу: ${resourceTitle.value.trim() || path}`);
        publishedResourceSource = html;
        resourceLoadedPath = path;
        setStatus('✓ Страница опубликована на GitHub');
      } catch (error) { setStatus(`GitHub: ${error.message}`); }
    });

    document.getElementById('downloadHomePackage').addEventListener('click', async () => {
      try { if (!publishedHomeSource) await loadPublishedHome(); await downloadPagePackage(homeAboutEditable, 'index.html', buildHomeHtml()); }
      catch (error) { setStatus(error.message); }
    });
    document.getElementById('downloadResourcePackage').addEventListener('click', async () => {
      try { if (!publishedResourceSource) await loadPublishedResource(); await downloadPagePackage(resourceEditable, resourcePath.value.trim(), buildResourceHtml()); }
      catch (error) { setStatus(error.message); }
    });
    const siteFont = document.getElementById('siteFont');
    siteFont.value = window.COURSE_DESIGN?.font || 'Inter';
    siteFont.addEventListener('change', () => {
      if (window.CourseDesign.validFont(siteFont.value.trim())) window.CourseDesign.applyFont(siteFont.value.trim());
    });
    function siteSettingsText() {
      const font = siteFont.value.trim();
      if (!window.CourseDesign.validFont(font)) throw new Error('Введите название шрифта из Google Fonts.');
      return 'window.COURSE_DESIGN = ' + JSON.stringify({ font }, null, 2) + ';\n';
    }
    document.getElementById('downloadSiteFont').addEventListener('click', () => {
      try { download('site-settings.js', siteSettingsText(), 'text/javascript;charset=utf-8'); } catch (error) { setStatus(error.message); }
    });
    document.getElementById('publishSiteFont').addEventListener('click', async () => {
      try { await githubPublishText('site-settings.js', siteSettingsText(), 'Изменить шрифт сайта'); setStatus('✓ Шрифт всего сайта опубликован'); }
      catch (error) { setStatus('GitHub: ' + error.message); }
    });
    renderTopicSelect();
    newLecture();
    let lastRecord = null;
    try { lastRecord = JSON.parse(localStorage.getItem(`studio-last-lecture:${courseName}`) || 'null'); } catch (_) {}
    const initialDraft = loadDraft(lastRecord?.slug || '');
    if (initialDraft?.content) {
      editable.innerHTML = initialDraft.content; slugInput.value = lastRecord?.slug || ''; slugInput.dataset.touched = '1';
      titleInput.value = initialDraft.title || ''; tagsInput.value = (initialDraft.tags || []).join(', ');
      currentThumbnail = initialDraft.thumbnail ?? lastRecord?.thumbnail ?? '';
      topicSelect.value = lastRecord?.slug || ''; renderMeta();
    }
    renderHomeTitles();
  }
})();
