
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

    function renderTopicSelect(selected = '') {
      topicSelect.innerHTML = '<option value="">+ Новая лекция</option>' + editorTopics.map((t, i) =>
        `<option value="${escapeHtml(t.slug)}">${String(i + 1).padStart(2, '0')} — ${escapeHtml(t.title)}</option>`
      ).join('');
      topicSelect.value = selected;
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

    function currentRecord() {
      return {
        slug: slugInput.value.trim(),
        title: titleInput.value.trim(),
        tags: parseTags(),
      };
    }

    function topicObjectText(record = currentRecord()) {
      return `  {\n    slug: ${JSON.stringify(record.slug)},\n    title: ${JSON.stringify(record.title)},\n    tags: ${JSON.stringify(record.tags)}\n  }`;
    }

    function updateCodeBox() {
      const record = currentRecord();
      codeBox.value = topicObjectText(record);
    }

    function setStatus(message) {
      status.textContent = message;
      clearTimeout(setStatus.timer);
      setStatus.timer = setTimeout(() => { status.textContent = ''; }, 2600);
    }

    function setEditorContent(html) {
      editable.innerHTML = html || '<p class="lead">Краткое вступление к лекции.</p><h2>Первый раздел</h2><p>Начните писать текст лекции…</p>';
      updateCodeBox();
      scheduleDraftSave();
    }

    function newLecture() {
      topicSelect.value = '';
      slugInput.value = '';
      slugInput.dataset.touched = '';
      titleInput.value = '';
      tagsInput.value = '';
      setEditorContent('');
      renderMeta();
    }

    topicSelect.addEventListener('change', () => {
      const topic = editorTopics.find(t => t.slug === topicSelect.value);
      if (!topic) return newLecture();
      slugInput.value = topic.slug;
      slugInput.dataset.touched = '1';
      titleInput.value = topic.title;
      tagsInput.value = topic.tags.join(', ');
      renderMeta();
      const draft = loadDraft(topic.slug);
      if (draft) {
        editable.innerHTML = draft.content;
        titleInput.value = draft.title || topic.title;
        tagsInput.value = Array.isArray(draft.tags) ? draft.tags.join(', ') : topic.tags.join(', ');
        renderMeta();
        setStatus('Загружен локальный черновик');
      }
    });

    document.getElementById('loadPublished').addEventListener('click', async () => {
      const slug = slugInput.value.trim();
      if (!slug) return setStatus('Сначала выберите тему или укажите slug');
      try {
        const response = await fetch(`../lectures/${encodeURIComponent(slug)}.html?v=${Date.now()}`);
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
        renderMeta();
        setStatus('Опубликованная лекция загружена');
      } catch (e) {
        setStatus('Не удалось загрузить страницу');
      }
    });

    // Formatting toolbar.
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

    function insertAtCaret(html) {
      editable.focus();
      const selection = getSelection();
      if (!selection || !selection.rangeCount || !editable.contains(selection.anchorNode)) {
        editable.insertAdjacentHTML('beforeend', html);
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

    document.getElementById('addImage').addEventListener('click', () => {
      const src = prompt('Путь или URL изображения. Для файлов сайта: ../assets/images/имя.webp');
      if (!src) return;
      const alt = prompt('Описание изображения (alt):', '') || '';
      const caption = prompt('Подпись под изображением (можно оставить пустой):', '') || '';
      const cap = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : '';
      insertAtCaret(`<figure class="embedded-media"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">${cap}</figure><p><br></p>`);
      editable.dispatchEvent(new Event('input'));
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

    function lectureHtml() {
      const record = currentRecord();
      const safeSlug = escapeHtml(record.slug);
      const safeTitle = escapeHtml(record.title || 'Лекция');
      const content = editable.innerHTML.trim();
      return `<!doctype html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <meta name="description" content="Лекция курса «${escapeHtml(courseName)}»">\n  <title>${safeTitle} — ${escapeHtml(courseName)}</title>\n  <link rel="stylesheet" href="../styles.css">\n</head>\n<body class="lecture-page" data-topic="${safeSlug}">\n<header class="lecture-topbar">\n  <nav aria-label="Главная навигация">\n    <a href="../index.html">Главная</a>\n    <a href="../index.html#about">О курсе</a>\n    <a href="../index.html#links">Ссылки</a>\n    <a class="active" href="../index.html#topics">Темы</a>\n  </nav>\n</header>\n<button class="topics-toggle" type="button" aria-expanded="false"><strong>Темы курса</strong><span>Темы · открыть</span></button>\n<div class="lecture-shell">\n  <aside class="lecture-sidebar" aria-label="Темы курса">\n    <div class="sidebar-head"><span>ТЕМЫ КУРСА</span><button class="sidebar-close" type="button" aria-label="Закрыть список тем">×</button></div>\n    <div id="lectureTopics" class="lecture-topic-list"></div>\n  </aside>\n  <main class="lecture-main">\n    <article class="lecture-article">\n      <div class="lecture-kicker">ТЕМА</div>\n      <h1>${safeTitle}</h1>\n      <div class="tags"></div>\n${content.split('\n').map(line => '      ' + line).join('\n')}\n      <nav class="lecture-pagination" aria-label="Навигация по лекциям">\n        <a id="prevLecture" href="#">← <span>Предыдущая тема</span></a>\n        <a id="nextLecture" href="#"><span>Следующая тема</span> →</a>\n      </nav>\n    </article>\n  </main>\n</div>\n<div class="sidebar-backdrop" aria-hidden="true"></div>\n<script src="../topics.js"></script>\n<script src="../lecture.js"></script>\n</body>\n</html>\n`;
    }

    function download(name, content, type = 'text/html;charset=utf-8') {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.getElementById('downloadLecture').addEventListener('click', () => {
      const slug = slugInput.value.trim();
      if (!slug) return setStatus('Укажите slug');
      download(`${slug}.html`, lectureHtml());
      setStatus('HTML лекции скачан');
    });

    function topicsJsText() {
      return `window.COURSE_TOPICS = ${JSON.stringify(editorTopics, null, 2)};\n`;
    }

    document.getElementById('downloadTopics').addEventListener('click', () => {
      download('topics.js', topicsJsText(), 'text/javascript;charset=utf-8');
      setStatus('topics.js скачан');
    });

    document.getElementById('copyTopic').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(topicObjectText()); setStatus('Запись скопирована'); }
      catch (_) { codeBox.select(); document.execCommand('copy'); setStatus('Запись скопирована'); }
    });

    document.getElementById('copyContent').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(editable.innerHTML.trim()); setStatus('HTML содержимого скопирован'); }
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
        const data = { title: rec.title, tags: rec.tags, content: editable.innerHTML, updated: Date.now() };
        localStorage.setItem(draftKey(rec.slug), JSON.stringify(data));
        status.textContent = 'Черновик сохранён в браузере';
      }, 650);
    }
    function loadDraft(slug) {
      try { return JSON.parse(localStorage.getItem(draftKey(slug))); } catch (_) { return null; }
    }

    renderTopicSelect();
    newLecture();
  }
})();
