// Claude 전광판의 dash 런타임을 일반 웹페이지에서 쓰도록 흉내 낸 작은 부품.
// datasets: data/<이름>.json ({"rows": [...]}) 을 읽고, dash.calc 로 등록한 계산을 이어서 돌린 뒤
// data-draw 가 붙은 요소를 다시 그린다.
(function () {
  const DATASETS = ['accounts', 'videos', 'links', 'profile_visits'];
  const raw = {};
  const calcs = {};
  const cache = {};
  const drawers = {};
  const dataListeners = [];
  let loaded = false;

  const get = (id) => {
    if (id in raw) return raw[id];
    if (id in cache) return cache[id];
    const c = calcs[id];
    if (!c) return undefined;
    const args = c.inputs.map(get);
    if (args.some((a) => a === undefined)) return undefined;
    try { cache[id] = c.fn(...args); } catch (e) { console.error('calc 실패', id, e); cache[id] = undefined; }
    return cache[id];
  };

  const drawName = (name) => {
    const fn = drawers[name];
    if (!fn) return;
    document.querySelectorAll('#dash-root [data-draw="' + name + '"]').forEach((el) => {
      try { fn(el); } catch (e) { console.error('draw 실패', name, e); }
    });
  };
  const drawAll = () => Object.keys(drawers).forEach(drawName);

  window.dash = {
    calc(id, spec) { calcs[id] = spec; },
    data(id) {
      if (!loaded) return {status: 'loading', data: null};
      const d = get(id);
      return d === undefined ? {status: 'error', data: null} : {status: 'ok', data: d};
    },
    draw(name, fn) {
      if (typeof fn === 'function') { drawers[name] = fn; if (loaded) drawName(name); }
      else drawName(name);
    },
    onData(cb) { dataListeners.push(cb); },
    setLink(id) { try { history.replaceState(null, '', '#' + id); } catch (e) { /* 무시 */ } },
    async start() {
      const v = Date.now();
      try {
        await Promise.all(DATASETS.map(async (n) => {
          const r = await fetch('data/' + n + '.json?v=' + v, {cache: 'no-store'});
          if (!r.ok) throw new Error(n + ' ' + r.status);
          const j = await r.json();
          raw[n] = Array.isArray(j) ? j : (j.rows || []);
        }));
      } catch (e) {
        const box = document.createElement('div');
        box.id = 'dash-load-error';
        box.textContent = '기록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요. (' + e.message + ')';
        document.body.prepend(box);
        return;
      }
      loaded = true;
      dataListeners.forEach((cb) => { try { cb(); } catch (e) { console.error(e); } });
      drawAll();
      let w = window.innerWidth, t;
      window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => { if (Math.abs(window.innerWidth - w) > 8) { w = window.innerWidth; drawAll(); } }, 200);
      });
    },
  };
})();
