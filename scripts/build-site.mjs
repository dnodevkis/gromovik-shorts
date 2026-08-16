import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import matter from 'gray-matter';
import { marked } from 'marked';

const rootDir = process.cwd();
const outputDir = path.resolve(rootDir, 'dist');
const repositoryUrl = 'https://github.com/dnodevkis/gromovik-shorts';
const siteUrl = 'https://dnodevkis.github.io/gromovik-shorts/';
const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

if (!outputDir.startsWith(`${path.resolve(rootDir)}${path.sep}`)) {
  throw new Error(`Unsafe output directory: ${outputDir}`);
}

marked.setOptions({
  gfm: true,
  breaks: false,
});

const coreFiles = [
  '01_Проект_и_продукт.md',
  '02_Канон_мира_и_Веда.md',
  '03_Сценический_язык.md',
  '04_Форматы_и_рубрики.md',
  '05_Маркетинговая_система.md',
  '06_Производство_и_публикация.md',
  '07_Решения_и_бэклог.md',
];

const workflowFiles = [
  'Публикации/README.md',
  'Съёмочные_дни/README.md',
  'Связи_с_играми/README.md',
  'Шаблоны/T-001_Карточка_сценария.md',
  'Шаблоны/T-002_Карточка_публикации.md',
  'Шаблоны/T-003_Съёмочный_лист.md',
  'Шаблоны/T-004_Связь_с_игровым_модулем.md',
  'Шаблоны/T-005_Библиотека_CTA.md',
];

const scenarioNames = (await fs.readdir(path.join(rootDir, 'Сценарии')))
  .filter((name) => /^S-\d+.*\.md$/u.test(name))
  .sort(collator.compare);

const scenarioFiles = scenarioNames.map((name) => `Сценарии/${name}`);

const sourceItems = [
  { source: 'site/index.md', output: 'index.html', section: 'Обзор', navTitle: 'Главная' },
  { source: '08_Реестр_сценариев.md', output: '08_Реестр_сценариев.html', section: 'Обзор', navTitle: 'Реестр сценариев' },
  ...scenarioFiles.map((source) => ({ source, output: replaceMd(source), section: 'Сценарии' })),
  ...coreFiles.map((source) => ({ source, output: replaceMd(source), section: 'Система' })),
  ...workflowFiles.map((source) => ({ source, output: replaceMd(source), section: 'Рабочий процесс' })),
];

const records = [];

for (const item of sourceItems) {
  const absoluteSource = path.join(rootDir, fromPosix(item.source));
  const raw = await fs.readFile(absoluteSource, 'utf8');
  const parsed = matter(raw);
  const title = item.navTitle || displayTitle(parsed.data, parsed.content, item.source);

  records.push({
    ...item,
    raw,
    content: parsed.content,
    data: parsed.data,
    title,
  });
}

const scenarios = records.filter((record) => record.source.startsWith('Сценарии/'));
const scenarioIndex = {
  output: 'Сценарии/index.html',
  section: 'Сценарии',
  title: 'Все сценарии',
  navTitle: 'Все сценарии',
  virtual: true,
};

const navRecords = [records[0], records[1], scenarioIndex, ...records.slice(2)];
const outputBySource = new Map(records.map((record) => [normalizeSource(record.source), record.output]));

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(path.join(outputDir, 'assets'), { recursive: true });
await fs.copyFile(path.join(rootDir, 'site', 'styles.css'), path.join(outputDir, 'assets', 'styles.css'));
await fs.copyFile(path.join(rootDir, 'site', 'client.js'), path.join(outputDir, 'assets', 'client.js'));
await fs.writeFile(path.join(outputDir, '.nojekyll'), '', 'utf8');

const counts = {
  scenarioCount: scenarios.length,
  readyCount: scenarios.filter((record) => record.data.status === 'готов к читке').length,
  draftCount: scenarios.filter((record) => record.data.status !== 'готов к читке').length,
};

for (const record of records) {
  let markdown = record.content;

  if (record.source === 'site/index.md') {
    markdown = markdown
      .replaceAll('{{SCENARIO_COUNT}}', String(counts.scenarioCount))
      .replaceAll('{{READY_COUNT}}', String(counts.readyCount))
      .replaceAll('{{DRAFT_COUNT}}', String(counts.draftCount));
  }

  const rendered = await marked.parse(markdown);
  const bodyHtml = rewriteMarkdownLinks(rendered, record);
  await writePage(record, bodyHtml);
}

await writePage(scenarioIndex, renderScenarioIndex());
await writeNotFound();
await writeSupportFiles();

console.log(`Built ${records.length + 2} HTML pages in ${path.relative(rootDir, outputDir)}.`);
console.log(`Published navigation includes ${scenarios.length} scenario cards.`);

async function writePage(record, bodyHtml) {
  const destination = path.join(outputDir, fromPosix(record.output));
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const html = pageTemplate(record, bodyHtml);
  await fs.writeFile(destination, html, 'utf8');
}

function pageTemplate(record, bodyHtml) {
  const assetPrefix = relativeHref(record.output, '');
  const cssHref = joinHref(assetPrefix, 'assets/styles.css');
  const jsHref = joinHref(assetPrefix, 'assets/client.js');
  const homeHref = relativeHref(record.output, 'index.html');
  const description = escapeAttribute(record.data?.description || summaryFromMarkdown(record.content || '') || 'Материалы шортсов «Громовика»');
  const pageTitle = record.output === 'index.html' ? 'Громовик — шортсы' : `${record.title} · Громовик`;
  const canonical = new URL(encodePath(record.output), siteUrl).toString();
  const metadata = renderMetadata(record.data || {});
  const breadcrumb = record.section && record.output !== 'index.html'
    ? `<div class="breadcrumb"><a href="${homeHref}">Главная</a> / ${escapeHtml(record.section)}</div>`
    : '';
  const sourceLink = record.source
    ? `<a href="${repositoryUrl}/blob/main/${encodePath(record.source)}">Исходный Markdown</a>`
    : `<a href="${repositoryUrl}">Репозиторий</a>`;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#211d1b">
  <link rel="canonical" href="${canonical}">
  <link rel="stylesheet" href="${cssHref}">
  <title>${escapeHtml(pageTitle)}</title>
</head>
<body>
  <div class="layout">
    ${renderSidebar(record)}
    <main class="page">
      <div class="mobile-bar">
        <strong>Громовик · шортсы</strong>
        <button type="button" data-nav-toggle aria-expanded="false" aria-label="Открыть навигацию">Меню</button>
      </div>
      <div class="content-shell">
        ${breadcrumb}
        ${metadata}
        <article class="prose">${bodyHtml}</article>
        <footer class="page-footer">
          <span>Рабочее пространство шортсов «Громовика»</span>
          ${sourceLink}
        </footer>
      </div>
    </main>
  </div>
  <script src="${jsHref}" defer></script>
</body>
</html>`;
}

function renderSidebar(current) {
  const sections = [...new Set(navRecords.map((record) => record.section))];
  const groups = sections.map((section) => {
    const items = navRecords
      .filter((record) => record.section === section)
      .map((record) => {
        const href = relativeHref(current.output, record.output);
        const active = current.output === record.output ? ' aria-current="page"' : '';
        return `<li data-nav-item><a class="nav-link" href="${href}"${active}>${escapeHtml(record.navTitle || record.title)}</a></li>`;
      })
      .join('\n');

    return `<nav class="nav-group" data-nav-group aria-label="${escapeAttribute(section)}">
      <p class="nav-group__title">${escapeHtml(section)}</p>
      <ul class="nav-list">${items}</ul>
    </nav>`;
  }).join('\n');

  const homeHref = relativeHref(current.output, 'index.html');

  return `<aside class="sidebar">
    <a class="brand" href="${homeHref}">
      <span class="brand__mark" aria-hidden="true">Г</span>
      <span class="brand__text"><strong>Громовик</strong><span>Шортсы с Ведой</span></span>
    </a>
    <input class="nav-search" type="search" data-nav-search placeholder="Найти материал" aria-label="Фильтр навигации">
    ${groups}
  </aside>`;
}

function renderMetadata(data) {
  if (!data.id && !data.status && !data.primary_goal) return '';

  const badges = [];
  if (data.id) badges.push(`<span class="badge">${escapeHtml(String(data.id))}</span>`);
  if (data.status) badges.push(`<span class="badge">${escapeHtml(String(data.status))}</span>`);
  if (data.primary_goal) badges.push(`<span class="badge badge--goal">${escapeHtml(String(data.primary_goal))}</span>`);
  if (data.estimated_duration) badges.push(`<span class="badge">${escapeHtml(String(data.estimated_duration))}</span>`);

  return `<div class="metadata">${badges.join('')}</div>`;
}

function renderScenarioIndex() {
  const cards = scenarios.map((scenario) => {
    const href = path.posix.basename(scenario.output);
    const summary = escapeHtml(extractStrategicRole(scenario.content));
    return `<a class="scenario-card" href="${encodePath(href)}">
      <span class="scenario-card__id">${escapeHtml(String(scenario.data.id || 'Сценарий'))}</span>
      <strong>${escapeHtml(String(scenario.data.title || scenario.title))}</strong>
      <span class="scenario-card__summary">${summary}</span>
      <span class="scenario-card__meta">
        <span>${escapeHtml(String(scenario.data.primary_goal || '—'))}</span>
        <span>${escapeHtml(String(scenario.data.status || '—'))}</span>
      </span>
    </a>`;
  }).join('\n');

  return `<h1>Сценарии</h1>
  <p>Актуальные режиссёрские карточки: полный текст, действие в настоящем, хронометраж, CTA и реквизит.</p>
  <div class="scenario-grid">${cards}</div>`;
}

function rewriteMarkdownLinks(html, record) {
  return html.replace(/href="([^"]+\.md)(#[^"]*)?"/giu, (match, target, hash = '') => {
    if (/^(?:https?:|mailto:)/iu.test(target)) return match;

    const decodedTarget = decodeURIComponent(target);
    const sourceTarget = normalizeSource(path.posix.join(path.posix.dirname(record.source), decodedTarget));
    const outputTarget = outputBySource.get(sourceTarget);
    if (!outputTarget) return match;

    return `href="${relativeHref(record.output, outputTarget)}${hash}"`;
  });
}

async function writeNotFound() {
  const record = { output: '404.html', title: 'Страница не найдена', section: 'Обзор', virtual: true };
  const body = `<h1>Страница не найдена</h1><p>Материал мог быть переименован или перенесён.</p><p><a href="index.html">Вернуться на главную</a></p>`;
  await writePage(record, body);
}

async function writeSupportFiles() {
  const urls = navRecords.map((record) => new URL(encodePath(record.output), siteUrl).toString());
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
  await fs.writeFile(path.join(outputDir, 'sitemap.xml'), sitemap, 'utf8');
  await fs.writeFile(path.join(outputDir, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${siteUrl}sitemap.xml\n`, 'utf8');
}

function displayTitle(data, content, source) {
  if (data.id && data.title) return `${data.id} — ${data.title}`;
  if (data.title) return String(data.title);
  const match = content.match(/^#\s+(.+)$/mu);
  if (match) return match[1].replaceAll('`', '').trim();
  return path.posix.basename(source, '.md').replaceAll('_', ' ');
}

function extractStrategicRole(content) {
  const match = content.match(/## Стратегическая роль\s+([\s\S]*?)(?=\n## |$)/u);
  const source = match?.[1] || content;
  return summaryFromMarkdown(source) || 'Открыть карточку сценария.';
}

function summaryFromMarkdown(markdown) {
  return markdown
    .replace(/^---[\s\S]*?---/u, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[`*_>#\[\]()|]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 190);
}

function replaceMd(source) {
  return source.replace(/\.md$/iu, '.html');
}

function normalizeSource(source) {
  return path.posix.normalize(source.replaceAll('\\', '/'));
}

function fromPosix(value) {
  return value.split('/').join(path.sep);
}

function relativeHref(fromOutput, toOutput) {
  const fromDir = path.posix.dirname(fromOutput);
  const target = toOutput || '.';
  const relative = path.posix.relative(fromDir, target) || path.posix.basename(target);
  return encodePath(relative);
}

function joinHref(prefix, suffix) {
  return encodePath(path.posix.join(decodeURIComponent(prefix), suffix));
}

function encodePath(value) {
  return value.split('/').map((segment) => encodeURIComponent(decodeURIComponent(segment))).join('/');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll('&#039;', '&apos;');
}

