const body = document.body;
const navToggle = document.querySelector('[data-nav-toggle]');
const sidebar = document.querySelector('.sidebar');
const search = document.querySelector('[data-nav-search]');

navToggle?.addEventListener('click', () => {
  const isOpen = body.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

document.addEventListener('click', (event) => {
  if (!body.classList.contains('nav-open')) return;
  if (sidebar?.contains(event.target) || navToggle?.contains(event.target)) return;
  body.classList.remove('nav-open');
  navToggle?.setAttribute('aria-expanded', 'false');
});

search?.addEventListener('input', () => {
  const query = search.value.trim().toLocaleLowerCase('ru');

  document.querySelectorAll('[data-nav-item]').forEach((item) => {
    const haystack = item.textContent.toLocaleLowerCase('ru');
    item.hidden = query.length > 0 && !haystack.includes(query);
  });

  document.querySelectorAll('[data-nav-group]').forEach((group) => {
    const visibleItem = [...group.querySelectorAll('[data-nav-item]')]
      .some((item) => !item.hidden);
    group.hidden = !visibleItem;
  });
});

document.querySelectorAll('.prose table').forEach((table) => {
  if (table.parentElement?.classList.contains('table-wrap')) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrap';
  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);
});

document.querySelectorAll('.prose a[href^="http"]').forEach((link) => {
  link.target = '_blank';
  link.rel = 'noreferrer';
});

