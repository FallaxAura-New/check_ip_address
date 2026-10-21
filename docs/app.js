import { targetError, safeIp, countryCode, endpoint, browserProbe, fetchJson } from './probe.mjs';

const presets = [
  {
    id: 'ipify',
    name: 'ipify IPv4',
    domain: 'api.ipify.org',
    kind: 'probe',
    method: 'echo',
    path: '/?format=json',
  },
  {
    id: 'ipify6',
    name: 'ipify IPv4 / IPv6',
    domain: 'api64.ipify.org',
    kind: 'probe',
    method: 'echo',
    path: '/?format=json',
  },
  { id: 'ipinfo', name: 'IPinfo', domain: 'ipinfo.io', kind: 'probe', method: 'echo', path: '/json' },
  { id: 'ping0', name: 'Ping0', domain: 'ping0.cc', kind: 'probe', method: 'ping0', path: '/geo' },
  { id: 'icanhazip', name: 'icanhazip', domain: 'icanhazip.com', kind: 'probe', method: 'echo', path: '/' },
  {
    id: 'aws',
    name: 'Amazon Check IP',
    domain: 'checkip.amazonaws.com',
    kind: 'probe',
    method: 'echo',
    path: '/',
  },
  {
    id: 'alibaba',
    name: '阿里云',
    domain: 'www.aliyun.com',
    kind: 'domestic',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'netease',
    name: '网易',
    domain: 'www.163.com',
    kind: 'domestic',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'tencent',
    name: '腾讯',
    domain: 'www.qq.com',
    kind: 'domestic',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'qualcomm',
    name: 'Qualcomm 中国',
    domain: 'www.qualcomm.cn',
    kind: 'domestic',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'baidu',
    name: '百度',
    domain: 'www.baidu.com',
    kind: 'domestic',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'douyin',
    name: '抖音 · 官网',
    domain: 'www.douyin.com',
    kind: 'domestic',
    method: 'site',
    path: '/',
  },
  {
    id: 'bilibili',
    name: '哔哩哔哩',
    domain: 'www.bilibili.com',
    kind: 'domestic',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'zhihu',
    name: '知乎',
    domain: 'www.zhihu.com',
    kind: 'domestic',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  { id: 'jd', name: '京东', domain: 'www.jd.com', kind: 'domestic', method: 'trace', path: '/cdn-cgi/trace' },
  {
    id: 'taobao',
    name: '淘宝',
    domain: 'www.taobao.com',
    kind: 'domestic',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    domain: 'www.cloudflare.com',
    kind: 'cdn',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'discord',
    name: 'Discord',
    domain: 'discord.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    domain: 'chatgpt.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'claude',
    name: 'Claude',
    domain: 'claude.ai',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    domain: 'openai.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'sora',
    name: 'Sora',
    domain: 'sora.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    domain: 'chat.deepseek.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    domain: 'gemini.google.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    domain: 'www.perplexity.ai',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  { id: 'x', name: 'X', domain: 'x.com', kind: 'international', method: 'trace', path: '/cdn-cgi/trace' },
  {
    id: 'tiktok',
    name: 'TikTok · 官网',
    domain: 'www.tiktok.com',
    kind: 'international',
    method: 'site',
    path: '/',
  },
  {
    id: 'visa',
    name: 'Visa',
    domain: 'www.visa.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'nodejs',
    name: 'Node.js',
    domain: 'nodejs.org',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'github',
    name: 'GitHub',
    domain: 'github.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    domain: 'gitlab.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'google',
    name: 'Google',
    domain: 'www.google.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    domain: 'www.youtube.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'reddit',
    name: 'Reddit',
    domain: 'www.reddit.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'netflix',
    name: 'Netflix',
    domain: 'www.netflix.com',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'cdnjs',
    name: 'cdnjs',
    domain: 'cdnjs.cloudflare.com',
    kind: 'cdn',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'jsdelivr',
    name: 'jsDelivr',
    domain: 'cdn.jsdelivr.net',
    kind: 'cdn',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  { id: 'unpkg', name: 'unpkg', domain: 'unpkg.com', kind: 'cdn', method: 'trace', path: '/cdn-cgi/trace' },
  {
    id: 'npm',
    name: 'npm Registry',
    domain: 'registry.npmjs.org',
    kind: 'international',
    method: 'trace',
    path: '/cdn-cgi/trace',
  },
  {
    id: 'cs2',
    name: 'CS2 · 官网',
    domain: 'www.counter-strike.net',
    kind: 'game',
    method: 'site',
    path: '/cs2',
  },
  {
    id: 'delta-cn',
    name: '三角洲行动 · 国服官网',
    domain: 'df.qq.com',
    kind: 'game',
    method: 'site',
    path: '/index.shtml',
  },
  {
    id: 'delta-global',
    name: 'Delta Force · 国际服官网',
    domain: 'www.playdeltaforce.com',
    kind: 'game',
    method: 'site',
    path: '/',
  },
  {
    id: 'valorant-cn',
    name: '无畏契约 · 国服官网',
    domain: 'val.qq.com',
    kind: 'game',
    method: 'site',
    path: '/',
  },
  {
    id: 'valorant-global',
    name: 'VALORANT · 国际服官网',
    domain: 'playvalorant.com',
    kind: 'game',
    method: 'site',
    path: '/',
  },
  {
    id: 'apex',
    name: 'Apex Legends · 官网',
    domain: 'www.ea.com',
    kind: 'game',
    method: 'site',
    path: '/games/apex-legends/apex-legends',
  },
  { id: 'pubg', name: 'PUBG · 官网', domain: 'www.pubg.com', kind: 'game', method: 'site', path: '/' },
  {
    id: 'fortnite',
    name: 'Fortnite · 官网',
    domain: 'www.fortnite.com',
    kind: 'game',
    method: 'site',
    path: '/',
  },
  {
    id: 'lol-cn',
    name: '英雄联盟 · 国服官网',
    domain: 'lol.qq.com',
    kind: 'game',
    method: 'site',
    path: '/',
  },
  {
    id: 'genshin-cn',
    name: '原神 · 国服官网',
    domain: 'ys.mihoyo.com',
    kind: 'game',
    method: 'site',
    path: '/',
  },
];

const kindLabels = {
  all: '全部',
  probe: '出口探针',
  domestic: '国内',
  international: '国际',
  cdn: 'CDN',
  game: '游戏',
  custom: '自定义',
};
const modeNotes = {
  local: '请求由本地服务发起，线路取决于系统代理和 VPN 设置。',
  browser: '由此浏览器直接请求。站点不允许跨域读取时，IP 无法显示。',
};
const storageKey = 'route-check-custom-v1';
const rows = document.getElementById('results');
const filters = document.getElementById('filters');
const addPanel = document.getElementById('add-panel');
const search = document.getElementById('search');
const runButton = document.getElementById('run-all');
const countryNames =
  typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['zh-CN'], { type: 'region' }) : null;
const hasLocalApi = document.body.dataset.hosted !== 'true';
const geoCache = new Map();
const activeChecks = new Map();
let geoController = new AbortController();
let custom = loadCustom();
let results = new Map();
let filter = 'all';
let mode = hasLocalApi ? 'local' : 'browser';
let runId = 0;

function loadCustom() {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value
      .filter((target) => {
        if (
          !target ||
          typeof target.id !== 'string' ||
          !target.id.startsWith('custom-') ||
          seen.has(target.id)
        )
          return false;
        if (
          target.kind !== 'custom' ||
          typeof target.name !== 'string' ||
          !target.name.trim() ||
          target.name.length > 253 ||
          targetError(target)
        )
          return false;
        seen.add(target.id);
        return true;
      })
      .slice(0, 30);
  } catch {
    return [];
  }
}

function saveCustom() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(custom));
    document.getElementById('storage-note').hidden = true;
  } catch {
    document.getElementById('storage-note').hidden = false;
  }
}

function targets() {
  return [...presets, ...custom];
}

function initials(target) {
  if (/^[\u4e00-\u9fff]/.test(target.name)) return target.name.slice(0, 1);
  return target.name
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 2)
    .toUpperCase();
}
function locationName(result) {
  if (result.location) return result.location;
  if (!result.country) return '位置未提供';
  let country;
  try {
    country = countryNames ? countryNames.of(result.country) : result.country;
  } catch {
    country = result.country;
  }
  return [country, result.region, result.city]
    .filter(
      (part, index, parts) =>
        part && parts.findIndex((other) => other?.toLowerCase() === part.toLowerCase()) === index,
    )
    .join(' · ');
}
function labelFor(result) {
  if (!result) return { status: 'idle', text: '等待检测' };
  if (result.status === 'loading') return { status: 'loading', text: '检测中…' };
  if (result.status === 'ok')
    return { status: 'ok', text: result.geoLoading ? '位置查询中…' : locationName(result) };
  if (result.status === 'responded') return { status: 'responded', text: result.message || '官网已响应' };
  return { status: result.status, text: result.message || '无法获取 IP' };
}
function visibleTargets() {
  const term = search.value.trim().toLowerCase();
  return targets().filter(
    (target) =>
      (filter === 'all' || target.kind === filter) &&
      (!term ||
        `${target.name} ${target.domain} ${results.get(target.id)?.ip || ''}`.toLowerCase().includes(term)),
  );
}
function renderFilters() {
  filters.replaceChildren();
  for (const [key, title] of Object.entries(kindLabels)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `filter${filter === key ? ' active' : ''}`;
    button.textContent = title;
    button.setAttribute('aria-pressed', String(filter === key));
    button.addEventListener('click', () => {
      filter = key;
      renderFilters();
      renderRows();
    });
    filters.append(button);
  }
}
function cell(text, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  if (text != null) td.textContent = text;
  return td;
}
function actionButton(text, handler, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = className;
  button.addEventListener('click', handler);
  return button;
}

function copyButton(label, value) {
  return actionButton(label, async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = '已复制';
    } catch {
      button.textContent = '复制失败';
    }
  });
}

function renderRows() {
  const focused = rows.contains(document.activeElement) ? {
    id: document.activeElement.closest('tr')?.dataset.targetId,
    action: document.activeElement.dataset.action,
  } : null;
  const visible = visibleTargets();
  rows.replaceChildren();
  document.getElementById('empty-state').hidden = visible.length !== 0;
  document.getElementById('target-total').textContent = `/ ${targets().length} 个目标`;
  for (const target of visible) {
    const result = results.get(target.id);
    const tr = document.createElement('tr');
    tr.dataset.targetId = target.id;
    const site = cell(null);
    const main = document.createElement('div');
    main.className = 'site-main';
    const avatar = document.createElement('span');
    avatar.className = 'site-avatar';
    avatar.textContent = initials(target);
    const names = document.createElement('div');
    names.className = 'site-names';
    const name = document.createElement('div');
    name.className = 'site-name';
    name.textContent = target.name;
    const domain = document.createElement('div');
    domain.className = 'site-domain';
    domain.textContent = target.domain;
    names.append(name, domain);
    main.append(avatar, names);
    site.append(main);
    tr.append(site);

    const type = cell(null);
    const badge = document.createElement('span');
    badge.className = `type-badge ${target.kind}`;
    badge.textContent = kindLabels[target.kind];
    type.append(badge);
    tr.append(type);

    const ip = cell(null, 'ip-cell');
    if (result?.status === 'ok') ip.textContent = result.ip;
    else if (result?.status === 'loading') {
      const skeleton = document.createElement('span');
      skeleton.className = 'loading-line';
      ip.append(skeleton);
    } else {
      const dash = document.createElement('span');
      dash.className = 'placeholder';
      dash.textContent = '—';
      ip.append(dash);
    }
    tr.append(ip);

    const stateCell = cell(null);
    const state = labelFor(result);
    const stateDiv = document.createElement('div');
    stateDiv.className = `result-state ${state.status}`;
    const dot = document.createElement('span');
    dot.className = 'state-dot';
    dot.setAttribute('aria-hidden', 'true');
    const stateText = document.createElement('span');
    stateText.textContent = state.text;
    stateDiv.append(dot, stateText);
    if (result?.locationSource) {
      const source = document.createElement('span');
      source.className = 'location-source';
      source.textContent = result.locationSource;
      source.title = `位置来源：${result.locationSource}`;
      stateDiv.append(source);
    }
    if (result?.latency != null) {
      const latency = document.createElement('span');
      latency.className = 'latency';
      latency.textContent = `${result.latency} ms`;
      stateDiv.append(latency);
    }
    stateCell.append(stateDiv);
    tr.append(stateCell);

    const actionsCell = cell(null);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const copyDomain = copyButton('复制域名', target.domain);
    copyDomain.dataset.action = 'copy-domain';
    actions.append(copyDomain);
    if (result?.status === 'ok') {
      const copyIp = copyButton('复制 IP', result.ip);
      copyIp.dataset.action = 'copy-ip';
      actions.append(copyIp);
    }
    const retry = actionButton('重测', () => runOne(target));
    retry.dataset.action = 'retry';
    retry.disabled = result?.status === 'loading' || result?.geoLoading === true;
    actions.append(retry);
    const raw = document.createElement('a');
    raw.href = endpoint(target);
    raw.target = '_blank';
    raw.rel = 'noopener noreferrer';
    raw.textContent = '浏览器核对 ↗';
    raw.dataset.action = 'open';
    raw.title = '在新标签页打开目标接口，查看浏览器收到的原始响应';
    actions.append(raw);
    if (target.kind === 'custom') {
      const remove = actionButton(
        '删除',
        () => {
          custom = custom.filter((x) => x.id !== target.id);
          saveCustom();
          activeChecks.get(target.id)?.abort();
          activeChecks.delete(target.id);
          results.delete(target.id);
          renderRows();
          updateSummary();
        },
        'remove',
      );
      remove.dataset.action = 'remove';
      actions.append(remove);
    }
    actionsCell.append(actions);
    tr.append(actionsCell);
    rows.append(tr);
  }
  if (focused?.action) {
    const row = [...rows.children].find((item) => item.dataset.targetId === focused.id);
    const action = [...(row?.querySelectorAll('[data-action]') || [])]
      .find((item) => item.dataset.action === focused.action);
    if (action && !action.disabled) action.focus({ preventScroll: true });
  }
}
function updateSummary() {
  const all = targets();
  const values = all.map((x) => results.get(x.id));
  const count = (status) => values.filter((x) => x?.status === status).length;
  document.getElementById('count-ok').textContent = count('ok');
  document.getElementById('count-responded').textContent = count('responded');
  document.getElementById('count-unsupported').textContent = count('unsupported');
  document.getElementById('count-error').textContent = count('error');
  const pending = values.filter((x) => x?.status === 'loading' || x?.geoLoading).length;
  document.getElementById('run-state').textContent = pending
    ? `检测中 ${all.length - pending} / ${all.length}`
    : '检测完成';
  document.querySelector('.status-strip').classList.toggle('running', pending > 0);
  if (!pending && runButton.disabled) {
    document.getElementById('last-run').textContent =
      `最近检测 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  }
  runButton.disabled = pending > 0;
}

async function localProbe(target, signal) {
  return fetchJson('/api/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: target.domain, method: target.method, path: target.path }),
    signal,
  });
}
async function lookupGeo(ip, signal) {
  try {
    if (hasLocalApi) {
      return await fetchJson('/api/geo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
        signal,
      });
    }
    const data = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      credentials: 'omit', referrerPolicy: 'no-referrer', signal,
    });
    if (data?.success === true && safeIp(data.ip) === ip) {
      return {
        status: 'ok',
        country: countryCode(data.country_code),
        region: String(data.region || '').slice(0, 80),
        city: String(data.city || '').slice(0, 80),
        locationSource: 'ipwho.is',
      };
    }
  } catch {
    /* location is optional */
  }
  return { status: 'unavailable' };
}

function geoForIp(ip) {
  if (!geoCache.has(ip)) {
    const lookup = lookupGeo(ip, geoController.signal).then((result) => {
      // Coalesce concurrent lookups, but let a later retry recover from a failure.
      if (result.status !== 'ok' && geoCache.get(ip) === lookup) geoCache.delete(ip);
      return result;
    });
    geoCache.set(ip, lookup);
  }
  return geoCache.get(ip);
}

async function runOne(target, token = runId) {
  if (token !== runId || !targets().some((x) => x.id === target.id)) return;
  activeChecks.get(target.id)?.abort();
  const check = new AbortController();
  activeChecks.set(target.id, check);
  const isCurrent = () => token === runId && !check.signal.aborted && activeChecks.get(target.id) === check;
  results.set(target.id, { status: 'loading' });
  renderRows();
  updateSummary();
  let result;
  try {
    result = await (mode === 'local' ? localProbe(target, check.signal) : browserProbe(target, check.signal));
  } catch (error) {
    result = {
      status: 'error',
      message: error.name === 'AbortError' ? '连接超时' : '检测失败，请检查本地服务或网络',
    };
  }
  if (!isCurrent()) return;
  if (result.status === 'ok' && !result.country && !result.location) {
    results.set(target.id, { ...result, geoLoading: true });
    renderRows();
    updateSummary();
    const geo = await geoForIp(result.ip);
    if (!isCurrent()) return;
    if (geo.status === 'ok') result = { ...result, ...geo, status: 'ok' };
  }
  activeChecks.delete(target.id);
  results.set(target.id, result);
  renderRows();
  updateSummary();
}

async function runAll() {
  const token = ++runId;
  for (const check of activeChecks.values()) check.abort();
  activeChecks.clear();
  geoController.abort();
  geoController = new AbortController();
  geoCache.clear();
  const list = targets();
  results = new Map(list.map((target) => [target.id, { status: 'loading' }]));
  renderRows();
  updateSummary();
  let next = 0;
  async function worker() {
    while (next < list.length && token === runId) {
      const target = list[next++];
      await runOne(target, token);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
}

window.addEventListener('pagehide', () => {
  runId++;
  for (const check of activeChecks.values()) check.abort();
  activeChecks.clear();
  geoController.abort();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) runAll();
});

document.querySelectorAll('input[name="mode"]').forEach((input) =>
  input.addEventListener('change', () => {
    mode = document.querySelector('input[name="mode"]:checked').value;
    document.getElementById('mode-note').textContent = modeNotes[mode];
    runAll();
  }),
);
runButton.addEventListener('click', runAll);
search.addEventListener('input', renderRows);
document.getElementById('add-toggle').addEventListener('click', (event) => {
  addPanel.hidden = !addPanel.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!addPanel.hidden));
  if (!addPanel.hidden) addPanel.elements.domain.focus();
});
document.getElementById('custom-method').addEventListener('change', (event) => {
  document.getElementById('custom-path').value = event.target.value === 'trace' ? '/cdn-cgi/trace' : '/';
});
addPanel.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(addPanel);
  const domain = String(form.get('domain') || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  const path = String(form.get('path') || '').trim();
  const name = String(form.get('name') || '').trim() || domain;
  const error = document.getElementById('form-error');
  error.textContent = '';
  const target = {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    domain,
    kind: 'custom',
    method: form.get('method'),
    path,
  };
  error.textContent = targetError(target);
  if (error.textContent) return;
  if (custom.length >= 30) {
    error.textContent = '最多添加 30 个自定义站点。';
    return;
  }
  custom.push(target);
  saveCustom();
  addPanel.reset();
  document.getElementById('custom-path').value = '/cdn-cgi/trace';
  addPanel.hidden = true;
  document.getElementById('add-toggle').setAttribute('aria-expanded', 'false');
  filter = 'all';
  renderFilters();
  renderRows();
  runOne(target);
});

if (!hasLocalApi) {
  const localRadio = document.querySelector('input[name="mode"][value="local"]');
  localRadio.disabled = true;
  localRadio.closest('label').hidden = true;
  document.querySelector('input[name="mode"][value="browser"]').checked = true;
  document.getElementById('mode-note').textContent = modeNotes.browser;
}
renderFilters();
renderRows();
runAll();
