(() => {
  const known = ['Inter', 'Roboto', 'Open Sans', 'Noto Sans', 'Noto Serif', 'Montserrat', 'Source Sans 3', 'PT Sans', 'PT Serif', 'JetBrains Mono'];
  const validFont = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9 ]{0,70}$/.test(value);
  const weightsFor = font => ['PT Sans','PT Serif'].includes(font) ? [400,700] : [300,400,500,600,700,800];
  const loaded = new Set();
  function loadFont(font) {
    if (!validFont(font) || loaded.has(font)) return;
    loaded.add(font);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // Request actual regular, bold and italic faces through Google Fonts CSS API.
    const family = encodeURIComponent(font).replace(/%20/g, '+');
    const tuples = [0,1].flatMap(italic => weightsFor(font).map(weight => `${italic},${weight}`)).join(';');
    link.href = `https://fonts.googleapis.com/css2?family=${family}${known.includes(font) ? ':ital,wght@' + tuples : ''}&display=swap`;
    document.head.append(link);
    if (!known.includes(font)) {
      // A custom family may have no italic or bold face. Its regular face must still load.
      const variants = document.createElement('link'); variants.rel = 'stylesheet';
      variants.href = `https://fonts.googleapis.com/css2?family=${family}:ital,wght@0,400;0,700;1,400;1,700&display=swap`;
      document.head.append(variants);
    }
  }
  function applyFont(font) {
    if (!validFont(font)) return;
    loadFont(font);
    document.documentElement.style.setProperty('--course-font', `"${font}"`);
  }
  window.CourseDesign = { known, validFont, weightsFor, loadFont, applyFont };
  applyFont(window.COURSE_DESIGN?.font || 'Inter');
  function loadInlineFonts(root) {
    root.querySelectorAll('[data-course-font]').forEach(el => loadFont(el.dataset.courseFont));
  }
  loadInlineFonts(document);
  window.CourseDesign.loadInlineFonts = loadInlineFonts;
  if (!document.body.classList.contains('editor-page')) {
    document.querySelectorAll('pre.course-code').forEach(block => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'code-copy'; button.textContent = 'Копировать';
      button.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(block.querySelector('code')?.textContent || ''); button.textContent = 'Скопировано'; }
        catch (_) { button.textContent = 'Выделите код для копирования'; }
        setTimeout(() => { button.textContent = 'Копировать'; }, 2500);
      });
      block.append(button);
    });
  }
})();

/* Keep short Russian prepositions with the following word. */
(() => {
  const words = 'в|во|к|ко|с|со|у|о|об|обо|на|по|из|от|до|за|для|при|без|над|под|про';
  const within = new RegExp('(^|[\\s(\\[«„“])(' + words + ')([ \\t]+)(?=\\S)', 'giu');
  const ending = new RegExp('(?:^|[\\s(\\[«„“])(' + words + ')([ \\t]*)$', 'iu');
  const ignored = 'script,style,pre,code,kbd,samp,textarea,input,select,svg,math,[data-no-typography]';
  const blockSelector = 'p,h1,h2,h3,h4,h5,h6,li,figcaption,blockquote,td,th,div,section,article,nav,button';
  function keepPrepositions(text) {
    return text.replace(within, (_, before, word) => before + word + '\u00a0');
  }
  function eligible(node) {
    const el = node.parentElement;
    if (!el || el.closest(ignored)) return false;
    const editable = el.closest('[contenteditable="true"]');
    return !editable || !(editable === document.activeElement || editable.contains(document.activeElement));
  }
  function applyTypography(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!eligible(node)) continue;
      const value = keepPrepositions(node.data);
      if (value !== node.data) node.data = value;
      nodes.push(node);
    }
    for (let i = 0; i < nodes.length - 1; i++) {
      const left = nodes[i], right = nodes[i + 1];
      const match = left.data.match(ending);
      if (!match || !right.data || left.parentElement.closest(blockSelector) !== right.parentElement.closest(blockSelector)) continue;
      const range = document.createRange();
      range.setStartAfter(left); range.setEndBefore(right);
      if (range.cloneContents().querySelector('br')) continue;
      if (match[2] && /^\S/.test(right.data)) {
        left.data = left.data.replace(/[ \t]+$/, '\u00a0');
      } else if (/^[ \t]+\S/.test(right.data)) {
        right.data = right.data.replace(/^[ \t]+/, '\u00a0');
      } else if (/^[ \t]+$/.test(right.data) && nodes[i + 2] &&
          right.parentElement.closest(blockSelector) === nodes[i + 2].parentElement.closest(blockSelector)) {
        right.data = '\u00a0';
      }
    }
  }
  window.CourseDesign = window.CourseDesign || {};
  Object.assign(window.CourseDesign, { keepPrepositions, applyTypography });
  let queued = false;
  const observer = new MutationObserver(() => schedule());
  function observe() { observer.observe(document.body, { subtree:true, childList:true, characterData:true }); }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false; observer.disconnect();
      applyTypography(); observe();
    });
  }
  applyTypography(); observe();
  document.addEventListener('focusout', schedule);
})();
