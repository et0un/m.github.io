/* Shared editing, media and export behavior for all three Studio page types. */
window.createCourseEditor = function ({ roots, controls, getMode, setStatus, courseName }) {
  const ranges = new Map();
  const files = new Map();
  const urls = new Map();
  const pendingFiles = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const activeRoot = () => roots[getMode()];
  const prefix = root => root === roots.home ? '' : '../';
  let selected = null;
  let draggedMedia = null;
  function prepareMedia(root) {
    // Clipboard and old drafts can contain bare images inside text paragraphs.
    root.querySelectorAll('img').forEach(img => {
      if (img.closest('figure.embedded-media') || img.closest('.resource-detail-card')) return;
      const figure = document.createElement('figure'); figure.className = 'embedded-media';
      const anchor = img.closest('a');
      const item = anchor && anchor.childNodes.length === 1 ? anchor : img;
      const paragraph = item.closest('p');
      if (paragraph && root.contains(paragraph)) {
        const tail = document.createRange(); tail.selectNodeContents(paragraph); tail.setStartAfter(item);
        const after = paragraph.cloneNode(false); after.append(tail.extractContents());
        paragraph.after(figure); figure.append(item);
        if (after.hasChildNodes()) figure.after(after);
        if (!paragraph.textContent.trim() && !paragraph.querySelector('img,video')) paragraph.remove();
      } else { item.before(figure); figure.append(item); }
    });
    root.querySelectorAll('figure.embedded-media').forEach(figure => {
      if (figure.contentEditable !== 'false') figure.contentEditable = 'false';
      if (!figure.hasAttribute('tabindex')) figure.tabIndex = 0;
      if (figure.draggable !== true) figure.draggable = true;
      figure.querySelectorAll('img,a').forEach(node => { if (node.draggable !== false) node.draggable = false; });
      const caption = figure.querySelector('figcaption');
      if (caption) {
        if (caption.contentEditable !== 'true') caption.contentEditable = 'true';
        caption.dataset.placeholder = 'Добавить подпись…';
      }
    });
  }
  const movableBlock = figure => figure.closest('.media-layout') || figure;
  function moveMedia(root, block, target, after) {
    if (!target || target === block || block.contains(target)) return;
    const oldLayout = block.parentElement?.closest('.media-layout');
    if (after) target.after(block); else target.before(block);
    if (oldLayout && !oldLayout.querySelector('figure')) oldLayout.remove();
    changed(root);
  }
  let dialogRoot = null;
  let editingCode = null;
  const dbReady = new Promise(resolve => {
    const request = indexedDB.open(`course-studio-assets:${location.pathname}:${courseName}`, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { setStatus('Браузер не разрешил сохранять медиа. Скачайте ZIP перед закрытием вкладки.'); resolve(null); };
  });
  async function storeFile(path, file) {
    const db = await dbReady;
    if (!db) return;
    await new Promise(resolve => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(file, path);
      tx.oncomplete = resolve;
      tx.onerror = () => { setStatus('Не хватило места для медиа. Скачайте ZIP перед закрытием вкладки.'); resolve(); };
      tx.onabort = tx.onerror;
    });
  }
  async function restoreFile(path) {
    if (files.has(path)) return files.get(path);
    const db = await dbReady;
    if (!db) return null;
    return new Promise(resolve => {
      const request = db.transaction('files').objectStore('files').get(path);
      request.onsuccess = () => {
        const file = request.result;
        if (file) { files.set(path, file); if (!urls.has(path)) urls.set(path, URL.createObjectURL(file)); }
        resolve(file || null);
      };
      request.onerror = () => resolve(null);
    });
  }
  async function hydrate(root) {
    prepareMedia(root);
    if (root === roots.home) root.querySelectorAll('img[src],video[src],source[src]').forEach(node => {
      const src = node.getAttribute('src');
      if (src.startsWith('assets/') && !node.dataset.exportSrc) {
        node.dataset.exportSrc = src; node.setAttribute('src', '../' + src);
      }
    });
    for (const node of root.querySelectorAll('[data-studio-asset]')) {
      const path = node.dataset.studioAsset;
      if (await restoreFile(path)) {
        const url = urls.get(path);
        if (root.contains(node) && node.getAttribute('src') !== url) node.setAttribute('src', url);
      }
    }
    window.CourseDesign.loadInlineFonts(root);
  }
  function saveRange(root) {
    const sel = getSelection();
    if (sel?.rangeCount && root.contains(sel.anchorNode) && root.contains(sel.focusNode)) ranges.set(root, sel.getRangeAt(0).cloneRange());
  }
  function restoreRange(root) {
    let range = ranges.get(root);
    if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      range = document.createRange(); range.selectNodeContents(root); range.collapse(false);
    }
    root.focus({ preventScroll: true });
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    return range;
  }
  function changed(root) { saveRange(root); root.dispatchEvent(new Event('input', { bubbles: true })); }
  document.addEventListener('selectionchange', () => Object.values(roots).forEach(saveRange));
  function normalize(root) {
    // Chrome may create DIV paragraphs on Enter. Preserve all attributes and inline styles.
    [...root.childNodes].forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        const p = document.createElement('p'); node.replaceWith(p); p.append(node);
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'DIV' && !node.className && !node.querySelector('p,h2,h3,ul,ol,figure,pre,div,table,svg,video,iframe,canvas,section')) {
        const p = document.createElement('p');
        [...node.attributes].forEach(a => p.setAttribute(a.name, a.value));
        p.append(...node.childNodes); node.replaceWith(p);
      }
    });
  }
  function insertBlock(root, html) {
    const range = restoreRange(root);
    range.deleteContents();
    const el = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const block = el.closest('p,h2,h3,blockquote,pre,figure');
    const fragment = range.createContextualFragment(html);
    const last = fragment.lastChild;
    if (block && root.contains(block) && block.parentElement === root) {
      const tail = document.createRange(); tail.selectNodeContents(block); tail.setStart(range.startContainer, range.startOffset);
      const after = document.createElement('p'); after.append(tail.extractContents());
      if (!after.hasChildNodes()) after.append(document.createElement('br'));
      block.after(fragment, after);
      range.selectNodeContents(after); range.collapse(true);
    } else {
      // At the root or inside a card, keep the inserted block inside that editing area.
      range.insertNode(fragment);
      const after = document.createElement('p'); after.append(document.createElement('br'));
      last.after(after); range.selectNodeContents(after); range.collapse(true);
    }
    getSelection().removeAllRanges(); getSelection().addRange(range); changed(root);
  }
  function applyStyle(root, property, value, font) {
    const range = restoreRange(root);
    if (range.collapsed) {
      const el = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      const block = el.closest('p,li,h2,h3,blockquote,figcaption,strong,span');
      if (block && root.contains(block)) {
        block.style[property] = value;
        if (font) block.dataset.courseFont = font;
      } else {
        insertBlock(root, `<p style="${property.replace(/[A-Z]/g, c => '-'+c.toLowerCase())}:${esc(value)}"${font ? ` data-course-font="${esc(font)}"` : ''}><br></p>`);
      }
    } else {
      // Format text runs inside their existing blocks, never wrap headings/lists in a SPAN.
      const fragment = range.cloneContents();
      const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
      const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      const originalWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const originals = [];
      while (originalWalker.nextNode()) {
        const node = originalWalker.currentNode;
        if (range.intersectsNode(node) && !(node === range.startContainer && range.startOffset === node.length) && !(node === range.endContainer && range.endOffset === 0)) originals.push(node);
      }
      const marker = crypto.randomUUID();
      nodes.forEach((text, index) => {
        const span = document.createElement('span');
        // cloneContents excludes enclosing inline spans. Carry their styles forward
        // so applying a color after a size or font never clears the previous choice.
        const chain = [];
        for (let el = originals[index]?.parentElement; el && el !== root; el = el.parentElement) chain.unshift(el);
        chain.forEach(el => {
          for (const key of ['fontSize','fontFamily','fontWeight','fontStyle','color','backgroundColor','textDecoration']) if (el.style[key]) span.style[key] = el.style[key];
          if (el.matches('b,strong')) span.style.fontWeight = '700';
          if (el.matches('i,em')) span.style.fontStyle = 'italic';
          if (el.dataset.courseFont) span.dataset.courseFont = el.dataset.courseFont;
        });
        span.style[property] = value;
        if (property === 'fontFamily') { if (font) span.dataset.courseFont = font; else delete span.dataset.courseFont; }
        span.dataset.studioRun = marker;
        text.replaceWith(span); span.append(text);
      });
      const box = document.createElement('div'); box.append(fragment);
      document.execCommand('insertHTML', false, box.innerHTML);
      const inserted = [...root.querySelectorAll(`[data-studio-run="${marker}"]`)];
      if (inserted.length) {
        const selection = document.createRange(); selection.setStartBefore(inserted[0]); selection.setEndAfter(inserted.at(-1));
        getSelection().removeAllRanges(); getSelection().addRange(selection);
        inserted.forEach(el => el.removeAttribute('data-studio-run'));
      }
    }
    changed(root);
  }
  function format(root, cmd) {
    restoreRange(root);
    const blocks = { h2:'h2', h3:'h3', p:'p', blockquote:'blockquote' };
    if (blocks[cmd]) document.execCommand('formatBlock', false, blocks[cmd]);
    else if (cmd === 'ul' || cmd === 'ol') document.execCommand(cmd === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
    else document.execCommand(cmd, false, null);
    changed(root);
  }
  function safeUrl(value, media = false) {
    const raw = value.trim();
    if (!raw || /[\u0000-\u001f]/.test(raw) || /^([a-z][a-z0-9+.-]*):/i.test(raw) && !/^(https?:|mailto:|tel:)/i.test(raw)) return '';
    if (media && /^(mailto:|tel:)/i.test(raw)) return '';
    return raw;
  }

  const dialog = document.createElement('dialog'); dialog.className = 'studio-dialog';
  document.body.append(dialog);
  function showDialog(root, title, content, submit) {
    saveRange(root); dialogRoot = root;
    dialog.innerHTML = `<form><h2>${esc(title)}</h2>${content}<div class="editor-actions"><button class="editor-primary" type="submit">Применить</button><button class="editor-secondary" type="button" data-cancel>Отмена</button></div><p class="dialog-error" role="alert"></p></form>`;
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const button = event.submitter; button.disabled = true;
      const data = new FormData(event.target);
      // A modal makes the editor inert. Close it before restoring selection or
      // executing rich-text commands, otherwise browsers silently ignore them.
      dialog.close(); restoreRange(root);
      try { if (await submit(data) === false) dialog.showModal(); }
      catch (error) { dialog.querySelector('.dialog-error').textContent = error.message; dialog.showModal(); }
      finally { button.disabled = false; }
    };
    dialog.showModal();
  }
  dialog.addEventListener('close', () => { if (dialogRoot) restoreRange(dialogRoot); });
  const field = (label, input) => `<label class="editor-field"><span>${label}</span>${input}</label>`;
  function editLink(root) {
    const range = restoreRange(root);
    const el = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const anchor = el.closest('a');
    showDialog(root, 'Гиперссылка', field('Адрес: https://…, mailto:… или страница курса', `<input name="url" required value="${esc(anchor?.getAttribute('href') || '')}" placeholder="https://…">`) + field('Текст ссылки (при выделении можно оставить пустым)', `<input name="label" value="${esc(range.toString())}">`) + '<label><input name="newTab" type="checkbox" checked> Открыть в новой вкладке</label>', data => {
      const url = safeUrl(data.get('url')); if (!url) throw new Error('Укажите корректный адрес ссылки.');
      restoreRange(root);
      if (anchor && root.contains(anchor)) {
        anchor.setAttribute('href', url);
        if (data.get('label') && !anchor.classList.contains('resource-detail-card')) anchor.textContent = data.get('label');
        if (data.has('newTab')) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; } else { anchor.removeAttribute('target'); anchor.removeAttribute('rel'); }
      } else {
        const sel = getSelection();
        const label = data.get('label');
        if (!sel.isCollapsed && (!label || label === sel.toString())) {
          document.execCommand('createLink', false, url);
          root.querySelectorAll('a').forEach(a => { if (a.getAttribute('href') === url && data.has('newTab')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } });
        } else document.execCommand('insertHTML', false, `<a href="${esc(url)}"${data.has('newTab') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(label || url)}</a>`);
      }
      changed(root);
    });
  }
  function editCode(root, existing = null) {
    editingCode = existing;
    showDialog(root, existing ? 'Изменить код' : 'Фрагмент кода', field('Язык или название', `<input name="language" value="${esc(existing?.dataset.language || '')}" placeholder="JavaScript / выражение After Effects">`) + field('Код', `<textarea name="code" class="code-input" rows="10" required spellcheck="false">${esc(existing?.querySelector('code')?.textContent || '')}</textarea>`), data => {
      const language = data.get('language').trim();
      if (editingCode && root.contains(editingCode)) {
        editingCode.dataset.language = language; editingCode.querySelector('code').textContent = data.get('code'); changed(root);
      } else insertBlock(root, `<pre class="course-code" data-language="${esc(language)}"><code>${esc(data.get('code'))}</code></pre>`);
    });
  }
  function mediaDialog(root, kind) {
    const local = kind === 'local';
    showDialog(root, local ? 'Изображения, GIF и собственное видео' : 'Медиа по ссылке',
      (local ? field('Файлы (можно выбрать несколько изображений)', '<input name="files" type="file" accept="image/*,video/mp4,video/webm,video/ogg" multiple required>') : field('URL изображения, GIF, видеофайла или YouTube / Vimeo', '<input name="url" required placeholder="https://…">') + field('Тип', '<select name="kind"><option value="image">Изображение / GIF</option><option value="video">Видеофайл MP4 / WebM</option><option value="embed">YouTube / Vimeo / Rutube / VK</option></select>')) +
      field('Расположение', '<select name="columns"><option value="1">По одному</option><option value="2">Два рядом</option></select>') +
      field('Ширина относительно текста', '<select name="width"><option value="100">100% — вся ширина</option><option value="75">75%</option><option value="50">50%</option><option value="33">33%</option></select>') +
      field('Подпись под медиа (можно изменить в предпросмотре)', '<input name="caption" placeholder="Что показано и на что обратить внимание">') +
      field('Описание изображения для доступности', '<input name="alt" placeholder="Краткое описание">'), async data => {
        const items = [];
        if (local) {
          const chosen = data.getAll('files').filter(f => f.size);
          if (!chosen.length) throw new Error('Выберите файл.');
          for (const file of chosen) items.push(await localItem(file, root));
        } else {
          const src = safeUrl(data.get('url'), true); if (!src) throw new Error('Укажите корректный URL.');
          const type = data.get('kind');
          if (type === 'embed') {
            const video = window.normaliseCourseVideo(src);
            if (!video) throw new Error('Не удалось распознать ссылку видео.');
            items.push({ type, src: video.url, title: video.provider });
          } else items.push({ type, src });
        }
        insertMedia(root, items, { columns: data.get('columns'), width: data.get('width'), caption: data.get('caption'), alt: data.get('alt') });
      });
  }
  async function localItem(file, root) {
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : '';
    if (!type) throw new Error('Поддерживаются изображения, GIF и видео MP4 / WebM / Ogg.');
    if (file.size > 90 * 1024 * 1024) throw new Error('Файл больше 90 МБ. Для GitHub используйте меньшее видео или ссылку.');
    const stem = file.name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]/g, '-');
    const path = `assets/${type === 'image' ? 'images' : 'videos'}/${crypto.randomUUID().slice(0, 8)}-${stem}`;
    files.set(path, file); urls.set(path, URL.createObjectURL(file));
    const pending = storeFile(path, file); pendingFiles.add(pending);
    await pending; pendingFiles.delete(pending);
    return { type, src: urls.get(path), path, exportSrc: prefix(root) + path };
  }
  function insertMedia(root, items, options = {}) {
    const markup = items.map(item => {
      const attrs = item.path ? ` data-studio-asset="${esc(item.path)}" data-export-src="${esc(item.exportSrc)}"` : '';
      let media;
      if (item.type === 'image') media = `<img src="${esc(item.src)}"${attrs} alt="${esc(options.alt || '')}" loading="lazy">`;
      else if (item.type === 'video') media = `<video src="${esc(item.src)}"${attrs} controls playsinline preload="metadata"></video>`;
      else media = `<div class="video-frame"><iframe src="${esc(item.src)}" title="${esc(item.title || options.caption || 'Видео')}" loading="lazy" allow="fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
      return `<figure class="embedded-media" contenteditable="false">${media}<figcaption contenteditable="true" data-placeholder="Добавить подпись…">${esc(options.caption || '')}</figcaption></figure>`;
    }).join('');
    const marker = crypto.randomUUID();
    const html = `<div data-new-media="${marker}" class="media-layout" data-columns="${options.columns === '2' ? '2' : '1'}" style="width:${Number(options.width) || 100}%" contenteditable="false">${markup}</div>`;
    insertBlock(root, html);
    prepareMedia(root);
    const inserted = root.querySelector(`[data-new-media="${marker}"]`);
    inserted?.removeAttribute('data-new-media');
    selectMedia(inserted?.querySelector('figure') || null);
    setStatus('Медиа добавлено. Нажмите на него, чтобы изменить размер и подпись.');
  }

  function toolbar(mode) {
    const fontOptions = ['','Inter','Roboto','Open Sans','Noto Sans','Noto Serif','Montserrat','Source Sans 3','PT Sans','PT Serif','JetBrains Mono'];
    return `<div class="editor-actions rich-toolbar" data-rich-toolbar="${mode}">
      <button type="button" class="editor-tool" data-command="bold" title="Жирный"><b>Ж</b></button>
      <button type="button" class="editor-tool" data-command="italic" title="Курсив"><i>К</i></button>
      <button type="button" class="editor-tool" data-command="underline">Подчеркнуть</button>
      <button type="button" class="editor-tool" data-command="h2">Заголовок</button>
      <button type="button" class="editor-tool" data-command="p">Абзац</button>
      <button type="button" class="editor-tool" data-command="blockquote">Цитата</button>
      <button type="button" class="editor-tool" data-command="ul">• Список</button>
      <button type="button" class="editor-tool" data-command="ol">1. Список</button>
      <button type="button" class="editor-tool" data-action="lead">Вступление</button>
      <button type="button" class="editor-tool" data-action="link">Ссылка</button>
      <button type="button" class="editor-tool" data-action="unlink">Убрать ссылку</button>
      <button type="button" class="editor-tool" data-action="code">Блок кода</button>
      <button type="button" class="editor-tool" data-command="removeFormat">Сбросить стиль</button>
      <label class="editor-field rich-full"><span>Шрифт текста</span><select data-style="fontFamily">${fontOptions.map(f => `<option value="${esc(f)}">${f || 'Шрифт сайта'}</option>`).join('')}<option value="custom">Другой из Google Fonts…</option></select></label>
      <label class="editor-field"><span>Размер</span><select data-style="fontSize">${[14,16,18,20,24,28,32,40,48].map(n => `<option value="${n}px"${n===18 ? ' selected' : ''}>${n} px</option>`).join('')}</select></label>
      <label class="editor-field"><span>Начертание</span><select data-style="fontWeight">${window.CourseDesign.weightsFor(window.COURSE_DESIGN?.font || 'Inter').map(w => `<option value="${w}"${w===400?' selected':''}>${({300:'Лёгкое',400:'Обычное',500:'Среднее',600:'Полужирное',700:'Жирное',800:'Очень жирное'})[w]}</option>`).join('')}</select></label>
      <label class="editor-field"><span>Цвет текста</span><input type="color" value="#bdbdbd" data-style="color"></label>
      <label class="editor-field"><span>Цвет выделения</span><input type="color" value="#ffcc66" data-style="backgroundColor"></label>
      <button type="button" class="editor-tool" data-action="clearHighlight">Без выделения</button>
      ${['left','center','right'].map((a,i) => `<button type="button" class="editor-tool" data-align="${a}">${['Слева','По центру','Справа'][i]}</button>`).join('')}
      <button type="button" class="editor-tool is-accent" data-action="local">Фото / GIF / видео</button>
      <button type="button" class="editor-tool is-accent" data-action="url">Медиа по URL</button>
      </div><p class="editor-help">Выделите текст для изменения. Без выделения размер, шрифт и цвет применяются к текущему абзацу. Медиа можно перетаскивать в текст.</p>`;
  }
  Object.entries(roots).forEach(([mode, root]) => {
    const holder = controls[mode].querySelector('[data-toolbar-slot]'); holder.innerHTML = toolbar(mode);
    holder.addEventListener('pointerdown', event => {
      saveRange(root);
      if (event.target.closest('button')) event.preventDefault();
    });
    holder.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.command) format(root, button.dataset.command);
      else if (button.dataset.align) { restoreRange(root); document.execCommand({ left:'justifyLeft', center:'justifyCenter', right:'justifyRight' }[button.dataset.align]); changed(root); }
      else {
        switch (button.dataset.action) {
          case 'link': editLink(root); break;
          case 'unlink': format(root, 'unlink'); break;
          case 'code': editCode(root); break;
          case 'lead': insertBlock(root, '<p class="lead">Вступительный текст…</p>'); break;
          case 'local': mediaDialog(root, 'local'); break;
          case 'url': mediaDialog(root, 'url'); break;
          case 'clearHighlight': applyStyle(root, 'backgroundColor', 'transparent'); break;
        }
      }
    });
    holder.addEventListener('change', event => {
      const property = event.target.dataset.style; if (!property) return;
      if (property === 'fontFamily') {
        let font = event.target.value;
        if (font === 'custom') {
          showDialog(root, 'Шрифт из Google Fonts', field('Точное название семейства с fonts.google.com', '<input name="font" required placeholder="Например, Manrope">'), data => {
            font = data.get('font').trim(); if (!window.CourseDesign.validFont(font)) throw new Error('Введите название семейства латинскими буквами.');
            window.CourseDesign.loadFont(font); applyStyle(root, 'fontFamily', `"${font}", sans-serif`, font);
          });
        } else {
          if (font) window.CourseDesign.loadFont(font);
          const weights = holder.querySelector('[data-style="fontWeight"]');
          weights.innerHTML = window.CourseDesign.weightsFor(font || document.getElementById('siteFont').value).map(w => `<option value="${w}"${w===400?' selected':''}>${w}</option>`).join('');
          applyStyle(root, property, font ? `"${font}", sans-serif` : 'var(--course-font), sans-serif', font || undefined);
        }
      } else applyStyle(root, property, event.target.value);
    });
    root.addEventListener('click', event => {
      if (event.target.closest('a')) event.preventDefault();
      const figure = event.target.closest('figure.embedded-media');
      if (!figure && event.target.closest('img')) prepareMedia(root);
      const current = event.target.closest('figure.embedded-media');
      selectMedia(current && root.contains(current) ? current : null);
    });
    root.addEventListener('focusin', event => {
      const figure = event.target.closest('figure.embedded-media');
      if (figure) selectMedia(figure);
    });
    root.addEventListener('dblclick', event => {
      const code = event.target.closest('pre.course-code'); if (code) editCode(root, code);
    });
    root.addEventListener('blur', () => { normalize(root); changed(root); });
    root.addEventListener('keydown', event => {
      const el = getSelection()?.anchorNode;
      const code = (el?.nodeType === 1 ? el : el?.parentElement)?.closest('pre');
      if (code && event.key === 'Tab') { event.preventDefault(); document.execCommand('insertText', false, '  '); changed(root); }
      if (code && event.key === 'Enter' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); document.execCommand('insertText', false, '\n'); changed(root); }
      if (code && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault(); const p = document.createElement('p'); p.append(document.createElement('br')); code.after(p);
        const range = document.createRange(); range.selectNodeContents(p); range.collapse(true); ranges.set(root, range); restoreRange(root); changed(root);
      }
    });
    root.addEventListener('paste', async event => {
      const pastedFiles = [...(event.clipboardData?.files || [])];
      if (pastedFiles.length) { event.preventDefault(); saveRange(root); await addDropped(root, pastedFiles); return; }
      const text = event.clipboardData?.getData('text/plain');
      if (text == null) return;
      const el = getSelection()?.anchorNode;
      const code = (el?.nodeType === 1 ? el : el?.parentElement)?.closest('pre');
      if (code || event.clipboardData.getData('text/html')) {
        event.preventDefault();
        if (code) document.execCommand('insertText', false, text);
        else {
          // Strip clipboard fonts/colors, retain semantic paragraphs, emphasis and safe links.
          const doc = new DOMParser().parseFromString(event.clipboardData.getData('text/html'), 'text/html');
          doc.querySelectorAll('script,style,iframe,object,svg').forEach(n => n.remove());
          doc.querySelectorAll('div').forEach(node => {
            if (!node.querySelector('div,p,ul,ol,figure,pre')) { const p = doc.createElement('p'); p.append(...node.childNodes); node.replaceWith(p); }
          });
          const allowed = new Set(['P','BR','B','STRONG','I','EM','U','S','H2','H3','UL','OL','LI','BLOCKQUOTE','A','PRE','CODE','IMG']);
          [...doc.body.querySelectorAll('*')].reverse().forEach(node => {
            if (!allowed.has(node.tagName)) { node.replaceWith(...node.childNodes); return; }
            const href = node.tagName === 'A' ? safeUrl(node.getAttribute('href') || '') : '';
            const src = node.tagName === 'IMG' ? safeUrl(node.getAttribute('src') || '', true) : '';
            const alt = node.getAttribute('alt') || '';
            [...node.attributes].forEach(a => node.removeAttribute(a.name)); if (href) node.setAttribute('href', href);
            if (node.tagName === 'IMG') { if (!src) node.remove(); else { node.src = src; node.alt = alt; } }
          });
          document.execCommand('insertHTML', false, doc.body.innerHTML || esc(text));
        }
        changed(root);
      }
    });
    root.addEventListener('dragstart', event => {
      const figure = event.target.closest('figure.embedded-media');
      if (!figure || !root.contains(figure)) return;
      if (event.target.closest('figcaption')) { event.preventDefault(); return; }
      draggedMedia = { root, block: movableBlock(figure), figure };
      selectMedia(figure);
      event.dataTransfer.clearData();
      event.dataTransfer.setData('application/x-course-media', 'move');
      event.dataTransfer.effectAllowed = 'move';
    });
    root.addEventListener('dragend', () => { draggedMedia = null; root.classList.remove('editor-drop-active'); });
    root.addEventListener('dragover', event => {
      if (draggedMedia || [...(event.dataTransfer?.items || [])].some(i => i.kind === 'file')) {
        event.preventDefault(); root.classList.add('editor-drop-active');
        event.dataTransfer.dropEffect = draggedMedia ? 'move' : 'copy';
      }
    });
    root.addEventListener('dragleave', () => root.classList.remove('editor-drop-active'));
    root.addEventListener('drop', async event => {
      root.classList.remove('editor-drop-active');
      if (draggedMedia) {
        event.preventDefault(); event.stopPropagation();
        const moving = draggedMedia; draggedMedia = null;
        if (moving.root !== root) return;
        let target = event.target;
        while (target && target.parentElement !== root && target !== root) target = target.parentElement;
        if (target && target !== root) {
          const rect = target.getBoundingClientRect();
          moveMedia(root, moving.block, target, event.clientY > rect.top + rect.height / 2);
        } else if (event.clientY > root.getBoundingClientRect().top + root.clientHeight / 2) {
          root.append(moving.block); changed(root);
        } else { root.prepend(moving.block); changed(root); }
        selectMedia(moving.figure); return;
      }
      const chosen = [...(event.dataTransfer?.files || [])]; if (!chosen.length) return;
      event.preventDefault();
      const position = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      if (position && root.contains(position.startContainer)) ranges.set(root, position);
      await addDropped(root, chosen);
    });
    new MutationObserver(() => {
      if (selected && !activeRoot().contains(selected)) selectMedia(null);
      hydrate(root);
      prepareMedia(root);
    }).observe(root, { childList: true, subtree: true });
  });
  async function addDropped(root, chosen) {
    try {
      const items = []; for (const file of chosen) items.push(await localItem(file, root));
      insertMedia(root, items, { columns: items.length > 1 ? '2' : '1' });
    } catch (error) { setStatus(error.message); }
  }

  const mediaPanel = document.createElement('section'); mediaPanel.className = 'editor-section media-inspector'; mediaPanel.hidden = true;
  mediaPanel.setAttribute('aria-label', 'Настройки выбранного медиа');
  mediaPanel.innerHTML = `<div class="media-inspector-head"><h2>Настройки медиа</h2><button type="button" class="editor-secondary" data-media-close aria-label="Закрыть настройки">×</button></div><p class="editor-help" data-media-hint>Нажмите на изображение или видео в предпросмотре.</p><div data-media-fields hidden>
    ${field('Ширина блока (%)', '<input data-media-width type="range" min="20" max="100" step="5" value="100"><output data-width-label>100%</output>')}
    ${field('Выравнивание блока', '<select data-media-align><option value="left">Слева</option><option value="center">По центру</option><option value="right">Справа</option></select>')}
    ${field('Расположение', '<select data-media-columns><option value="1">По одному</option><option value="2">Два рядом</option></select>')}
    ${field('Подпись под выбранным медиа', '<textarea data-media-caption rows="2"></textarea>')}
    ${field('Описание изображения', '<input data-media-alt>')}
    <div class="editor-actions"><button class="editor-secondary" type="button" data-media-up>Выше</button><button class="editor-secondary" type="button" data-media-down>Ниже</button><button class="editor-secondary" type="button" data-media-replace>Заменить изображение</button><button class="editor-secondary" type="button" data-media-pair>Добавить фото рядом</button><button class="editor-danger" type="button" data-media-remove>Удалить медиа</button></div>
    </div>`;
  document.body.append(mediaPanel);
  mediaPanel.querySelector('[data-media-close]').onclick = () => selectMedia(null);
  const mediaFields = mediaPanel.querySelector('[data-media-fields]');
  function selectMedia(figure) {
    if (selected) selected.classList.remove('is-selected-media'); selected = figure;
    mediaPanel.hidden = !figure;
    mediaFields.hidden = !figure;
    mediaPanel.querySelector('[data-media-hint]').hidden = !!figure;
    if (!figure) return;
    figure.classList.add('is-selected-media');
    const layout = figure.closest('.media-layout') || figure;
    mediaPanel.querySelector('[data-media-width]').value = parseInt(layout.style.width, 10) || 100;
    mediaPanel.querySelector('[data-width-label]').textContent = `${parseInt(layout.style.width, 10) || 100}%`;
    mediaPanel.querySelector('[data-media-align]').value = layout.style.marginLeft === 'auto' ? (layout.style.marginRight === 'auto' ? 'center' : 'right') : 'left';
    mediaPanel.querySelector('[data-media-replace]').disabled = !figure.querySelector('img');
    mediaPanel.querySelector('[data-media-columns]').value = layout.dataset.columns || '1';
    mediaPanel.querySelector('[data-media-caption]').value = figure.querySelector('figcaption')?.textContent || '';
    mediaPanel.querySelector('[data-media-alt]').value = figure.querySelector('img')?.alt || '';
    mediaPanel.querySelector('[data-media-alt]').disabled = !figure.querySelector('img');
    mediaPanel.querySelector('[data-media-pair]').disabled = !figure.querySelector('img');
  }
  mediaPanel.addEventListener('input', event => {
    if (!selected || !activeRoot().contains(selected)) return selectMedia(null);
    const layout = selected.closest('.media-layout') || selected;
    if (event.target.hasAttribute('data-media-width')) { layout.style.removeProperty('max-width'); layout.style.width = `${event.target.value}%`; mediaPanel.querySelector('[data-width-label]').textContent = `${event.target.value}%`; }
    if (event.target.hasAttribute('data-media-align')) {
      layout.style.marginLeft = event.target.value === 'left' ? '0' : 'auto';
      layout.style.marginRight = event.target.value === 'right' ? '0' : 'auto';
    }
    if (event.target.hasAttribute('data-media-columns')) {
      if (layout === selected) { const wrapper = document.createElement('div'); wrapper.className = 'media-layout'; wrapper.contentEditable = 'false'; wrapper.style.width = selected.style.width || '100%'; selected.before(wrapper); wrapper.append(selected); selected.style.removeProperty('width'); wrapper.dataset.columns = event.target.value; }
      else layout.dataset.columns = event.target.value;
    }
    if (event.target.hasAttribute('data-media-caption')) {
      let cap = selected.querySelector('figcaption'); if (!cap) { cap = document.createElement('figcaption'); cap.contentEditable = 'true'; selected.append(cap); }
      cap.textContent = event.target.value;
    }
    if (event.target.hasAttribute('data-media-alt')) selected.querySelector('img').alt = event.target.value;
    changed(activeRoot());
  });
  for (const direction of ['up', 'down']) mediaPanel.querySelector(`[data-media-${direction}]`).onclick = () => {
    if (!selected || !activeRoot().contains(selected)) return;
    const block = movableBlock(selected);
    const target = direction === 'up' ? block.previousElementSibling : block.nextElementSibling;
    moveMedia(activeRoot(), block, target, direction === 'down');
    selected.scrollIntoView({ block:'nearest', behavior:'smooth' });
  };
  mediaPanel.querySelector('[data-media-replace]').onclick = () => {
    if (!selected?.querySelector('img')) return;
    const figure = selected, root = activeRoot();
    showDialog(root, 'Заменить изображение', field('Новый файл', '<input name="file" type="file" accept="image/*" required>'), async data => {
      if (!root.contains(figure)) throw new Error('Изображение уже удалено.');
      const item = await localItem(data.get('file'), root);
      const img = figure.querySelector('img');
      img.src = item.src; img.dataset.studioAsset = item.path; img.dataset.exportSrc = item.exportSrc;
      img.removeAttribute('width'); img.removeAttribute('height'); img.style.height = 'auto';
      const anchor = img.closest('a'); if (anchor) anchor.replaceWith(img);
      changed(root); selectMedia(figure);
    });
  };
  mediaPanel.querySelector('[data-media-remove]').onclick = () => {
    if (!selected || !activeRoot().contains(selected)) return;
    const layout = selected.closest('.media-layout'); selected.remove(); if (layout && !layout.querySelector('figure')) layout.remove(); selectMedia(null); changed(activeRoot());
  };
  mediaPanel.querySelector('[data-media-pair]').onclick = () => {
    if (!selected) return;
    const figure = selected; const root = activeRoot();
    showDialog(root, 'Второе изображение рядом', field('Изображение / GIF', '<input name="file" type="file" accept="image/*" required>') + field('Подпись', '<input name="caption">') + field('Описание', '<input name="alt">'), async data => {
      if (!root.contains(figure)) throw new Error('Исходное изображение удалено.');
      const item = await localItem(data.get('file'), root);
      let layout = figure.closest('.media-layout');
      if (!layout) { layout = document.createElement('div'); layout.className = 'media-layout'; layout.contentEditable = 'false'; layout.style.width = figure.style.width || '100%'; figure.before(layout); layout.append(figure); figure.style.removeProperty('width'); }
      layout.dataset.columns = '2';
      layout.insertAdjacentHTML('beforeend', `<figure class="embedded-media" contenteditable="false"><img src="${esc(item.src)}" data-export-src="${esc(item.exportSrc)}" data-studio-asset="${esc(item.path)}" alt="${esc(data.get('alt'))}"><figcaption contenteditable="true">${esc(data.get('caption'))}</figcaption></figure>`);
      changed(root); selectMedia(figure);
    });
  };

  function exportContent(root, { draft = false } = {}) {
    const clone = root.cloneNode(true); normalize(clone);
    clone.querySelectorAll('[data-export-src]').forEach(node => {
      node.setAttribute('src', node.dataset.exportSrc);
      if (!draft) { node.removeAttribute('data-export-src'); node.removeAttribute('data-studio-asset'); }
    });
    clone.querySelectorAll('figure.embedded-media').forEach(figure => { figure.removeAttribute('draggable'); figure.removeAttribute('tabindex'); figure.querySelectorAll('[draggable]').forEach(node => node.removeAttribute('draggable')); });
    clone.querySelectorAll('[contenteditable],[data-placeholder],[data-studio-run]').forEach(node => { node.removeAttribute('contenteditable'); node.removeAttribute('data-placeholder'); node.removeAttribute('data-studio-run'); });
    clone.querySelectorAll('.is-selected-media').forEach(node => node.classList.remove('is-selected-media'));
    clone.querySelectorAll('[data-studio-control]').forEach(node => node.remove());
    return clone.innerHTML.trim();
  }
  async function usedAssets(root) {
    await Promise.all(pendingFiles);
    const entries = [];
    for (const path of new Set([...root.querySelectorAll('[data-studio-asset]')].map(node => node.dataset.studioAsset))) {
      const file = await restoreFile(path);
      if (file) entries.push([path, file]);
      else {
        const node = root.querySelector(`[data-studio-asset="${CSS.escape(path)}"]`);
        const source = node?.dataset.exportSrc || node?.getAttribute('src');
        const response = source && !source.startsWith('blob:') ? await fetch(root === roots.home && source.startsWith('assets/') ? '../' + source : source) : null;
        if (!response?.ok) throw new Error('Не найден файл медиа. Добавьте его повторно: ' + path);
      }
    }
    return entries;
  }
  async function assetsForPaths(paths, { localOnly = false } = {}) {
    await Promise.all(pendingFiles);
    const entries = [];
    for (const path of new Set(paths.filter(Boolean))) {
      const file = await restoreFile(path);
      if (file) entries.push([path, file]);
      else if (!localOnly && path.startsWith('assets/')) {
        const response = await fetch('../' + path);
        if (!response.ok) throw new Error('Не найден файл превью. Загрузите его повторно: ' + path);
        // Existing published thumbnails are included in downloadable packages as well.
        entries.push([path, await response.blob()]);
      }
    }
    return entries;
  }
  async function assetPreviewUrl(path) {
    await restoreFile(path);
    return urls.get(path) || (/^https?:\/\//i.test(path) || path.startsWith('/') ? path : '../' + path);
  }
  return { exportContent, usedAssets, hydrate, selectMedia, insertBlock, format, files,
    assetsForPaths, assetPreviewUrl,
    addThumbnail: async file => {
      if (!file?.type.startsWith('image/')) throw new Error('Для превью выберите изображение или GIF.');
      return localItem(file, roots.home);
    }
  };
};


