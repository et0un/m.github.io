// ЕДИНСТВЕННЫЙ СПИСОК ТЕМ КУРСА.
// Порядок объектов здесь = порядок тем на сайте.
// Номера 01, 02, 03... и общее количество тем вычисляются автоматически.
// slug — постоянный идентификатор темы и имя HTML-файла без .html.
// title — название темы.
// tags — теги на главной и внутри лекции; можно оставить пустой массив [].

window.COURSE_TOPICS = [
  {slug:"01-history", title:"История анимации", tags:["Актуально", "Теория"]},
  {slug:"02-applications", title:"Области применения моушн-дизайна", tags:["Актуально", "Теория", "Практика"]},
  {slug:"03-disney-principles", title:"12 принципов анимации студии Уолта Диснея", tags:["Актуально", "Теория"]},
  {slug:"04-after-effects-basics", title:"Основы работы в After Effects: настройки, композиция, слои", tags:["Софт"]},
  {slug:"05-import-masks-shapes", title:"Импорт, маски, шейпы и экспрешены", tags:["Практика", "Софт"]},
  {slug:"06-homework-review", title:"Разбор домашнего задания", tags:["Практика", "Д/з"]},
  {slug:"07-keyframes", title:"Работа с ключевыми кадрами", tags:["Практика", "Софт"]},
  {slug:"08-graph-editor", title:"Графики скорости (Graph Editor)", tags:["Практика", "Софт"]},
  {slug:"09-kinetic-type", title:"Текстовая анимация", tags:["Практика", "Софт"]},
  {slug:"10-color-light", title:"Работа с цветом и светом", tags:["Теория", "Практика"]},
  {slug:"11-3d-ae", title:"3D в After Effects", tags:["Практика", "Софт"]},
  {slug:"12-transitions", title:"Выразительные переходы", tags:["Практика"]},
  {slug:"13-plugins", title:"Работа с плагинами", tags:["Софт"]},
  {slug:"14-logo-animation", title:"Анимация логотипов", tags:["Практика"]},
  {slug:"15-interface-animation", title:"Анимация интерфейсов", tags:["Практика"]},
  {slug:"16-kinetic-typography", title:"Кинетическая типографика", tags:["Практика"]},
  {slug:"17-sound-design", title:"Саунд-дизайн для моушн-дизайна", tags:["Теория", "Практика"]},
  {slug:"18-render-export", title:"Рендер и экспорт", tags:["Софт"]},
  {slug:"19-portfolio", title:"Подготовка портфолио", tags:["Практика"]},
  {slug:"20-project-review", title:"Разбор проектов", tags:["Практика"]},
  {slug:"21-freelance", title:"Фриланс и работа с заказчиками", tags:["Теория"]},
  {slug:"22-trends", title:"Тренды и вдохновение", tags:["Теория"]},
  {slug:"23-extra-techniques", title:"Дополнительные техники", tags:["Практика"]},
  {slug:"24-final-project", title:"Финальный проект", tags:["Практика", "Д/з"]},
  {slug:"25-course-summary", title:"Итоги курса", tags:["Теория"]}
];
