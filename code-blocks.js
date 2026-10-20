/* Shared syntax highlighting and plain-text copying. Code is never executed. */
(() => {
  'use strict';
  if (window.CourseCode) return;
  const aliases = { js:'javascript', javascript:'javascript', jsx:'javascript', ae:'javascript', aftereffects:'javascript', 'after effects':'javascript', expressions:'javascript', экспрешены:'javascript', python:'python', py:'python', 'c#':'csharp', cs:'csharp', csharp:'csharp', html:'markup', xml:'markup', svg:'markup', markup:'markup', css:'css', json:'json', glsl:'glsl', bash:'bash', shell:'bash', sh:'bash', text:'plain', plaintext:'plain', plain:'plain' };
  const labels = { javascript:'JavaScript / After Effects', python:'Python', csharp:'C#', markup:'HTML / XML', css:'CSS', json:'JSON', glsl:'GLSL', bash:'Bash', plain:'Текст' };
  function language(value) {
    const key = String(value || '').trim().toLowerCase();
    return aliases[key] || (/javascript|after\s*effects|выражени|экспрешен/i.test(key) ? 'javascript' : 'plain');
  }
  const escape = value => String(value).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function highlight(text, lang) {
    const grammar = window.Prism?.languages[lang];
    return grammar ? window.Prism.highlight(text, grammar, lang) : escape(text);
  }
  function blockLanguage(pre) {
    const cls = pre.querySelector('code')?.className || pre.className;
    return pre.dataset.language || (String(cls).match(/(?:lang|language)-([\w-]+)/) || [])[1] || 'plain';
  }
  function editable(pre) { return !!pre.closest('.editor-content,.home-prose-editor,.resource-editor-content'); }
  async function copy(text, button) {
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const selection = getSelection();
        const ranges = selection ? Array.from({length:selection.rangeCount}, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
        const active = document.activeElement;
        const area = document.createElement('textarea');
        area.value = text; area.readOnly = true;
        area.style.cssText = 'position:fixed;left:-9999px;top:0';
        (document.querySelector('dialog[open]') || document.body).append(area);
        let success;
        try { area.focus(); area.select(); success = document.execCommand('copy'); }
        finally {
          area.remove(); active?.focus({preventScroll:true});
          if (selection) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); }
        }
        if (!success) throw new Error('Copy declined');
      }
      button.textContent = 'Скопировано';
      button.setAttribute('aria-label', 'Код скопирован');
    } catch (_) {
      button.textContent = 'Не удалось скопировать';
      button.setAttribute('aria-label', 'Выделите код и скопируйте вручную');
    }
    clearTimeout(button._copyTimer);
    button._copyTimer = setTimeout(() => { button.textContent = 'Копировать'; button.setAttribute('aria-label','Копировать весь код'); }, 2200);
  }
  const rendered = new WeakMap();
  function render(pre) {
    if (pre.closest('.code-input-editor') || !pre.isConnected) return;
    // Remove legacy controls before reading the code.
    pre.querySelectorAll('button.code-copy').forEach(button => button.remove());
    let code = pre.querySelector('code');
    if (!code) { const text = pre.textContent; pre.textContent = ''; code = document.createElement('code'); code.textContent = text; pre.append(code); }
    const raw = code.textContent;
    const originalLanguage = blockLanguage(pre), lang = language(originalLanguage), isEditor = editable(pre);
    let wrapper = pre.parentElement;
    if (!wrapper.classList.contains('course-code-block')) {
      wrapper = document.createElement('div'); wrapper.className = 'course-code-block';
      pre.before(wrapper); wrapper.append(pre);
    }
    if (isEditor) { wrapper.contentEditable = 'false'; wrapper.tabIndex = 0; }
    pre.classList.add('course-code');
    if (!pre.dataset.language) pre.dataset.language = originalLanguage;
    const state = rendered.get(pre);
    if (!state || state.raw !== raw || state.lang !== lang) {
      code.innerHTML = highlight(raw, lang);
      rendered.set(pre, {raw,lang});
    }
    let toolbar = wrapper.querySelector(':scope > .course-code-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div'); toolbar.className = 'course-code-toolbar'; toolbar.dataset.studioControl = 'code-toolbar';
      const name = document.createElement('span'); name.className = 'course-code-language'; toolbar.append(name);
      const actions = document.createElement('div'); actions.className = 'course-code-actions'; toolbar.append(actions);
      if (isEditor) {
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'course-code-edit'; edit.textContent = 'Изменить';
        edit.addEventListener('click', () => pre.dispatchEvent(new CustomEvent('course-code-edit',{bubbles:true,detail:{block:pre}})));
        actions.append(edit);
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'course-code-delete'; remove.textContent = 'Удалить';
        remove.addEventListener('click', () => {
          const root = wrapper.closest('.editor-content,.home-prose-editor,.resource-editor-content');
          wrapper.remove(); root?.dispatchEvent(new Event('input',{bubbles:true}));
        }); actions.append(remove);
      }
      const button = document.createElement('button'); button.type = 'button'; button.className = 'code-copy'; button.textContent = 'Копировать'; button.setAttribute('aria-label','Копировать весь код'); button.setAttribute('aria-live','polite');
      button.addEventListener('click', () => copy(code.textContent,button)); actions.append(button); wrapper.prepend(toolbar);
    }
    const name = toolbar.querySelector('.course-code-language');
    const label = labels[lang] === 'Текст' && originalLanguage !== 'plain' ? originalLanguage : labels[lang];
    if (name.textContent !== label) name.textContent = label;
  }
  function clean(root) {
    root.querySelectorAll('.course-code-block').forEach(wrapper => {
      const pre = wrapper.querySelector('pre'); if (pre) wrapper.replaceWith(pre); else wrapper.remove();
    });
    root.querySelectorAll('pre').forEach(pre => {
      pre.querySelectorAll('button,.course-code-toolbar').forEach(el => el.remove());
      const code = pre.querySelector('code'); if (code) code.textContent = code.textContent;
      pre.removeAttribute('contenteditable'); pre.removeAttribute('tabindex');
    });
  }
  const inputs = new WeakSet();
  function attachInput(surface) {
    if (inputs.has(surface)) return;
    const input = surface.querySelector('textarea'), code = surface.querySelector('pre code'), preview = surface.querySelector('pre');
    if (!input || !code || !preview) return;
    inputs.add(surface); surface.classList.add('is-highlighted');
    const select = surface.closest('form').querySelector('[name="language"]');
    const update = () => { code.innerHTML = highlight(input.value + '\n',language(select?.value)); };
    const scroll = () => { preview.scrollTop = input.scrollTop; preview.scrollLeft = input.scrollLeft; };
    input.addEventListener('input', update); input.addEventListener('scroll',scroll); select?.addEventListener('change',update);
    input.addEventListener('keydown', event => {
      if (event.key === 'Tab') {
        event.preventDefault(); const start = input.selectionStart, end = input.selectionEnd;
        if (event.shiftKey) {
          const before = input.value.slice(0,start); const match = before.match(/(?:^|\n)([ \t]{1,2})$/);
          if (match) input.setRangeText('',start-match[1].length,start,'end');
        } else input.setRangeText('  ',start,end,'end');
        input.dispatchEvent(new Event('input',{bubbles:true}));
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault(); const form = surface.closest('form'); form.requestSubmit(form.querySelector('[type="submit"]'));
      }
    });
    surface.closest('form').querySelector('[data-code-input-copy]')?.addEventListener('click', event => copy(input.value,event.currentTarget));
    update(); scroll();
  }
  const selector = '.lecture-article pre,.resource-article pre,.editor-content pre,.home-prose-editor pre,.resource-editor-content pre';
  function enhance(root = document) { root.querySelectorAll(selector).forEach(render); root.querySelectorAll('.code-input-editor').forEach(attachInput); }
  window.CourseCode = { language, labels, highlight, enhance, clean, attachInput, copy };
  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return; pending = true;
    requestAnimationFrame(() => { pending = false; observer.disconnect(); enhance(); observe(); });
  });
  function observe() { observer.observe(document.body,{childList:true,subtree:true,characterData:true}); }
  enhance(); observe();
})();
