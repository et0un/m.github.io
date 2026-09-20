window.COURSE_RESOURCES = [
  {slug:'lists', icon:'📚', title:'Списки и материалы'},
  {slug:'software', icon:'🖱️', title:'Программное обеспечение'},
  {slug:'exam', icon:'📕', title:'Экзамен и курсовая работа'},
  {slug:'contact', icon:'✍️', title:'Контакты'}
];

const resources = window.COURSE_RESOURCES || [];
const current = document.body.dataset.resource || '';
const nav = document.querySelector('#resourceNav');
if(nav){
  nav.innerHTML = resources.map(item => `<a href="${item.slug}.html" class="${item.slug===current?'is-active':''}" ${item.slug===current?'aria-current="page"':''}><span class="resource-emoji">${item.icon}</span><span class="resource-name">${item.title}</span></a>`).join('');
}
