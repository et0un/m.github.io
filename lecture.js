const topics = window.COURSE_TOPICS || [];
const currentSlug = document.body.dataset.topic || '';

const cls = t => t === 'Актуально' ? 'actual'
  : t === 'Теория' ? 'theory'
  : t === 'Практика' ? 'practice'
  : t === 'Софт' ? 'soft'
  : t === 'Д/з' ? 'home'
  : t === 'Курсовая работа' ? 'coursework'
  : '';

const topicTags = topic => Array.isArray(topic?.tags) ? topic.tags : [];
const topicNumber = index => String(index + 1).padStart(2, '0');

function topicsWord(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'тема';
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'темы';
  return 'тем';
}

// Боковой список. Номер зависит только от позиции темы в topics.js.
const list = document.querySelector('#lectureTopics');
if (list) {
  list.innerHTML = topics.map((topic, i) => {
    const active = topic.slug === currentSlug ? ' is-active' : '';
    const vars = `--x:${35 + (i*17)%45}%;--y:${28 + (i*23)%46}%;--r:${(i*37)%360}deg;--rot:${-28 + (i*19)%56}deg`;
    return `<a class="sidebar-topic${active}" href="${topic.slug}.html" ${active ? 'aria-current="page"' : ''}>
      <span class="sidebar-number">${topicNumber(i)}</span>
      <span class="sidebar-thumb" style="${vars}"></span>
      <span class="sidebar-copy"><span class="sidebar-title">${topic.title}</span></span>
    </a>`;
  }).join('');
}

const currentIndex = topics.findIndex(t => t.slug === currentSlug);
const currentTopic = currentIndex >= 0 ? topics[currentIndex] : null;

// Количество тем в мобильной кнопке обновляется автоматически.
const countLabel = document.querySelector('.topics-toggle span');
if (countLabel) {
  countLabel.textContent = `${topics.length} ${topicsWord(topics.length)} · открыть`;
}

// Название, номер и теги текущей лекции берутся из topics.js.
if (currentTopic) {
  const kicker = document.querySelector('.lecture-kicker');
  if (kicker) kicker.textContent = `ТЕМА ${topicNumber(currentIndex)}`;

  const heading = document.querySelector('.lecture-article > h1');
  if (heading) heading.textContent = currentTopic.title;

  const tags = document.querySelector('.lecture-article > .tags');
  if (tags) {
    tags.innerHTML = topicTags(currentTopic)
      .map(tag => `<span class="tag ${cls(tag)}">${tag}</span>`)
      .join('');
    tags.hidden = topicTags(currentTopic).length === 0;
  }

  document.title = `${currentTopic.title} — Моушн-дизайн`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = `${currentTopic.title} — курс «Моушн-дизайн»`;
}

// Предыдущая / следующая — тоже по позиции темы в topics.js.
const prev = document.querySelector('#prevLecture');
const next = document.querySelector('#nextLecture');
if (prev) {
  if (currentIndex > 0) {
    prev.href = `${topics[currentIndex - 1].slug}.html`;
    prev.querySelector('span').textContent = topics[currentIndex - 1].title;
  } else {
    prev.hidden = true;
  }
}
if (next) {
  if (currentIndex >= 0 && currentIndex < topics.length - 1) {
    next.href = `${topics[currentIndex + 1].slug}.html`;
    next.querySelector('span').textContent = topics[currentIndex + 1].title;
  } else {
    next.hidden = true;
  }
}

// Мобильная боковая панель.
const sidebar = document.querySelector('.lecture-sidebar');
const backdrop = document.querySelector('.sidebar-backdrop');
const openButton = document.querySelector('.topics-toggle');
const closeButton = document.querySelector('.sidebar-close');
function setSidebar(open) {
  sidebar?.classList.toggle('is-open', open);
  backdrop?.classList.toggle('is-open', open);
  document.body.style.overflow = open ? 'hidden' : '';
  openButton?.setAttribute('aria-expanded', String(open));
}
openButton?.addEventListener('click', () => setSidebar(true));
closeButton?.addEventListener('click', () => setSidebar(false));
backdrop?.addEventListener('click', () => setSidebar(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') setSidebar(false); });
