const $ = (selector) => document.querySelector(selector);
const state = { releases: [], keyword: '', scope: 'all', ministry: '' };
const palette = [
  { color: '#2c6087', light: '#edf3f8' },
  { color: '#347976', light: '#edf6f3' },
  { color: '#786849', light: '#f6f2e9' },
];

function normalize(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
}

function stripMarkdown(text) {
  return text.replace(/^#{1,6}\s+.+$/gm, '').replace(/^\s*---\s*$/gm, '')
    .replace(/\*\*/g, '').replace(/<!--[^]*?-->/g, '').trim();
}

function summaryOf(body) {
  const first = stripMarkdown(body).split(/\n\s*\n/)[0].replace(/\s+/g, ' ');
  const chars = Array.from(first);
  return chars.length > 155 ? chars.slice(0, 155).join('') + '…' : first;
}

function factValues(body) {
  const text = stripMarkdown(body);
  const personnel = text.match(/([\d,]+)명/);
  const budget = text.match(/([\d,]+)억원/);
  const times = [...text.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((match) => match[0]);
  const responseTime = times.find((value) => value.startsWith('16:'));
  const regions = text.match(/(\d+)개\s*광역/);
  const casualties = text.match(/인명피해는\s*([\d,]+)명/);
  return [
    personnel ? personnel[1] + '명' : '미기재',
    budget ? budget[1] + '억원' : '미기재',
    responseTime || '미기재',
    regions ? regions[1] + '개 광역' : '미기재',
    casualties ? casualties[1] + '명' : '미기재',
  ];
}

function highlighted(container, text, query) {
  // Work with text nodes only: the data and search input never become HTML.
  if (!query) { container.textContent = text; return; }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'giu');
  let end = 0;
  for (const match of text.matchAll(regex)) {
    container.append(document.createTextNode(text.slice(end, match.index)));
    const mark = document.createElement('mark');
    mark.textContent = match[0];
    container.append(mark);
    end = match.index + match[0].length;
  }
  container.append(document.createTextNode(text.slice(end)));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeCard(release, index) {
  const theme = palette[index % palette.length];
  const article = element('article', 'release-card');
  article.style.setProperty('--card-color', theme.color);
  article.style.setProperty('--badge-bg', theme.light);
  article.append(element('div', 'card-topline'));
  const content = element('div', 'card-content');
  const meta = element('div', 'card-meta');
  const badge = element('span', 'ministry-badge');
  highlighted(badge, release.부처, state.scope !== 'body' ? state.keyword : '');
  meta.append(badge, element('span', 'card-number', `NO. ${String(release.번호).padStart(2, '0')}`));
  const title = element('h3', '', release.제목);
  const summary = element('p', 'card-summary');
  highlighted(summary, summaryOf(release.본문), state.scope !== 'ministry' ? state.keyword : '');
  const facts = element('div', 'card-facts');
  const values = factValues(release.본문);
  ['동원인원', '투입예산'].forEach((label, i) => {
    const fact = element('div', 'fact');
    fact.append(element('span', 'fact-label', label), element('span', 'fact-value', values[i]));
    facts.append(fact);
  });
  content.append(meta, title, summary, facts);
  const open = element('button', 'card-action', '보도자료 원문 보기');
  open.type = 'button';
  open.setAttribute('aria-label', `${release.부처} 보도자료 원문 보기`);
  const arrow = element('span', '', '↗');
  arrow.setAttribute('aria-hidden', 'true');
  open.append(arrow);
  open.addEventListener('click', () => openRelease(release));
  article.append(content, open);
  return article;
}

function render() {
  const query = normalize(state.keyword);
  const matches = state.releases.filter((release) => {
    if (state.ministry && release.부처 !== state.ministry) return false;
    if (!query) return true;
    const ministryMatch = normalize(release.부처).includes(query);
    const bodyMatch = normalize(release.본문).includes(query);
    return state.scope === 'ministry' ? ministryMatch : state.scope === 'body' ? bodyMatch : ministryMatch || bodyMatch;
  });
  $('#cards').replaceChildren(...matches.map((release) => makeCard(release, state.releases.indexOf(release))));
  $('#result-count').replaceChildren(document.createTextNode('결과 '), element('b', '', String(matches.length)), document.createTextNode('건'));
  $('#empty-state').hidden = matches.length !== 0;
  $('#clear-search').hidden = state.keyword.length === 0;
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    const active = chip.dataset.ministry === state.ministry;
    chip.classList.toggle('active', active);
    chip.setAttribute('aria-pressed', String(active));
  });
}

function renderComparison() {
  const header = element('tr');
  const first = element('th', '', '항목');
  first.scope = 'col';
  header.append(first);
  state.releases.forEach((release) => {
    const th = element('th', '', release.부처);
    th.scope = 'col';
    header.append(th);
  });
  $('#comparison-head').replaceChildren(header);
  const values = state.releases.map((release) => factValues(release.본문));
  const rows = ['동원인원', '투입예산', '중대본 가동·지원 시각', '관할·대응지역 수', '인명피해'].map((label, rowIndex) => {
    const row = element('tr');
    const heading = element('th', '', label);
    heading.scope = 'row';
    row.append(heading, ...values.map((value) => element('td', '', value[rowIndex])));
    return row;
  });
  $('#comparison-body').replaceChildren(...rows);
}

function openRelease(release) {
  const index = state.releases.indexOf(release);
  const theme = palette[index % palette.length];
  const dialog = $('#release-dialog');
  dialog.style.setProperty('--card-color', theme.color);
  dialog.style.setProperty('--badge-bg', theme.light);
  $('#dialog-ministry').textContent = release.부처;
  $('#dialog-title').textContent = release.제목;
  const paragraphs = stripMarkdown(release.본문).split(/\n\s*\n/).map((text) => element('p', '', text));
  $('#dialog-body').replaceChildren(...paragraphs);
  dialog.showModal();
  dialog.scrollTop = 0;
}

function resetFilters() {
  state.keyword = '';
  state.scope = 'all';
  state.ministry = '';
  $('#keyword').value = '';
  $('#search-scope').value = 'all';
  render();
  $('#keyword').focus();
}

async function loadData() {
  $('#load-error').hidden = true;
  $('#empty-state').hidden = true;
  $('#cards').setAttribute('aria-busy', 'true');
  $('#result-count').textContent = '자료를 불러오는 중…';
  const controls = [...document.querySelectorAll('#search-form input, #search-form select, #search-form button, .filter-chip')];
  controls.forEach((control) => { control.disabled = true; });
  try {
    const response = await fetch('./data/보도자료데이터.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data) || !data.every((item) => item && ['번호', '부처', '제목', '본문'].every((key) => typeof item[key] === 'string' || (key === '번호' && typeof item[key] === 'number')))) {
      throw new Error('보도자료 JSON 형식이 올바르지 않습니다.');
    }
    state.releases = data;
    const filters = $('#ministry-filters');
    filters.querySelectorAll('[data-ministry]:not([data-ministry=""])').forEach((node) => node.remove());
    [...new Set(data.map((release) => release.부처))].forEach((ministry) => {
      const button = element('button', 'filter-chip', ministry);
      button.type = 'button';
      button.dataset.ministry = ministry;
      button.setAttribute('aria-pressed', 'false');
      filters.append(button);
    });
    render();
    renderComparison();
  } catch (error) {
    state.releases = [];
    $('#cards').replaceChildren();
    $('#comparison-body').replaceChildren();
    $('#load-error').hidden = false;
    $('#result-count').textContent = '자료 불러오기 실패';
    console.error('보도자료 로딩 실패:', error);
  } finally {
    controls.forEach((control) => { control.disabled = state.releases.length === 0; });
    $('#cards').setAttribute('aria-busy', 'false');
  }
}

$('#search-form').addEventListener('submit', (event) => { event.preventDefault(); render(); });
$('#keyword').addEventListener('input', (event) => { state.keyword = event.target.value.trim(); render(); });
$('#search-scope').addEventListener('change', (event) => { state.scope = event.target.value; render(); });
$('#ministry-filters').addEventListener('click', (event) => {
  const chip = event.target.closest('button[data-ministry]');
  if (!chip) return;
  state.ministry = chip.dataset.ministry;
  render();
});
$('#clear-search').addEventListener('click', () => { state.keyword = ''; $('#keyword').value = ''; render(); $('#keyword').focus(); });
$('#reset-filters').addEventListener('click', resetFilters);
$('#retry-load').addEventListener('click', loadData);
$('#close-dialog').addEventListener('click', () => $('#release-dialog').close());
$('#dialog-done').addEventListener('click', () => $('#release-dialog').close());
$('#release-dialog').addEventListener('click', (event) => {
  if (event.target !== $('#release-dialog')) return;
  const bounds = event.target.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close();
});
$('#rain-image').addEventListener('error', () => { $('#image-fallback').hidden = false; });
loadData();
