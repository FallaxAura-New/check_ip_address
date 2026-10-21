const hostnamePattern = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const responseLimit = 32768;

export function targetError(target) {
  const { domain, path, method } = target || {};
  if (
    typeof domain !== 'string' ||
    !hostnamePattern.test(domain) ||
    /\.(local|localhost|internal)$/.test(domain)
  ) {
    return '请输入公开域名，不要包含路径。';
  }
  if (
    typeof path !== 'string' ||
    path.length > 512 ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\#\s\x00-\x1f\x7f]/.test(path)
  ) {
    return '路径须以 / 开头，且不能包含空白、控制字符、反斜杠或 #。';
  }
  if (!['trace', 'echo', 'site'].includes(method)) return '不支持的检测方式。';
  return '';
}

export function safeIp(value) {
  if (typeof value !== 'string') return '';
  const ip = value.trim();
  if (/^(?:(?:0|[1-9]\d{0,2})\.){3}(?:0|[1-9]\d{0,2})$/.test(ip) && ip.split('.').every((n) => +n <= 255))
    return ip;
  if (ip.includes(':') && /^[\da-f:.]+$/i.test(ip)) {
    try {
      return new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    } catch {
      /* Invalid IPv6. */
    }
  }
  return '';
}

export function countryCode(value) {
  return typeof value === 'string' && /^[a-z]{2}$/i.test(value) ? value.toUpperCase() : '';
}

export function parseResponse(text, method) {
  if (typeof text !== 'string') return { ip: '', country: '' };
  if (method === 'ping0') {
    const lines = text.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return {
      ip: safeIp(lines[0]),
      country: '',
      location: (lines[1] || '').slice(0, 160),
      locationSource: 'ping0.cc',
    };
  }
  if (method === 'trace') {
    const pairs = Object.fromEntries(text.split(/\r?\n/).filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
    return { ip: safeIp(pairs.ip), country: countryCode(pairs.loc) };
  }
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object') {
      for (const key of ['ip', 'ip_address', 'address', 'query']) {
        const ip = safeIp(value[key]);
        if (ip) return { ip, country: countryCode(value.country_code) || countryCode(value.country) };
      }
    }
  } catch {
    /* Some IP endpoints return plain text. */
  }
  return { ip: safeIp(text), country: '' };
}

export function endpoint(target) {
  return `https://${target.domain}${target.path}`;
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

function requestScope(parentSignal, milliseconds) {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (parentSignal?.aborted) cancel();
  else parentSignal?.addEventListener('abort', cancel, { once: true });
  const timeout = controller.signal.aborted ? null : setTimeout(() => {
    timedOut = true;
    cancel();
  }, milliseconds);
  return {
    controller,
    timedOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', cancel);
    },
  };
}

class ResponseTooLargeError extends Error {}

async function readResponseText(response, signal) {
  if (signal.aborted) throw abortError();
  if (!response.body) return '';
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw abortError();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > responseLimit) {
        cancel();
        throw new ResponseTooLargeError('Response too large');
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export async function fetchJson(url, options = {}) {
  const scope = requestScope(options.signal, 10000);
  const { controller } = scope;
  try {
    if (controller.signal.aborted) throw abortError();
    const response = await fetch(url, {
      ...options,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw abortError();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return JSON.parse(await readResponseText(response, controller.signal));
  } finally {
    controller.abort();
    scope.cleanup();
  }
}

export async function browserProbe(target, signal) {
  if (signal?.aborted) return { status: 'stopped' };
  const scope = requestScope(signal, 8500);
  const { controller } = scope;
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  try {
    const url = new URL(endpoint(target));
    // Preserve query bytes: reserializing searchParams changes signed/opaque values.
    if (target.method !== 'site') url.search += `${url.search ? '&' : '?'}_split_probe=${Date.now()}`;
    const response = await fetch(url, {
      mode: target.method === 'site' ? 'no-cors' : 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (controller.signal.aborted) throw abortError();
    if (target.method === 'site') {
      return { status: 'responded', message: '已收到响应（可能经过跳转）', latency: elapsed() };
    }
    // A different protocol or port is a different endpoint, even on the same hostname.
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== 'https:' || finalUrl.port || finalUrl.origin !== url.origin) {
      return { status: 'unsupported', message: '目标跳转到了其他来源，无法归属 IP', latency: elapsed() };
    }
    if (!response.ok) {
      return response.status >= 400 && response.status < 500
        ? { status: 'unsupported', message: `站点未提供检测接口（HTTP ${response.status}）`, latency: elapsed() }
        : { status: 'error', message: `站点返回 HTTP ${response.status}`, latency: elapsed() };
    }
    const parsed = parseResponse(await readResponseText(response, controller.signal), target.method);
    return parsed.ip
      ? { status: 'ok', ...parsed, latency: elapsed() }
      : { status: 'unsupported', message: '响应中未找到有效 IP', latency: elapsed() };
  } catch (error) {
    if (signal?.aborted) return { status: 'stopped' };
    if (error instanceof ResponseTooLargeError) {
      return { status: 'unsupported', message: '响应过大，无法识别 IP', latency: elapsed() };
    }
    return {
      status: 'error',
      message: scope.timedOut() || error?.name === 'AbortError'
        ? '连接超时' : '浏览器无法读取（跨域限制或连接失败）',
      latency: elapsed(),
    };
  } finally {
    controller.abort();
    scope.cleanup();
  }
}
