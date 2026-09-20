const topics = window.COURSE_TOPICS || [];
const cls = t => t === 'Актуально' ? 'actual' : t === 'Теория' ? 'theory' : t === 'Практика' ? 'practice' : t === 'Софт' ? 'soft' : t === 'Д/з' ? 'home' : t === 'Курсовая работа' ? 'coursework' : '';
const list = document.querySelector('#topicList');
if (list) {
  list.innerHTML = topics.map((topic, i) => {
    const vars = `--x:${35 + (i*17)%45}%;--y:${28 + (i*23)%46}%;--r:${(i*37)%360}deg;--rot:${-28 + (i*19)%56}deg`;
    return `<a class="topic" href="lectures/${topic.slug}.html" style="color:inherit;text-decoration:none">
      <div class="thumb" style="${vars}"></div>
      <div class="topic-title">${topic.title}</div>
      <div class="tags">${(Array.isArray(topic.tags) ? topic.tags : []).map(t => `<span class="tag ${cls(t)}">${t}</span>`).join('')}</div>
      <div class="go">›</div>
    </a>`;
  }).join('');
}

const track = document.querySelector('.link-track');
const next = document.querySelector('.scroll-next');
if (track && next) {
  const updateArrow = () => {
    const canScroll = track.scrollWidth > track.clientWidth + 8;
    next.hidden = !canScroll;
  };
  next.onclick = () => track.scrollBy({left: Math.max(260, track.clientWidth * .75), behavior:'smooth'});
  addEventListener('resize', updateArrow);
  requestAnimationFrame(updateArrow);
}

// Hero: low-resolution animated ambient light + soft directional rim lighting on the exact logo.
const motionHero = document.getElementById('motionHero');
const ambientCanvas = document.getElementById('motionAmbient');
const logoWrap = document.getElementById('motionLogoWrap');
const logoCanvas = document.getElementById('motionLogoLight');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- animated ambient glows ----------
if (motionHero && ambientCanvas && !reduceMotion) {
  const ambientCtx = ambientCanvas.getContext('2d', { alpha: true });
  let aw = 0;
  let ah = 0;
  let lastAmbientFrame = 0;

  function resizeAmbient() {
    const rect = motionHero.getBoundingClientRect();
    const scale = Math.min(0.58, 900 / Math.max(1, rect.width));
    aw = Math.max(380, Math.round(rect.width * scale));
    ah = Math.max(180, Math.round(rect.height * scale));
    ambientCanvas.width = aw;
    ambientCanvas.height = ah;
  }

  function rgba(rgb, a) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  }

  function drawBlob(x, y, rx, ry, rotation, rgb, alpha) {
    ambientCtx.save();
    ambientCtx.translate(x * aw, y * ah);
    ambientCtx.rotate(rotation);
    ambientCtx.scale(rx * aw, ry * ah);
    const g = ambientCtx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba(rgb, alpha));
    g.addColorStop(0.32, rgba(rgb, alpha * 0.72));
    g.addColorStop(0.68, rgba(rgb, alpha * 0.28));
    g.addColorStop(1, rgba(rgb, 0));
    ambientCtx.fillStyle = g;
    ambientCtx.beginPath();
    ambientCtx.arc(0, 0, 1, 0, Math.PI * 2);
    ambientCtx.fill();
    ambientCtx.restore();
  }

  function drawAmbient(ms) {
    requestAnimationFrame(drawAmbient);
    if (ms - lastAmbientFrame < 33) return; // ~30fps, visibly alive but still light.
    lastAmbientFrame = ms;
    if (!aw || !ah) return;

    const t = ms / 1000;
    ambientCtx.clearRect(0, 0, aw, ah);
    ambientCtx.globalCompositeOperation = 'screen';

    drawBlob(
      0.10 + Math.sin(t * 0.62) * 0.18,
      0.15 + Math.cos(t * 0.54) * 0.16,
      0.34 + Math.sin(t * 0.26) * 0.025, 0.32 + Math.cos(t * 0.22) * 0.02,
      Math.sin(t * 0.33) * 0.72,
      [228, 84, 31], 0.22
    );
    drawBlob(
      0.87 + Math.sin(t * 0.56 + 1.6) * 0.18,
      0.16 + Math.cos(t * 0.48 + 0.8) * 0.15,
      0.33 + Math.cos(t * 0.24) * 0.02, 0.34 + Math.sin(t * 0.21) * 0.02,
      Math.cos(t * 0.30) * 0.65,
      [46, 92, 182], 0.20
    );
    drawBlob(
      0.81 + Math.sin(t * 0.71 + 2.4) * 0.21,
      0.84 + Math.cos(t * 0.58 + 1.2) * 0.15,
      0.31 + Math.sin(t * 0.18) * 0.015, 0.24 + Math.cos(t * 0.22) * 0.02,
      Math.sin(t * 0.38) * 0.85,
      [200, 70, 31], 0.18
    );
    drawBlob(
      0.16 + Math.sin(t * 0.64 + 4.1) * 0.20,
      0.84 + Math.cos(t * 0.51 + 2.7) * 0.16,
      0.31 + Math.cos(t * 0.19) * 0.015, 0.24 + Math.sin(t * 0.20) * 0.018,
      Math.cos(t * 0.35) * 0.75,
      [33, 72, 148], 0.17
    );
    drawBlob(
      0.52 + Math.sin(t * 0.48 + 2.0) * 0.22,
      0.56 + Math.cos(t * 0.42 + 3.0) * 0.13,
      0.23 + Math.sin(t * 0.16) * 0.01, 0.17 + Math.cos(t * 0.17) * 0.01,
      Math.sin(t * 0.28) * 0.90,
      [173, 60, 29], 0.09
    );
  }

  resizeAmbient();
  addEventListener('resize', resizeAmbient, { passive: true });
  requestAnimationFrame(drawAmbient);
}

// ---------- directional + inner glow on the logo ----------
if (motionHero && logoWrap && logoCanvas && !reduceMotion) {
  const ctx = logoCanvas.getContext('2d', { alpha: true });
  const mask = new Image();
  mask.src = 'assets/images/logo-mask-crop.png?v=15';

  const fillCanvas = document.createElement('canvas');
  const fillCtx = fillCanvas.getContext('2d', { alpha: true });

  let dpr = 1;
  let pw = 0;
  let ph = 0;
  let targetVX = -1;
  let targetVY = 0;
  let currentVX = -1;
  let currentVY = 0;
  let targetIntensity = 0;
  let currentIntensity = 0;
  let targetInner = 0;
  let currentInner = 0;
  let targetCenterX = 0.5;
  let targetCenterY = 0.5;
  let currentCenterX = 0.5;
  let currentCenterY = 0.5;
  let lightingFrame = null;

  function resizeLogoLight() {
    const rect = logoWrap.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.4);
    pw = Math.max(1, Math.round(rect.width * dpr));
    ph = Math.max(1, Math.round(rect.height * dpr));
    logoCanvas.width = pw;
    logoCanvas.height = ph;
    fillCanvas.width = pw;
    fillCanvas.height = ph;
    drawLogoLight();
  }

  function drawMaskedGradient(drawFn) {
    fillCtx.clearRect(0, 0, pw, ph);
    fillCtx.drawImage(mask, 0, 0, pw, ph);
    fillCtx.globalCompositeOperation = 'source-in';
    drawFn();
    fillCtx.globalCompositeOperation = 'source-over';
  }

  function drawLogoLight() {
    if (!mask.complete || !mask.naturalWidth || !pw || !ph) return;
    ctx.clearRect(0, 0, pw, ph);
    if (currentIntensity < 0.003 && currentInner < 0.003) return;

    const cx = pw * currentCenterX;
    const cy = ph * currentCenterY;
    const span = Math.max(pw, ph) * 0.95;

    // Whole-form directional brightening: same logo gradient, just brighter on the lit side.
    drawMaskedGradient(() => {
      const g = fillCtx.createLinearGradient(
        cx - currentVX * span,
        cy - currentVY * span,
        cx + currentVX * span,
        cy + currentVY * span
      );
      g.addColorStop(0, 'rgba(120,44,18,0.02)');
      g.addColorStop(0.38, 'rgba(191,76,31,0.12)');
      g.addColorStop(0.70, 'rgba(236,104,42,0.40)');
      g.addColorStop(1, 'rgba(255,194,122,0.68)');
      fillCtx.fillStyle = g;
      fillCtx.fillRect(0, 0, pw, ph);
    });

    ctx.save();
    ctx.globalAlpha = currentIntensity * 0.72;
    ctx.filter = `blur(${Math.max(4, 5.2 * dpr)}px)`;
    ctx.drawImage(fillCanvas, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = currentIntensity * 0.40;
    ctx.filter = `blur(${Math.max(1.2, 1.8 * dpr)}px)`;
    ctx.drawImage(fillCanvas, 0, 0);
    ctx.restore();

    // Inner glow when the pointer is closer to the center of the mark.
    if (currentInner > 0.002) {
      drawMaskedGradient(() => {
        const rg = fillCtx.createRadialGradient(
          cx, cy, 0,
          cx, cy, Math.max(pw, ph) * 0.62
        );
        rg.addColorStop(0, 'rgba(255,216,153,0.95)');
        rg.addColorStop(0.16, 'rgba(255,176,97,0.70)');
        rg.addColorStop(0.36, 'rgba(229,103,44,0.31)');
        rg.addColorStop(0.72, 'rgba(140,56,26,0.05)');
        rg.addColorStop(1, 'rgba(140,56,26,0)');
        fillCtx.fillStyle = rg;
        fillCtx.fillRect(0, 0, pw, ph);
      });

      ctx.save();
      ctx.globalAlpha = currentInner * 0.48;
      ctx.filter = `blur(${Math.max(6, 7 * dpr)}px)`;
      ctx.drawImage(fillCanvas, 0, 0);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = currentInner * 0.24;
      ctx.filter = `blur(${Math.max(2, 2.8 * dpr)}px)`;
      ctx.drawImage(fillCanvas, 0, 0);
      ctx.restore();
    }
  }

  function animateLighting() {
    const lerp = 0.14;
    currentVX += (targetVX - currentVX) * lerp;
    currentVY += (targetVY - currentVY) * lerp;
    const len = Math.hypot(currentVX, currentVY) || 1;
    currentVX /= len;
    currentVY /= len;

    currentIntensity += (targetIntensity - currentIntensity) * 0.14;
    currentInner += (targetInner - currentInner) * 0.16;
    currentCenterX += (targetCenterX - currentCenterX) * 0.14;
    currentCenterY += (targetCenterY - currentCenterY) * 0.14;
    drawLogoLight();

    const delta = Math.abs(targetIntensity - currentIntensity) + Math.abs(targetInner - currentInner) + Math.abs(targetCenterX - currentCenterX) + Math.abs(targetCenterY - currentCenterY) + Math.abs(targetVX - currentVX) + Math.abs(targetVY - currentVY);
    if (delta > 0.003) lightingFrame = requestAnimationFrame(animateLighting);
    else lightingFrame = null;
  }

  function wakeLighting() {
    if (!lightingFrame) lightingFrame = requestAnimationFrame(animateLighting);
  }

  mask.onload = resizeLogoLight;
  addEventListener('resize', resizeLogoLight, { passive: true });

  motionHero.addEventListener('pointerenter', event => {
    const r = logoWrap.getBoundingClientRect();
    const nx = (event.clientX - r.left) / r.width;
    const ny = (event.clientY - r.top) / r.height;
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const l = Math.hypot(dx, dy) || 1;
    targetVX = dx / l;
    targetVY = dy / l;
    currentVX = targetVX;
    currentVY = targetVY;
    targetIntensity = 0.94;
    targetInner = 0.22;
    targetCenterX = Math.max(0.18, Math.min(0.82, nx));
    targetCenterY = Math.max(0.14, Math.min(0.86, ny));
    wakeLighting();
  }, { passive: true });

  motionHero.addEventListener('pointermove', event => {
    const r = logoWrap.getBoundingClientRect();
    const nx = (event.clientX - r.left) / r.width;
    const ny = (event.clientY - r.top) / r.height;
    const dx = nx - 0.5;
    const dy = ny - 0.5;
    const distance = Math.hypot(dx, dy);
    const l = Math.hypot(dx, dy) || 1;
    targetVX = dx / l;
    targetVY = dy / l;
    targetCenterX = Math.max(0.14, Math.min(0.86, nx));
    targetCenterY = Math.max(0.12, Math.min(0.88, ny));

    const proximity = Math.max(0, Math.min(1, 1 - distance / 1.08));
    const centerBoost = Math.max(0, Math.min(1, 1 - distance / 0.33));

    targetIntensity = 0.60 + proximity * 0.40;
    targetInner = 0.14 + centerBoost * 0.86;
    wakeLighting();
  }, { passive: true });

  motionHero.addEventListener('pointerleave', () => {
    targetIntensity = 0;
    targetInner = 0;
    wakeLighting();
  });
}

