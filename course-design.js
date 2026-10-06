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
