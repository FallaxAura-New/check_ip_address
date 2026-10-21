// Open the local app in the Codex built-in browser, then run this file through
// Playwright MCP browser_run_code_unsafe(filename). It uses no external services.
async (page) => {
  const url = page.url();
  page = await page.context().newPage();
  const check = (value, message) => { if (!value) throw new Error(message); };
  const errors = [];
  const onError = (error) => errors.push(error.message);
  const onConsole = (message) => { if (message.type() === 'error') errors.push(message.text()); };
  page.on('pageerror', onError);
  page.on('console', onConsole);
  await page.unrouteAll();
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('route-check-test-started')) {
      localStorage.removeItem('route-check-custom-v1');
      sessionStorage.setItem('route-check-test-started', 'true');
    }
    const state = window.__audit = { hold: true, calls: [], copied: '', geoOk: false };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text) => { state.copied = text; },
    } });
    const original = window.fetch;
    window.fetch = (input, options = {}) => {
      const url = new URL(input, location.href);
      const local = url.pathname === '/api/probe';
      const geo = url.pathname === '/api/geo' || url.hostname === 'ipwho.is';
      if (!local && !geo && url.origin === location.origin) return original(input, options);
      const payload = local ? JSON.parse(options.body) : {};
      const method = payload.method || (options.mode === 'no-cors' ? 'site' :
        url.pathname.includes('/cdn-cgi/trace') ? 'trace' : url.hostname === 'ping0.cc' ? 'ping0' : 'echo');
      const call = { url: url.href, domain: payload.domain || url.hostname, geo,
        signal: options.signal, settled: false, aborted: false };
      state.calls.push(call);
      return new Promise((resolve, reject) => {
        const abort = () => {
          call.aborted = true;
          if (!call.settled) { call.settled = true; reject(new DOMException('Aborted', 'AbortError')); }
        };
        call.finish = () => {
          if (call.settled) return;
          call.settled = true;
          options.signal?.removeEventListener('abort', abort);
          let body;
          if (geo) body = JSON.stringify(state.geoOk ? { status: 'ok', success: true, ip: '1.1.1.1',
            country: 'SG', country_code: 'SG', region: 'Singapore', city: 'Singapore', locationSource: 'fixture' }
            : { status: 'unavailable', success: false });
          else if (local) body = JSON.stringify(method === 'site' ? { status: 'responded', latency: 12 }
            : { status: 'ok', ip: '1.1.1.1', country: state.noCountry ? '' : 'SG', latency: 12 });
          else body = method === 'trace' ? 'ip=1.1.1.1\nloc=SG\n'
            : method === 'ping0' ? '1.1.1.1\nSingapore\n' : JSON.stringify({ ip: '1.1.1.1', country: 'SG' });
          const response = new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } });
          Object.defineProperty(response, 'url', { value: url.href });
          resolve(response);
        };
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) abort();
        else if (!state.hold || (geo && !state.holdGeo)) call.finish();
      });
    };
  });
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__audit.calls.length === 6);
    await page.getByText('当前浏览器', { exact: true }).click();
    await page.waitForFunction(() => window.__audit.calls.length === 12);
    check(await page.evaluate(() => window.__audit.calls.slice(0, 6).every((c) => c.aborted)),
      'Mode change must abort all six previous requests');
    check(await page.evaluate(() => window.__audit.calls.filter((c) => !c.settled).length === 6),
      'Only six current requests may run concurrently');
    await page.evaluate(() => {
      window.__audit.hold = false;
      window.__audit.calls.forEach((c) => c.finish());
    });
    await page.waitForFunction(() => !document.querySelector('#run-all').disabled);
    check(await page.locator('#count-ok').innerText() !== '0', 'Browser results must render');

    // Success must retain both copy actions, and background updates must not steal focus.
    const first = page.locator('#results tr').first();
    await first.getByRole('button', { name: '复制域名', exact: true }).click();
    check(await page.evaluate(() => window.__audit.copied === 'api.ipify.org'), 'Copy domain on successful row');
    await first.getByRole('button', { name: '复制 IP', exact: true }).click();
    check(await page.evaluate(() => window.__audit.copied === '1.1.1.1'), 'Copy IP on successful row');
    await page.evaluate(() => { window.__audit.hold = true; });
    await page.locator('#results tr').nth(1).getByRole('button', { name: '重测', exact: true }).click();
    await first.locator('[data-action="open"]').focus();
    await page.evaluate(() => window.__audit.calls.filter((c) => !c.settled).forEach((c) => c.finish()));
    await page.waitForFunction(() => !document.querySelector('#run-all').disabled);
    check(await page.evaluate(() => document.activeElement.dataset.action === 'open' &&
      document.activeElement.closest('tr').dataset.targetId === 'ipify'), 'Preserve focused row action');

    // A deleted target cannot publish its late response or keep the progress pending.
    await page.getByRole('button', { name: '添加站点', exact: true }).click();
    await page.locator('[name="name"]').fill('<img src=x onerror=alert(1)>');
    await page.locator('[name="domain"]').fill('custom.example.com');
    await page.getByRole('button', { name: '添加并检测', exact: true }).click();
    await page.waitForFunction(() => window.__audit.calls.some((c) => c.domain === 'custom.example.com'));
    const custom = page.locator('#results tr').filter({ hasText: 'custom.example.com' });
    check(await custom.locator('img').count() === 0, 'Custom names must remain text');
    await custom.getByRole('button', { name: '删除', exact: true }).click();
    check(await page.evaluate(() => window.__audit.calls.find((c) => c.domain === 'custom.example.com').aborted),
      'Delete must abort the active target');
    check(await custom.count() === 0, 'Deleted target must stay removed');

    // A previous unavailable geo response must not poison the next full run.
    await page.evaluate(() => { window.__audit.hold = false; window.__audit.noCountry = true; });
    await page.getByText('本机网络', { exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#run-all').disabled);
    const geoBefore = await page.evaluate(() => window.__audit.calls.filter((c) => c.geo).length);
    check(geoBefore > 0, 'Missing country must request geo');
    check(await first.locator('.ip-cell').innerText() === '1.1.1.1', 'Geo failure must preserve exit IP');
    await page.evaluate(() => { window.__audit.geoOk = true; });
    await page.getByRole('button', { name: '重新检测全部', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#run-all').disabled);
    check(await page.evaluate((before) => window.__audit.calls.filter((c) => c.geo).length > before, geoBefore),
      'Next run must retry geo');
    check((await first.innerText()).includes('Singapore'), 'Recovered geo result must render');

    // Filtering, no-match state, and 30-item persistence validation.
    await page.locator('#search').fill('does-not-exist');
    check(await page.locator('#results tr').count() === 0 && await page.locator('#empty-state').isVisible(),
      'Search empty state');
    await page.locator('#search').fill('');
    await page.getByRole('button', { name: '游戏', exact: true }).click();
    check(await page.locator('#results tr').count() === 10, 'Category filter');
    await page.getByRole('button', { name: '全部', exact: true }).click();
    await page.evaluate(() => {
      const saved = Array.from({ length: 35 }, (_, i) => ({ id: `custom-${i}`, name: `Saved ${i}`,
        domain: `saved${i}.example.com`, path: '/', method: 'site', kind: 'custom' }));
      saved.unshift(null, { ...saved[0], id: 'custom-blank', name: '   ' },
        { ...saved[0], id: 'custom-bad', domain: '127.0.0.1' }, saved[0]);
      localStorage.setItem('route-check-custom-v1', JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForFunction(() => window.__audit.calls.length === 6);
    await page.evaluate(() => { window.__audit.hold = false; window.__audit.calls.forEach((c) => c.finish()); });
    await page.waitForFunction(() => !document.querySelector('#run-all').disabled);
    await page.getByRole('button', { name: '自定义', exact: true }).click();
    check(await page.locator('#results tr').count() === 30, 'Load only 30 valid unique custom targets');
    check(await page.locator('#results tr').filter({ hasText: '127.0.0.1' }).count() === 0, 'Reject invalid stored targets');
    await page.getByRole('button', { name: '全部', exact: true }).click();
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}`);
      check(await page.evaluate(() => {
        const row = document.querySelector('#results tr');
        row.querySelector('.ip-cell').textContent = '2001:db8:1234:5678:9abc:def0:1234:5678';
        const state = row.querySelector('.result-state');
        state.children[1].textContent = 'X'.repeat(160);
        return state.scrollWidth <= state.clientWidth + 1;
      }), `Long location must wrap without clipping at ${width}`);
    }
    check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { passed: true, checks: ['concurrency', 'mode cancellation', 'copy domain and IP', 'keyboard focus',
      'delete cancellation', 'text-only custom names', 'geo retry and IP retention', 'search', 'filters',
      'custom storage validation and limit', 'desktop/mobile overflow', 'console'], mockedNetwork: true };
  } finally {
    page.off('pageerror', onError);
    page.off('console', onConsole);
    await page.close();
  }
}
