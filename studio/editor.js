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

  let initialized = false;
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

    const homeAboutTitle = document.getElementById('homeAboutTitle');
    const homeLinksTitle = document.getElementById('homeLinksTitle');
    const homeAboutEditable = document.getElementById('homeAboutEditable');
    const homePreviewAboutTitle = document.getElementById('homePreviewAboutTitle');
    const homePreviewLinksTitle = document.getElementById('homePreviewLinksTitle');
    const homeLinkFields = document.getElementById('homeLinkFields');
    const homeLinksPreview = document.getElementById('homeLinksPreview');

    let activeMode = 'lecture';
    let publishedHomeSource = '';
    let homeLoaded = false;
    let homeLinks = [];
    const assetFiles = new Map();
    const assetUrls = new Map();

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

    function switchMode(mode) {
      activeMode = mode;
      document.querySelectorAll('[data-editor-mode]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.editorMode === mode));
      lectureControls.hidden = mode !== 'lecture';
      homeControls.hidden = mode !== 'home';
      lecturePreview.hidden = mode !== 'lecture';
      homePreview.hidden = mode !== 'home';
      if (mode === 'home' && !homeLoaded) loadPublishedHome();
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

    function toEmbedUrl(value) {
      try {
        const u = new URL(value);
        if (u.hostname.includes('youtu.be')) return `https://www.youtube-nocookie.com/embed/${u.pathname.replace('/', '')}`;
        if (u.hostname.includes('youtube.com')) {
          if (u.pathname.startsWith('/embed/')) return value;
          if (u.pathname.startsWith('/shorts/')) return `https://www.youtube-nocookie.com/embed/${u.pathname.split('/')[2]}`;
          const id = u.searchParams.get('v');
          if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
        }
      } catch (_) {}
      return value;
    }

    document.getElementById('addVideo').addEventListener('click', () => {
      const src = prompt('YouTube-ссылка или embed URL Rutube / VK Video:');
      if (!src) return;
      const title = prompt('Название видео:', 'Видео') || 'Видео';
      const embed = toEmbedUrl(src);
      insertAtCaret(`<figure class="embedded-media"><div class="video-frame"><iframe src="${escapeHtml(embed)}" title="${escapeHtml(title)}" loading="lazy" allowfullscreen></iframe></div></figure><p><br></p>`);
      editable.dispatchEvent(new Event('input'));
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
      }));
      homeLinkFields.querySelectorAll('.home-link-remove').forEach(btn => btn.addEventListener('click', event => {
        const i = Number(event.target.closest('.home-link-row').dataset.linkIndex);
        homeLinks.splice(i, 1);
        renderHomeLinksFields();
        renderHomeLinksPreview();
      }));
    }

    function renderHomeLinksPreview() {
      homeLinksPreview.innerHTML = homeLinks.map(item => `<a class="resource" href="${escapeHtml(item.href || '#')}" onclick="return false"><b>${escapeHtml(item.icon || '↗')}</b><span>${escapeHtml(item.label || 'Новая ссылка')}</span></a>`).join('');
    }

    function renderHomeTitles() {
      homePreviewAboutTitle.textContent = homeAboutTitle.value.trim() || 'О КУРСЕ';
      homePreviewLinksTitle.textContent = homeLinksTitle.value.trim() || 'ПОЛЕЗНЫЕ ССЫЛКИ';
    }
    homeAboutTitle.addEventListener('input', renderHomeTitles);
    homeLinksTitle.addEventListener('input', renderHomeTitles);

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
      renderHomeLinksFields(); renderHomeLinksPreview();
    });

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

    document.getElementById('copyHomeAbout').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(homeAboutEditable.innerHTML.trim()); setStatus('HTML «О курсе» скопирован'); }
      catch (_) { setStatus('Не удалось скопировать'); }
    });

    renderTopicSelect();
    newLecture();
    renderHomeTitles();
  }
})();
