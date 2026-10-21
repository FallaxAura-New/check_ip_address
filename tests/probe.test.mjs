import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { browserProbe, countryCode, endpoint, fetchJson, parseResponse, safeIp, targetError } from '../static/probe.mjs';

const target = { domain: 'example.com', path: '/ip?format=json', method: 'echo' };
const reply = (body, url = endpoint(target), status = 200) => Object.defineProperty(new Response(body, { status }), 'url', { value: url });
const settle = () => new Promise((resolve) => setImmediate(resolve));
afterEach(() => mock.restoreAll());

describe('IP parsing and target validation', () => {
  it('normalizes IPv4/IPv6 without extracting arbitrary text', () => {
    for (const [value, expected] of [[' 1.1.1.1\n', '1.1.1.1'], ['0.0.0.0', '0.0.0.0'], ['255.255.255.255', '255.255.255.255'], ['2001:0DB8:0:0::1', '2001:db8::1'], ['::ffff:192.0.2.1', '::ffff:c000:201']]) {
      assert.equal(safeIp(value), expected);
    }
    for (const value of [null, {}, 1234, '', '999.2.3.4', '1.2.3', '01.2.3.4', '1.1.1.1:443', ':::', '[::1]', 'fe80::1%en0', 'hello 1.1.1.1', '<script>1.1.1.1</script>']) {
      assert.equal(safeIp(value), '', String(value));
    }
  });
  it('accepts only two-letter country codes', () => {
    assert.equal(countryCode('hk'), 'HK');
    for (const value of [undefined, null, {}, 'Hong Kong', ' HK', 'H1', '__proto__']) assert.equal(countryCode(value), '');
  });
  it('parses trace values and does not infer an IP from an HTML response', () => {
    assert.deepEqual(parseResponse('noise\nip=203.0.113.9\r\nloc=hk\r\n', 'trace'), { ip: '203.0.113.9', country: 'HK' });
    assert.deepEqual(parseResponse('<html>203.0.113.9</html>', 'trace'), { ip: '', country: '' });
    assert.deepEqual(parseResponse('ip=999.1.1.1\nloc=China', 'trace'), { ip: '', country: '' });
  });
  it('parses supported JSON fields, plain text, and country fallback', () => {
    for (const key of ['ip', 'ip_address', 'address', 'query']) {
      assert.deepEqual(parseResponse(JSON.stringify({ [key]: '2001:db8::1', country_code: 'bad', country: 'us' }), 'echo'), { ip: '2001:db8::1', country: 'US' });
    }
    assert.deepEqual(parseResponse('{"ip":"invalid","query":"1.1.1.1","country_code":"AU"}', 'echo'), { ip: '1.1.1.1', country: 'AU' });
    assert.deepEqual(parseResponse('1.1.1.1\n', 'echo'), { ip: '1.1.1.1', country: '' });
    for (const text of ['null', '[]', '42', '{broken', '{"ip":1234}', '<html>1.1.1.1</html>']) assert.equal(parseResponse(text, 'echo').ip, '');
    assert.equal(parseResponse(null, 'echo').ip, '');
  });
  it('preserves bounded Ping0 location text and source', () => {
    assert.deepEqual(parseResponse('\n 1.1.1.1\r\n\n 香港 \n', 'ping0'), { ip: '1.1.1.1', country: '', location: '香港', locationSource: 'ping0.cc' });
    assert.equal(parseResponse(`1.1.1.1\n${'x'.repeat(200)}`, 'ping0').location.length, 160);
    assert.equal(parseResponse('', 'ping0').ip, '');
  });
  it('accepts public hostnames and relative same-host paths only', () => {
    assert.equal(targetError(target), '');
    assert.equal(endpoint(target), 'https://example.com/ip?format=json');
    for (const domain of [null, 12, '', 'localhost', 'example.local', 'example.localhost', 'example.internal', '127.0.0.1', '[::1]', 'user@example.com', 'example.com:443', 'example.com/path', '-bad.example', 'EXAMPLE.COM']) {
      assert.notEqual(targetError({ ...target, domain }), '', String(domain));
    }
    for (const path of [null, 12, '', '//other.example', '/foo bar', '/foo\\bar', '/#fragment', `/${'x'.repeat(512)}`, '/\u00a0']) {
      assert.notEqual(targetError({ ...target, path }), '', String(path));
    }
    for (let code = 0; code <= 32; code++) assert.notEqual(targetError({ ...target, path: `/a${String.fromCharCode(code)}b` }), '', `control ${code}`);
    assert.notEqual(targetError({ ...target, path: '/a\x7fb' }), '');
    assert.notEqual(targetError({ ...target, method: 'ping0' }), '');
    assert.notEqual(targetError(null), '');
  });
});

describe('browser request boundaries', () => {
  it('sends no cookies or referrer and cache-busts readable probes', async () => {
    const fetcher = mock.method(globalThis, 'fetch', async () => reply('{"ip":"1.1.1.1"}'));
    const result = await browserProbe(target);
    assert.equal(result.status, 'ok');
    const [url, options] = fetcher.mock.calls[0].arguments;
    assert.equal(url.searchParams.get('format'), 'json');
    assert.ok(url.searchParams.has('_split_probe'));
    assert.equal(options.mode, 'cors');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.signal.aborted, true, 'completed requests are cleaned up');
  });
  it('appends its cachebuster without rewriting original query bytes', async () => {
    mock.method(Date, 'now', () => 123);
    const fetcher = mock.method(globalThis, 'fetch', async () => reply('1.1.1.1'));
    const path = '/ip?token=a%20b%2Bc~&empty&sig=%2f%2F&_split_probe=original';
    assert.equal((await browserProbe({ ...target, path })).status, 'ok');
    assert.equal(String(fetcher.mock.calls[0].arguments[0]), `https://example.com${path}&_split_probe=123`);
  });
  it('does not mistake opaque site responses for IP or HTTP success', async () => {
    const fetcher = mock.method(globalThis, 'fetch', async () => ({ type: 'opaque', ok: false, status: 0 }));
    const result = await browserProbe({ ...target, method: 'site' });
    assert.equal(result.status, 'responded');
    assert.equal(result.ip, undefined);
    assert.match(result.message, /可能经过跳转/);
    const [url, options] = fetcher.mock.calls[0].arguments;
    assert.equal(url.searchParams.has('_split_probe'), false);
    assert.equal(options.mode, 'no-cors');
  });
  it('rejects redirects to another hostname, protocol, or port', async () => {
    for (const url of ['https://other.example/ip', 'http://example.com/ip', 'https://example.com:8443/ip']) {
      const fetcher = mock.method(globalThis, 'fetch', async () => reply('1.1.1.1', url));
      const result = await browserProbe(target);
      assert.equal(result.status, 'unsupported', url);
      assert.equal(result.ip, undefined);
      assert.equal(fetcher.mock.calls[0].arguments[1].signal.aborted, true);
      fetcher.mock.restore();
    }
  });
  it('accepts a same-origin path redirect and the explicit HTTPS default port', async () => {
    mock.method(globalThis, 'fetch', async () => reply('1.1.1.1', 'https://example.com:443/other'));
    assert.equal((await browserProbe(target)).status, 'ok');
  });
  it('keeps unsupported HTTP responses distinct from server errors', async () => {
    for (const [status, expected] of [[404, 'unsupported'], [429, 'unsupported'], [500, 'error']]) {
      const fetcher = mock.method(globalThis, 'fetch', async () => reply('1.1.1.1', undefined, status));
      const result = await browserProbe(target);
      assert.equal(result.status, expected);
      assert.equal(result.ip, undefined);
      assert.match(result.message, new RegExp(String(status)));
      fetcher.mock.restore();
    }
  });
  it('classifies unreadable or malformed responses without claiming an IP', async () => {
    const fetcher = mock.method(globalThis, 'fetch', async () => { throw new TypeError('CORS'); });
    assert.match((await browserProbe(target)).message, /跨域限制或连接失败/);
    fetcher.mock.restore();
    mock.method(globalThis, 'fetch', async () => reply('<html>1.1.1.1</html>'));
    assert.equal((await browserProbe(target)).status, 'unsupported');
  });
  it('counts response-body time in latency', async () => {
    let time = 0;
    mock.method(performance, 'now', () => time);
    mock.method(globalThis, 'fetch', async () => {
      time = 10;
      let sent = false;
      return reply(new ReadableStream({ pull(controller) {
        if (sent) { controller.close(); return; }
        sent = true;
        time = 1010;
        controller.enqueue(new TextEncoder().encode('1.1.1.1'));
      } }));
    });
    assert.equal((await browserProbe(target)).latency, 1010);
  });
  it('accepts an exactly 32768-byte response', async () => {
    mock.method(globalThis, 'fetch', async () => reply(`1.1.1.1${' '.repeat(32768 - 7)}`));
    assert.equal((await browserProbe(target)).status, 'ok');
  });
  it('rejects and cancels a larger streamed response instead of truncating it into success', async () => {
    let canceled = false;
    let chunks = 0;
    const stream = new ReadableStream({
      pull(controller) {
        chunks++;
        controller.enqueue(new TextEncoder().encode(chunks === 1 ? `1.1.1.1${' '.repeat(32768 - 7)}` : ' '));
      },
      cancel() { canceled = true; },
    });
    mock.method(globalThis, 'fetch', async () => reply(stream));
    const result = await browserProbe(target);
    assert.equal(result.status, 'unsupported');
    assert.equal(result.ip, undefined);
    assert.match(result.message, /响应过大/);
    assert.equal(canceled, true);
    assert.ok(chunks <= 3, 'reader stops near the size limit');
  });
  it('enforces the bound in bytes, including multibyte text', async () => {
    mock.method(globalThis, 'fetch', async () => reply(`1.1.1.1\n${'香'.repeat(11000)}`));
    assert.match((await browserProbe({ ...target, method: 'ping0' })).message, /响应过大/);
  });
  it('decodes a multibyte character split across stream chunks', async () => {
    const bytes = new TextEncoder().encode('1.1.1.1\n香港');
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, 9));
      controller.enqueue(bytes.slice(9));
      controller.close();
    } });
    mock.method(globalThis, 'fetch', async () => reply(stream));
    assert.equal((await browserProbe({ ...target, method: 'ping0' })).location, '香港');
  });
  it('returns stopped without fetching for a pre-aborted parent', async () => {
    const parent = new AbortController();
    parent.abort();
    const fetcher = mock.method(globalThis, 'fetch', async () => reply('1.1.1.1'));
    assert.deepEqual(await browserProbe(target, parent.signal), { status: 'stopped' });
    assert.equal(fetcher.mock.callCount(), 0);
  });
  it('cancels an active request when its parent is aborted', async () => {
    const parent = new AbortController();
    let requestSignal;
    mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
      requestSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = browserProbe(target, parent.signal);
    parent.abort();
    assert.deepEqual(await pending, { status: 'stopped' });
    assert.equal(requestSignal.aborted, true);
  });
  it('cancels a stalled body when its parent is aborted', async () => {
    const parent = new AbortController();
    let canceled = false;
    const stream = new ReadableStream({ cancel() { canceled = true; } });
    mock.method(globalThis, 'fetch', async () => reply(stream));
    const pending = browserProbe(target, parent.signal);
    await settle();
    parent.abort();
    assert.deepEqual(await pending, { status: 'stopped' });
    assert.equal(canceled, true);
  });
  it('cleans timeout and abort listeners after a completed probe', async () => {
    const parent = new AbortController();
    const remove = mock.method(parent.signal, 'removeEventListener');
    const clear = mock.method(globalThis, 'clearTimeout');
    mock.method(globalThis, 'fetch', async () => reply('1.1.1.1'));
    await browserProbe(target, parent.signal);
    assert.ok(remove.mock.calls.some((call) => call.arguments[0] === 'abort'));
    assert.equal(clear.mock.callCount(), 1);
  });
  it('times out a stalled request after 8500 ms', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = browserProbe(target);
    t.mock.timers.tick(8500);
    assert.match((await pending).message, /连接超时/);
  });
  it('times out a stalled response body after 8500 ms', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    mock.method(globalThis, 'fetch', async () => reply(new ReadableStream()));
    const pending = browserProbe(target);
    await settle();
    t.mock.timers.tick(8500);
    assert.match((await pending).message, /连接超时/);
  });
});

describe('JSON API requests', () => {
  it('preserves request options while omitting credentials and referrer', async () => {
    const fetcher = mock.method(globalThis, 'fetch', async () => Response.json({ status: 'ok' }));
    assert.deepEqual(await fetchJson('/api/probe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), { status: 'ok' });
    const [, options] = fetcher.mock.calls[0].arguments;
    assert.equal(options.method, 'POST');
    assert.equal(options.body, '{}');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.equal(options.signal.aborted, true);
  });
  it('rejects HTTP errors and invalid JSON', async () => {
    const fetcher = mock.method(globalThis, 'fetch', async () => new Response('no', { status: 503 }));
    await assert.rejects(fetchJson('/api/geo'), /HTTP 503/);
    fetcher.mock.restore();
    mock.method(globalThis, 'fetch', async () => new Response('invalid'));
    await assert.rejects(fetchJson('/api/geo'), SyntaxError);
  });
  it('accepts a JSON response exactly at the 32768-byte limit', async () => {
    const value = 'x'.repeat(32768 - 8);
    mock.method(globalThis, 'fetch', async () => Response.json({ x: value }));
    assert.deepEqual(await fetchJson('/api/geo'), { x: value });
  });
  it('rejects and cancels an oversized streamed JSON response', async () => {
    let canceled = false;
    let chunks = 0;
    const stream = new ReadableStream({
      pull(controller) {
        chunks++;
        controller.enqueue(new TextEncoder().encode(chunks === 1 ? `{"x":"${'x'.repeat(32768 - 6)}` : 'x'));
      },
      cancel() { canceled = true; },
    });
    mock.method(globalThis, 'fetch', async () => new Response(stream));
    await assert.rejects(fetchJson('/api/geo'), /Response too large/);
    assert.equal(canceled, true);
    assert.ok(chunks <= 3);
  });
  it('honors a pre-aborted parent without sending a request', async () => {
    const parent = new AbortController();
    parent.abort();
    const fetcher = mock.method(globalThis, 'fetch', async () => Response.json({}));
    await assert.rejects(fetchJson('/api/geo', { signal: parent.signal }), { name: 'AbortError' });
    assert.equal(fetcher.mock.callCount(), 0);
  });
  it('aborts an active request when the parent is canceled', async () => {
    const parent = new AbortController();
    mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = fetchJson('/api/geo', { signal: parent.signal });
    parent.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  });
  it('aborts a stalled JSON body when the parent is canceled', async () => {
    const parent = new AbortController();
    let canceled = false;
    mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ cancel() { canceled = true; } })));
    const pending = fetchJson('/api/geo', { signal: parent.signal });
    await settle();
    parent.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(canceled, true);
  });
  it('times out after 10000 ms', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const pending = fetchJson('/api/geo');
    t.mock.timers.tick(10000);
    await assert.rejects(pending, { name: 'AbortError' });
  });
  it('times out a stalled JSON body after 10000 ms', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream()));
    const pending = fetchJson('/api/geo');
    await settle();
    t.mock.timers.tick(10000);
    await assert.rejects(pending, { name: 'AbortError' });
  });
});
