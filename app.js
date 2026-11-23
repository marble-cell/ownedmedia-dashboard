  dash.calc('accounts_latest', {
    inputs: ['accounts'],
    title: '계정별 최신 기록',
    description: '계정마다 가장 최근 기록과, 기간(10/28~11/30) 안의 누적 조회수, 전날 대비 팔로워·조회수 변화.',
    fn: (accounts) => {
      const out = [];
      for (const [account, rows] of d3.group(accounts, (r) => r.account)) {
        const s = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
        const last = s[s.length - 1];
        const prev = s.length > 1 ? s[s.length - 2] : null;
        const inWin = s.filter((r) => r.date <= '2026-11-30');
        out.push({
          account, character: last.character, platform: last.platform, handle: last.handle, url: last.url, date: last.date, collected_at: last.collected_at || '',
          views: Number(last.views), followers: Number(last.followers), posts: Number(last.posts),
          month_views: inWin.length ? Number(inWin[inWin.length - 1].views) : 0,
          views_change: prev ? Number(last.views) - Number(prev.views) : null,
          followers_change: prev ? Number(last.followers) - Number(prev.followers) : null,
        });
      }
      return out.sort((a, b) => b.month_views - a.month_views || b.views - a.views);
    },
  });

  dash.calc('kr_series', {
    inputs: ['accounts'],
    title: 'KR 날짜별 추이',
    description: '날짜마다 계정별 그날까지의 마지막 기록을 모아, 모든 계정 누적 조회수 합(KR1, 11/30까지)과 팔로워가 가장 많은 계정의 값(KR2).',
    fn: (accounts) => {
      const dates = Array.from(new Set(accounts.map((r) => r.date))).sort();
      const lastOf = new Map();
      const byDate = d3.group(accounts, (r) => r.date);
      return dates.map((date) => {
        for (const r of byDate.get(date) || []) lastOf.set(r.account, r);
        const rs = Array.from(lastOf.values());
        return {
          date,
          kr1: date <= '2026-11-30' ? d3.sum(rs, (r) => Number(r.views)) : null,
          kr2: d3.max(rs, (r) => Number(r.followers)),
          kr2_account: (rs.slice().sort((a, b) => Number(b.followers) - Number(a.followers))[0] || {}).account || '',
          accounts: rs.length,
        };
      });
    },
  });

  dash.calc('kr', {
    inputs: ['accounts_latest', 'kr_series'],
    title: 'KR 진행 상황',
    description: '모든 계정 누적 조회수 합(목표 10,000,000회)과 팔로워가 가장 많은 계정의 팔로워(목표 10,000명), 달성률, 전날 대비, 10/28부터 며칠째인지.',
    fn: (accounts_latest, kr_series) => {
      const top = (k) => accounts_latest.slice().sort((a, b) => b[k] - a[k])[0] || {};
      const f = top('followers'), l = top('views');
      const asOf = d3.max(accounts_latest, (r) => r.date) || '';
      const day = asOf >= '2026-10-28' ? Math.min(34, Math.round((Date.parse(asOf) - Date.parse('2026-10-28')) / 86400000) + 1) : 0;
      const elapsed = day / 34;
      const s = kr_series.slice().sort((a, b) => a.date.localeCompare(b.date));
      const last = s[s.length - 1] || {}, prev = s[s.length - 2] || null;
      const inWin = s.filter((r) => r.kr1 != null);
      const kr1 = inWin.length ? inWin[inWin.length - 1].kr1 : 0, kr2 = f.followers || 0;
      const state = (share) => day === 0 ? 'before' : share >= elapsed ? 'ahead' : 'behind';
      return [{
        as_of: asOf, as_of_time: d3.max(accounts_latest, (r) => r.collected_at) || asOf, day, elapsed,
        kr1_account: '계정 ' + accounts_latest.length + '개 합', kr1_value: kr1, kr1_share: kr1 / 10000000, kr1_state: state(kr1 / 10000000),
        kr1_delta: prev && prev.kr1 != null && last.kr1 != null ? last.kr1 - prev.kr1 : null,
        kr2_account: f.account || '', kr2_value: kr2, kr2_share: kr2 / 10000, kr2_state: state(kr2 / 10000),
        kr2_delta: prev ? last.kr2 - prev.kr2 : null, kr2_start: s.length ? s[0].kr2 : 0,
        lead_account: l.account || '', lead_views: l.views || 0,
      }];
    },
  });

  dash.calc('characters', {
    inputs: ['accounts_latest'],
    title: '캐릭터별 합계',
    description: '캐릭터마다 모든 플랫폼의 최신 팔로워와 누적 조회수를 더한 값.',
    fn: (accounts_latest) => Array.from(d3.rollup(accounts_latest, (rs) => ({
      followers: d3.sum(rs, (r) => r.followers), views: d3.sum(rs, (r) => r.views),
    }), (r) => r.character), ([character, o]) => ({character, ...o})),
  });

  dash.calc('videos_latest', {
    inputs: ['videos'],
    title: '영상별 최신 기록',
    description: '영상마다 가장 최근 기록의 조회수·좋아요·댓글·저장·공유, 올린 시각과 올린 지 며칠째인지.',
    fn: (videos) => Array.from(d3.group(videos, (r) => r.video_key), ([video_key, rows]) => {
      const last = rows.slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
      return {video_key, title: last.title, character: last.character, platform: last.platform, url: last.url, posted: last.posted,
        age_days: Math.round((Date.parse(last.date) - Date.parse(last.posted)) / 86400000),
        views: Number(last.views), likes: last.likes == null ? null : Number(last.likes),
        comments: last.comments == null ? null : Number(last.comments),
        saves: last.saves == null ? null : Number(last.saves), shares: last.shares == null ? null : Number(last.shares),
        posted_at: last.posted_at || last.posted, archived: !!last.archived};
    }).sort((a, b) => (a.archived - b.archived) || b.views - a.views),
  });


  // GROUPS:linkmap
  const LINKMAP = {"김춘자": {"인스타그램": "chunja_ins", "유튜브": "chunja_yt", "틱톡": "chunja_tt", "채널 구분 전": "chunja"}, "김태식": {"인스타그램": "taesik_ins", "유튜브": "taesik_yt", "틱톡": "taesik_tt", "채널 구분 전": "taesik"}, "건강봇 한국": {"인스타그램": "ahealth_bot_ins", "유튜브": "ahealth_bot_yt"}, "건강봇 일본": {"인스타그램": "ahealth_bot_jp_ins", "유튜브": "ahealth_bot_jp_yt"}, "건강봇 대만": {"인스타그램": "ahealth_bot_tw_ins", "유튜브": "ahealth_bot_tw_yt"}, "뼈톡 한국": {"인스타그램": "bonetalk_ins", "유튜브": "bonetalk_yt", "틱톡": "bonetalk_tt"}, "뼈톡 일본": {"인스타그램": "bonetalk_jp_ins", "유튜브": "bonetalk_jp_yt"}, "뼈톡 대만": {"인스타그램": "bonetalk_tw_ins", "유튜브": "bonetalk_tw_yt"}, "냉미남 한국": {"인스타그램": "ahealth_lover_ins", "유튜브": "ahealth_lover_yt"}, "냉미남 일본": {"인스타그램": "ahealth_lover_jp_ins", "유튜브": "ahealth_lover_jp_yt"}, "냉미남 대만": {"인스타그램": "ahealth_lover_tw_ins", "유튜브": "ahealth_lover_tw_yt"}};
  // /GROUPS:linkmap
  dash.calc('link_totals', {
    inputs: ['links'],
    title: '링크별 누적 클릭·설치',
    description: '캐릭터 × 채널 링크마다 누적 클릭·설치와 가장 최근 날짜의 클릭.',
    fn: (links) => {
      const out = [];
      for (const ch of Object.keys(LINKMAP)) for (const channel of ['인스타그램', '유튜브', '틱톡', '채널 구분 전']) {
        const rs = links.filter((r) => r.character === ch && r.channel === channel);
        const slug = LINKMAP[ch][channel];
        if (!slug && !rs.length) continue;
        const lastDate = d3.max(rs, (r) => r.date) || null;
        out.push({character: ch, channel, link: slug ? 'ahealth.onelink.me/0mmS/' + slug : '',
          clicks: d3.sum(rs, (r) => Number(r.clicks)), installs: d3.sum(rs, (r) => Number(r.installs)),
          last_date: lastDate, last_clicks: lastDate ? d3.sum(rs.filter((r) => r.date === lastDate), (r) => Number(r.clicks)) : 0});
      }
      return out;
    },
  });

  dash.calc('link_char', {
    inputs: ['links'],
    title: '캐릭터별 링크 합계',
    description: '캐릭터마다 모든 소개 링크의 누적 클릭·설치.',
    fn: (links) => Object.keys(LINKMAP).map((character) => ({character,
      clicks: d3.sum(links.filter((r) => r.character === character), (r) => Number(r.clicks)),
      installs: d3.sum(links.filter((r) => r.character === character), (r) => Number(r.installs))})),
  });


  dash.calc('visit_latest', {
    inputs: ['profile_visits'],
    title: '플랫폼별 프로필 방문',
    description: '캐릭터 × 플랫폼마다 가장 최근 누적 프로필 방문, 마지막 하루 방문(틱톡), 외부 링크 누름(인스타).',
    fn: (pv) => {
      const out = [];
      for (const ch of Object.keys(LINKMAP)) for (const platform of ['인스타그램', '틱톡', '유튜브']) {
        if (!LINKMAP[ch][platform] && !pv.some((r) => r.character === ch && r.platform === platform)) continue;
        const rs = pv.filter((r) => r.character === ch && r.platform === platform).sort((a, b) => a.date.localeCompare(b.date));
        const last = rs[rs.length - 1];
        const lastDaily = rs.filter((r) => r.daily != null).pop();
        out.push({character: ch, platform, has: !!last, total: last ? Number(last.total) : null, date: last ? last.date : null,
          daily: lastDaily ? Number(lastDaily.daily) : null, daily_date: lastDaily ? lastDaily.date : null,
          link_taps: last && last.link_taps != null ? Number(last.link_taps) : null});
      }
      return out;
    },
  });

  // GROUPS:chars
  const CHARS = ["김춘자", "몽인턴", "김태식", "건강봇 한국", "건강봇 일본", "건강봇 대만", "뼈톡 한국", "뼈톡 일본", "뼈톡 대만", "냉미남 한국", "냉미남 일본", "냉미남 대만"];
  const GROUP_COLOR = {"뼈톡 한국": "#FF9500", "뼈톡 일본": "#E0A800", "뼈톡 대만": "#FF6B3D", "냉미남 한국": "#30B0C7", "냉미남 일본": "#3A7BD5", "냉미남 대만": "#2BB5A0"};
  // /GROUPS:chars
  const PLAT = {'인스타그램': 'IG', '유튜브': 'YT', '틱톡': 'TT'};
  const num = d3.format(',');
  const compact = (x) => x >= 10000 ? Intl.NumberFormat('ko', {notation: 'compact', maximumFractionDigits: 1}).format(x) : num(x);
  const fmts = {n: num, pct: (x) => (x > 0 && x < 0.01 ? d3.format('.2%') : d3.format('.1%'))(x), pct0: d3.format('.0%'), t: (x) => String(x)};
  const rowsOf = (id) => { const g = dash.data(id); return g.status === 'ok' && Array.isArray(g.data) ? g.data : null; };
  const YONA = {blue: '#0096FA', pink: '#FF2D55', green: '#34C759', purple: '#CB30E0'};
  const CHAR_COLOR = {'김춘자': YONA.pink, '몽인턴': YONA.green, '김태식': YONA.purple, '건강봇 한국': YONA.blue, '건강봇 일본': '#5856D6', '건강봇 대만': '#00A3A3', ...GROUP_COLOR};
  const colorOf = (character) => CHAR_COLOR[character] || YONA.blue;
  const when = (iso) => iso ? iso.slice(5, 10).replace('-', '/') + (iso.length > 10 ? ' ' + iso.slice(11, 16) : '') : '—';
  const signed = (x) => x == null ? '—' : (x > 0 ? '▲ +' : x < 0 ? '▼ ' : '') + num(x);

  const paint = () => {
    document.querySelectorAll('#dash-root [data-ci]').forEach((el) => el.style.setProperty('--om-c', colorOf(CHARS[Number(el.dataset.ci)])));
    document.querySelectorAll('#dash-root .om-kr[data-kr]').forEach((el) => el.style.setProperty('--om-c', YONA.blue));
  };
  paint();
  dash.onData(paint);

  const pick = (el) => {
    const rows = rowsOf(el.dataset.source);
    if (!rows) return null;
    let r;
    if (el.dataset.where) {
      const i = el.dataset.where.indexOf('=');
      const k = el.dataset.where.slice(0, i), val = decodeURIComponent(el.dataset.where.slice(i + 1));
      r = rows.find((x) => String(x[k]) === val);
    } else r = rows[Number(el.dataset.row || 0)];
    return r ? r[el.dataset.field] : null;
  };

  dash.draw('v', (el) => {
    const v = pick(el);
    el.textContent = v == null || v === '' ? '—' : fmts[el.dataset.fmt || 'n'](v);
  });

  dash.draw('delta', (el) => {
    const v = pick(el);
    el.textContent = signed(v);
    el.style.color = v > 0 ? 'var(--color-ok)' : v < 0 ? 'var(--color-bad)' : 'var(--color-fg-muted)';
  });

  dash.draw('bar', (el) => {
    const v = Number(pick(el));
    if (pick(el) == null || Number.isNaN(v)) { el.textContent = '—'; return; }
    const fill = document.createElement('div');
    fill.className = 'om-fill';
    fill.style.width = Math.min(100, v * 100) + '%';
    el.replaceChildren(fill);
  });

  dash.draw('clock', (el) => {
    const v = pick(el);
    if (v == null) { el.textContent = '—'; return; }
    const fill = document.createElement('div');
    fill.className = 'om-clock-fill';
    fill.style.width = Math.min(100, (Number(v) / 34) * 100) + '%';
    el.replaceChildren(fill);
  });

  dash.draw('status', (el) => {
    const st = pick(el) || 'before';
    el.textContent = '';
    el.parentElement.querySelectorAll('.om-pill[data-state]').forEach((p) => { p.hidden = p.dataset.state !== st; });
  });

  const sparkline = (pts, color, w, h) => {
    const svg = d3.create('svg').attr('width', w).attr('height', h).attr('viewBox', `0 0 ${w} ${h}`);
    if (!pts.length) return svg.node();
    const x = pts.length > 1 ? d3.scaleLinear([0, pts.length - 1], [3, w - 4]) : () => w - 4;
    const y = d3.scaleLinear([0, d3.max(pts) || 1], [h - 3, 3]);
    if (pts.length > 1) {
      svg.append('path').attr('d', d3.line().x((_, i) => x(i)).y((p) => y(p))(pts))
        .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
    } else {
      svg.append('line').attr('x1', 3).attr('x2', w - 4).attr('y1', y(pts[0])).attr('y2', y(pts[0]))
        .attr('stroke', 'var(--cds-chart-grid)').attr('stroke-width', 2).attr('stroke-dasharray', '3 3');
    }
    svg.append('circle').attr('cx', x(pts.length - 1)).attr('cy', y(pts[pts.length - 1])).attr('r', 3.5).attr('fill', color);
    return svg.node();
  };

  dash.draw('accts', (el) => {
    const latest = rowsOf('accounts_latest');
    const hist = rowsOf('accounts') || [];
    if (!latest) { el.replaceChildren(); return; }
    const ch = el.dataset.character;
    const color = colorOf(ch);
    const order = ['유튜브', '인스타그램', '틱톡'];
    const mine = latest.filter((r) => r.character === ch).sort((a, b) => b.views - a.views || order.indexOf(a.platform) - order.indexOf(b.platform));
    el.replaceChildren(...mine.map((r) => {
      const card = document.createElement('div');
      card.className = 'om-acct';
      const top = document.createElement('div');
      top.className = 'om-acct-top';
      const chip = document.createElement('span');
      chip.className = 'om-chip';
      chip.textContent = PLAT[r.platform] || r.platform;
      const name = document.createElement('span');
      name.textContent = r.platform;
      const link = document.createElement('a');
      link.href = r.url; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = '@' + r.handle;
      top.append(chip, name, link);
      const left = document.createElement('div');
      const big = document.createElement('div');
      big.className = 'om-acct-num';
      big.textContent = compact(r.views);
      const unit = document.createElement('small');
      unit.textContent = '회 조회';
      big.append(unit);
      const meta = document.createElement('div');
      meta.className = 'om-acct-meta';
      const fb = document.createElement('b'); fb.textContent = num(r.followers);
      const pb = document.createElement('b'); pb.textContent = num(r.posts);
      meta.append('팔로워 ', fb, ' · 영상 ', pb);
      if (r.views_change != null) {
        const d = document.createElement('span');
        d.textContent = ' · 전날 ' + signed(r.views_change);
        d.style.color = r.views_change > 0 ? 'var(--color-ok)' : 'var(--color-fg-muted)';
        meta.append(d);
      }
      left.append(big, meta);
      const pts = hist.filter((h) => h.account === r.account).sort((a, b) => a.date.localeCompare(b.date)).map((h) => Number(h.views));
      card.append(top, left, sparkline(pts, color, 96, 36));
      return card;
    }));
    if (!mine.length) {
      const empty = document.createElement('div');
      empty.className = 'om-empty';
      empty.textContent = '기록된 계정이 없어요';
      el.append(empty);
    }
  });

  dash.draw('krchart', (el) => {
    const rows = rowsOf('kr_series');
    el.replaceChildren();
    if (!rows) return;
    const k = el.dataset.kr;
    const key = 'kr' + k;
    const target = k === '1' ? 10000000 : 10000;
    const start = new Date(k === '1' ? '2026-10-28T00:00:00' : '2026-10-29T00:00:00');
    const nov1 = new Date('2026-11-01T00:00:00');
    const end = new Date('2026-11-30T00:00:00');
    const color = YONA.blue;
    const pts = rows.filter((r) => r[key] != null).map((r) => ({d: new Date(r.date + 'T00:00:00'), v: Number(r[key]), day: r.date}));
    const W = Math.max(280, el.clientWidth || 560), H = 230;
    const unit = k === '1' ? '회' : '명';
    const y = d3.scaleLinear([0, target * 1.12], [H - 22, 8]);
    const ticks = [0, target / 2, target];
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const probe = svg.append('text').attr('font-size', 11).text(compact(target));
    const left = Math.ceil(probe.node().getComputedTextLength() * 1.15) + 16;
    probe.remove();
    const tLabel = svg.append('text').attr('font-size', 11).text('목표 ' + compact(target));
    const right = Math.ceil(tLabel.node().getComputedTextLength() * 1.15) + 28;
    tLabel.remove();
    const x = d3.scaleTime([start, end], [left, W - right]);
    svg.append('rect').attr('x', x(nov1)).attr('y', 4).attr('width', x(end) - x(nov1)).attr('height', H - 26)
      .attr('fill', 'var(--cds-chart-grid)').attr('opacity', k === '2' ? .6 : 0);
    svg.append('g').selectAll('line').data(ticks).join('line')
      .attr('x1', left).attr('x2', W - right).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text')
      .attr('x', left - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').attr('font-size', 11)
      .attr('fill', 'var(--color-fg-muted)').text((t) => compact(t));
    svg.append('line').attr('x1', left).attr('x2', W - right).attr('y1', y(target)).attr('y2', y(target))
      .attr('stroke', 'var(--cds-chart-reference)').attr('stroke-width', 1.5);
    svg.append('text').attr('x', W - right + 6).attr('y', y(target) + 4).attr('font-size', 11)
      .attr('fill', 'var(--color-fg-muted)').text('목표 ' + compact(target));
    svg.append('line').attr('x1', x(k === '1' ? start : nov1)).attr('y1', y(k === '1' ? 0 : (pts.length ? pts[0].v : 0)))
      .attr('x2', x(end)).attr('y2', y(target)).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 4');
    const xt = [start, new Date('2026-11-15T00:00:00'), end];
    svg.append('g').selectAll('text').data(xt).join('text')
      .attr('x', x).attr('y', H - 5).attr('text-anchor', (d, i) => i === 0 ? 'start' : i === xt.length - 1 ? 'end' : 'middle')
      .attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(d3.timeFormat('%-m/%-d'));
    if (pts.length) {
      if (pts.length > 1) {
        svg.append('path').attr('d', d3.line().x((p) => x(p.d)).y((p) => y(p.v))(pts)).attr('fill', 'none')
          .attr('stroke', color).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
      }
      const lastP = pts[pts.length - 1];
      svg.append('circle').attr('cx', x(lastP.d)).attr('cy', y(lastP.v)).attr('r', 4.5).attr('fill', color);
      svg.append('text').attr('x', x(lastP.d) + 8).attr('y', y(lastP.v) - 8).attr('font-size', 12).attr('font-weight', 700)
        .attr('fill', 'var(--color-fg)').text(num(lastP.v));
    }
    const tip = document.createElement('div');
    tip.className = 'om-tip';
    tip.hidden = true;
    el.append(tip);
    svg.on('mousemove', (event) => {
      if (!pts.length) return;
      const [mx] = d3.pointer(event);
      const t = x.invert(mx);
      const p = pts.reduce((a, b) => Math.abs(b.d - t) < Math.abs(a.d - t) ? b : a);
      const head = document.createElement('div'); head.className = 'd'; head.textContent = p.day;
      const val = document.createElement('div'); val.textContent = num(p.v) + unit;
      tip.replaceChildren(head, val);
      tip.hidden = false;
      const bw = el.clientWidth;
      tip.style.left = Math.max(0, Math.min(bw - tip.offsetWidth, (x(p.d) / W) * bw + 10)) + 'px';
      tip.style.top = '4px';
    });
    svg.on('mouseleave', () => { tip.hidden = true; });
  });

  dash.calc('bot_eps', {
    inputs: ['videos_latest'],
    title: '건강봇 편별 나라 비교',
    description: '건강봇 한국·일본·대만 계정의 같은 제목 영상을 묶어 나라별 조회수(인스타+유튜브)와 합계.',
    fn: (videos_latest) => Array.from(d3.group(videos_latest.filter((r) => r.character.startsWith('건강봇')), (r) => r.title), ([title, rs]) => {
      const by = (c) => { const x = rs.filter((r) => r.character === c); return x.length ? d3.sum(x, (r) => r.views) : null; };
      return {title, posted: d3.min(rs, (r) => r.posted), kr: by('건강봇 한국'), jp: by('건강봇 일본'), tw: by('건강봇 대만'), total: d3.sum(rs, (r) => r.views)};
    }).sort((a, b) => b.posted.localeCompare(a.posted) || b.total - a.total),
  });

  dash.draw('boteps', (el) => {
    const rows = rowsOf('bot_eps');
    if (!rows) { el.replaceChildren(); return; }
    el.replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      const td = (t, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.textContent = t; tr.append(c); return c; };
      td(r.title); td(when(r.posted));
      const best = d3.max([r.kr, r.jp, r.tw].map((v) => v || 0));
      for (const [k, ch] of [['kr', '건강봇 한국'], ['jp', '건강봇 일본'], ['tw', '건강봇 대만']]) {
        const c = td(r[k] == null ? '—' : num(r[k]), 'num');
        if (r[k] != null && r[k] === best && best > 0) { c.style.fontWeight = '800'; c.style.color = colorOf(ch); }
      }
      td(num(r.total), 'num').style.fontWeight = '700';
      return tr;
    }));
  });

  dash.draw('vids', (el) => {
    const rows = rowsOf('videos_latest');
    if (!rows) { el.replaceChildren(); return; }
    const vmax = d3.max(rows.filter((r) => !r.archived), (r) => r.views) || 1;
    el.replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.key = r.video_key;
      if (r.archived) tr.className = 'om-archived';
      const td = (text, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; if (text != null) c.textContent = text; tr.append(c); return c; };
      const t = td(null);
      const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = r.title;
      t.append(a);
      if (r.archived) { const tag = document.createElement('span'); tag.className = 'om-paused'; tag.textContent = '보관됨'; t.append(' ', tag); }
      const c = td(null);
      const dot = document.createElement('span'); dot.className = 'om-dot'; dot.style.background = colorOf(r.character);
      c.append(dot, r.character);
      td(r.platform);
      td(when(r.posted_at));
      for (const k of ['likes', 'comments', 'saves', 'shares']) td(r[k] == null ? '—' : num(r[k]), 'num');
      const v = td(null, 'num');
      const wrap = document.createElement('div'); wrap.className = 'om-viewbar';
      const bar = document.createElement('i'); bar.style.width = Math.max(2, (r.views / vmax) * 80) + 'px'; bar.style.background = colorOf(r.character);
      const n = document.createElement('span'); n.textContent = num(r.views);
      wrap.append(bar, n);
      v.append(wrap);
      return tr;
    }));
  });
  dash.calc('episodes', {
    inputs: ['videos_latest'],
    title: '게시물별 합계',
    description: '같은 캐릭터가 같은 제목으로 여러 플랫폼에 올린 영상을 한 게시물로 묶어 조회수·좋아요를 더한 값.',
    fn: (videos_latest) => Array.from(d3.group(videos_latest, (r) => r.character + '|' + r.title), ([ep_key, rs]) => ({
      ep_key, character: rs[0].character, title: rs[0].title, posted: d3.min(rs, (r) => r.posted), posted_at: d3.min(rs, (r) => r.posted_at),
      views: d3.sum(rs.filter((r) => !r.archived), (r) => r.views), likes: d3.sum(rs, (r) => r.likes || 0), platforms: rs.length,
    })).sort((a, b) => b.posted_at.localeCompare(a.posted_at) || b.views - a.views),
  });


  const CHAN_CHIP = {'인스타그램': 'IG', '유튜브': 'YT', '틱톡': 'TT', '채널 구분 전': '공용'};
  dash.draw('links', (el) => {
    const rows = rowsOf('link_totals');
    if (!rows) { el.replaceChildren(); return; }
    el.replaceChildren(...rows.filter((r) => r.character === el.dataset.character).map((r) => {
      const card = document.createElement('div');
      card.className = 'om-lk' + (r.channel === '채널 구분 전' ? ' old' : '');
      const nm = document.createElement('div'); nm.className = 'om-lk-name';
      const chip = document.createElement('span'); chip.className = 'om-chip'; chip.textContent = CHAN_CHIP[r.channel];
      nm.append(chip, r.channel);
      const url = document.createElement(r.link ? 'a' : 'div'); url.className = 'om-lk-url'; url.textContent = r.link || '링크 없음';
      if (r.link) { url.href = 'https://' + r.link; url.target = '_blank'; url.rel = 'noopener'; }
      const big = document.createElement('div'); big.className = 'om-lk-big'; big.textContent = num(r.clicks);
      const u = document.createElement('small'); u.textContent = '클릭'; big.append(u);
      const meta = document.createElement('div'); meta.className = 'om-acct-meta';
      const ib = document.createElement('b'); ib.textContent = num(r.installs);
      meta.append('설치 ', ib);
      if (r.last_date) meta.append(' · ' + when(r.last_date) + ' ' + num(r.last_clicks) + '클릭');
      else meta.append(' · 아직 클릭 없음');
      card.append(nm, url, big, meta);
      return card;
    }));
  });


  dash.draw('visits', (el) => {
    const rows = rowsOf('visit_latest');
    if (!rows) { el.replaceChildren(); return; }
    el.replaceChildren(...rows.filter((r) => r.character === el.dataset.character).map((r) => {
      const card = document.createElement('div');
      card.className = 'om-lk' + (r.has ? '' : ' old');
      const nm = document.createElement('div'); nm.className = 'om-lk-name';
      const chip = document.createElement('span'); chip.className = 'om-chip'; chip.textContent = PLAT[r.platform];
      nm.append(chip, r.platform);
      card.append(nm);
      if (!r.has) {
        const m = document.createElement('div'); m.className = 'om-acct-meta';
        m.textContent = r.platform === '유튜브' ? '유튜브는 프로필 방문 수를 제공하지 않아요' : r.platform === '틱톡' ? '틱톡은 로그인된 계정만 읽혀요' : '아직 못 읽었어요';
        card.append(m); return card;
      }
      const big = document.createElement('div'); big.className = 'om-lk-big'; big.textContent = num(r.total);
      const u = document.createElement('small'); u.textContent = '회 방문 누적'; big.append(u);
      const meta = document.createElement('div'); meta.className = 'om-acct-meta';
      meta.append(when(r.date) + '까지');
      if (r.daily != null) { const b = document.createElement('b'); b.textContent = num(r.daily); meta.append(' · ' + when(r.daily_date) + ' 하루 ', b, '회'); }
      if (r.link_taps != null) { const b = document.createElement('b'); b.textContent = num(r.link_taps); meta.append(' · 링크 누름 ', b, '회'); }
      card.append(big, meta);
      return card;
    }));
  });

  dash.draw('linkrows', (el) => {
    const rows = rowsOf('links');
    if (!rows) { el.replaceChildren(); return; }
    el.replaceChildren(...rows.slice().sort((a, b) => b.date.localeCompare(a.date) || a.character.localeCompare(b.character) || a.channel.localeCompare(b.channel)).map((r) => {
      const tr = document.createElement('tr');
      const td = (t, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.textContent = t; tr.append(c); return c; };
      td(when(r.date));
      const c = td('');
      const dot = document.createElement('span'); dot.className = 'om-dot'; dot.style.background = colorOf(r.character);
      c.append(dot, r.character);
      const chn = td(r.channel);
      if (r.date <= '2026-11-12') { const tag = document.createElement('span'); tag.className = 'om-paused'; tag.textContent = '시험 포함'; chn.append(' ', tag); }
      td(num(r.clicks), 'num'); td(num(r.installs), 'num');
      return tr;
    }));
  });

  dash.draw('linkchart', (el) => {
    const rows = rowsOf('links');
    el.replaceChildren();
    if (!rows || !rows.length) return;
    const days = Array.from(new Set(rows.map((r) => r.date))).sort();
    const chars = Array.from(new Set(rows.map((r) => r.character))).filter((c) => LINKMAP[c]);
    const data = days.map((d) => ({d, ...Object.fromEntries(chars.map((c) => [c, d3.sum(rows.filter((r) => r.date === d && r.character === c), (r) => Number(r.clicks))]))}));
    const W = Math.max(280, el.clientWidth || 560), H = 200;
    const ymax = d3.max(data, (r) => d3.max(chars, (c) => r[c])) || 1;
    const y = d3.scaleLinear([0, ymax], [H - 24, 12]).nice();
    const yt = y.ticks(4);
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const left = 34;
    const x0 = d3.scaleBand(days, [left, W - 8]).padding(0.25);
    const x1 = d3.scaleBand(chars, [0, x0.bandwidth()]).padding(0.1);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', left).attr('x2', W - 8).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', left - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((t) => num(t));
    const g = svg.append('g').selectAll('g').data(data).join('g').attr('transform', (r) => `translate(${x0(r.d)},0)`);
    g.selectAll('rect').data((r) => chars.map((c) => ({c, v: r[c], d: r.d}))).join('rect')
      .attr('x', (p) => x1(p.c)).attr('width', x1.bandwidth()).attr('y', (p) => y(p.v)).attr('height', (p) => Math.max(0, y(0) - y(p.v)))
      .attr('rx', 3).attr('fill', (p) => colorOf(p.c)).append('title').text((p) => `${p.d} ${p.c} ${num(p.v)}클릭`);
    svg.append('g').selectAll('text').data(days).join('text').attr('x', (d) => x0(d) + x0.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => when(d));
  });

  // tabs
  const pages = () => document.querySelectorAll('#dash-root .om-page[data-page]');
  const show = (name) => {
    let found = false;
    pages().forEach((pg) => { pg.hidden = pg.dataset.page !== name; if (!pg.hidden) found = true; });
    if (!found) { pages().forEach((pg) => { pg.hidden = pg.dataset.page !== 'all'; }); name = 'all'; }
    document.querySelectorAll('#dash-root .om-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  };
  document.querySelectorAll('#dash-root .om-tab').forEach((t) => t.addEventListener('click', () => {
    show(t.dataset.tab);
    dash.setLink(t.dataset.tab === 'all' ? 'all' : 'p-' + t.dataset.tab);
  }));
  document.querySelectorAll('#dash-root .om-goto').forEach((b) => b.addEventListener('click', () => {
    show(b.dataset.goto);
    dash.setLink('p-' + b.dataset.goto);
    const top = document.getElementById('tabs');
    if (top) top.scrollIntoView();
  }));
  const hash = location.hash.slice(1);
  if (hash.startsWith('p-')) show(hash.slice(2));

  // episode selection per character
  const chosen = {};
  const PLAT_ORDER = ['유튜브', '인스타그램', '틱톡'];
  const PLAT_COLOR = {'유튜브': YONA.pink, '인스타그램': YONA.purple};
  const platColor = (p) => PLAT_COLOR[p] || 'var(--color-fg)';

  dash.draw('eplist', (el) => {
    const rows = rowsOf('episodes');
    if (!rows) { el.replaceChildren(); return; }
    const ch = el.dataset.character;
    const mine = rows.filter((r) => r.character === ch);
    if (!mine.length) {
      const e = document.createElement('div'); e.className = 'om-empty'; e.textContent = '아직 올린 게시물이 없어요';
      el.replaceChildren(e); return;
    }
    if (!chosen[ch] || !mine.some((r) => r.ep_key === chosen[ch])) chosen[ch] = mine[0].ep_key;
    el.replaceChildren(...mine.map((r) => {
      const b = document.createElement('button');
      b.className = 'om-ep';
      b.setAttribute('aria-pressed', String(r.ep_key === chosen[ch]));
      const t = document.createElement('span'); t.className = 'om-ep-title'; t.textContent = r.title;
      const m = document.createElement('span'); m.className = 'om-ep-meta';
      const v = document.createElement('b'); v.textContent = num(r.views);
      const d = document.createElement('span'); d.textContent = when(r.posted_at) + ' 올림';
      const pl = document.createElement('span'); pl.textContent = '플랫폼 ' + r.platforms + '곳';
      m.append(v, '회', d, pl);
      b.append(t, m);
      b.addEventListener('click', () => { chosen[ch] = r.ep_key; dash.draw('eplist'); dash.draw('epdetail'); });
      return b;
    }));
  });

  dash.draw('epdetail', (el) => {
    const latest = rowsOf('videos_latest');
    const hist = rowsOf('videos') || [];
    el.replaceChildren();
    if (!latest) return;
    const ch = el.dataset.character;
    const key = chosen[ch];
    const mine = latest.filter((r) => r.character === ch && key === r.character + '|' + r.title);
    if (!mine.length) return;
    const head = document.createElement('div'); head.className = 'om-ep-h';
    const h3 = document.createElement('h3'); h3.textContent = mine[0].title;
    const sub = document.createElement('span'); sub.textContent = '합계 ' + num(d3.sum(mine, (r) => r.views)) + '회 · ' + when(d3.min(mine, (r) => r.posted_at)) + ' 처음 올림';
    head.append(h3, sub);
    const plats = document.createElement('div'); plats.className = 'om-plats';
    for (const p of PLAT_ORDER) {
      const r = mine.find((x) => x.platform === p);
      const card = document.createElement('div');
      card.className = 'om-plat' + (r ? (r.archived ? ' om-archived' : '') : ' none');
      card.style.setProperty('--om-pc', platColor(p));
      if (!r) { card.textContent = p + '에는 올리지 않았어요'; plats.append(card); continue; }
      const nm = document.createElement('div'); nm.className = 'om-plat-name';
      const nt = document.createElement('span'); nt.textContent = r.archived ? p + ' · 보관됨' : p;
      const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = '열기 ↗';
      nm.append(nt, a);
      const big = document.createElement('div'); big.className = 'om-plat-big'; big.textContent = num(r.views);
      const u = document.createElement('small'); u.textContent = '회 조회'; big.append(u);
      const st = document.createElement('div'); st.className = 'om-stats';
      const prevRow = hist.filter((h) => h.video_key === r.video_key).sort((x, y) => x.date.localeCompare(y.date)).slice(-2);
      const dv = prevRow.length === 2 ? Number(prevRow[1].views) - Number(prevRow[0].views) : null;
      for (const [label, val] of [['좋아요', r.likes], ['댓글', r.comments], ['저장', r.saves], ['공유', r.shares], ['전날 대비 조회', dv], ['올린 시각', r.posted_at]]) {
        const l = document.createElement('span'); l.textContent = label;
        const b = document.createElement('b');
        b.textContent = val == null ? '—' : label === '전날 대비 조회' ? signed(val) : label === '올린 시각' ? when(val) : num(val);
        st.append(l, b);
      }
      card.append(nm, big, st);
      plats.append(card);
    }
    const chartBox = document.createElement('div'); chartBox.className = 'om-epchart';
    el.append(head, plats, chartBox);
    const series = mine.map((r) => ({
      name: r.platform, color: platColor(r.platform),
      pts: hist.filter((h) => h.video_key === r.video_key).map((h) => ({d: new Date(h.date + 'T00:00:00'), v: Number(h.views), day: h.date})).sort((a, b) => a.d - b.d),
    }));
    const all = series.flatMap((s) => s.pts);
    const W = Math.max(280, chartBox.clientWidth || el.clientWidth || 560), H = 220;
    let [d0, d1] = d3.extent(all, (p) => p.d);
    const posted = new Date(d3.min(mine, (r) => r.posted) + 'T00:00:00');
    if (posted < d0) d0 = posted;
    const minEnd = d3.timeDay.offset(d0, 7);
    if (d1 < minEnd) d1 = minEnd;
    const y = d3.scaleLinear([0, d3.max(all, (p) => p.v) || 1], [H - 24, 12]).nice();
    const svg = d3.select(chartBox).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const yt = y.ticks(4);
    const probe = svg.append('text').attr('font-size', 11).text(num(d3.max(yt)));
    const left = Math.ceil(probe.node().getComputedTextLength()) + 10;
    probe.remove();
    const x = d3.scaleTime([d0, d1], [left, W - 70]);
    svg.append('g').selectAll('line').data(yt).join('line').attr('x1', left).attr('x2', W - 70).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(yt).join('text').attr('x', left - 6).attr('y', (t) => y(t) + 4).attr('text-anchor', 'end')
      .attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((t) => num(t));
    const xt = x.ticks(Math.min(6, Math.max(2, Math.floor(W / 110))));
    svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle')
      .attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(d3.timeFormat('%-m/%-d'));
    const ends = [];
    series.forEach((s) => {
      if (s.pts.length > 1) svg.append('path').attr('d', d3.line().x((p) => x(p.d)).y((p) => y(p.v))(s.pts)).attr('fill', 'none')
        .attr('stroke', s.color).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
      svg.append('g').selectAll('circle').data(s.pts).join('circle').attr('cx', (p) => x(p.d)).attr('cy', (p) => y(p.v)).attr('r', 3.5).attr('fill', s.color);
      const lp = s.pts[s.pts.length - 1];
      if (lp) ends.push({s, y: y(lp.v), x: x(lp.d)});
    });
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    ends.forEach((e) => svg.append('text').attr('x', e.x + 8).attr('y', e.y + 4).attr('font-size', 11).attr('fill', e.s.color).text(e.s.name));
    const tip = document.createElement('div'); tip.className = 'om-tip'; tip.hidden = true; chartBox.append(tip);
    const days = Array.from(new Set(all.map((p) => p.day))).sort();
    svg.on('mousemove', (event) => {
      if (!days.length) return;
      const [mx] = d3.pointer(event);
      const t = x.invert(mx);
      const day = days.reduce((a, b) => Math.abs(new Date(b + 'T00:00:00') - t) < Math.abs(new Date(a + 'T00:00:00') - t) ? b : a);
      const hd = document.createElement('div'); hd.className = 'd'; hd.textContent = day;
      tip.replaceChildren(hd);
      series.forEach((s) => {
        const p = s.pts.find((q) => q.day === day);
        if (!p) return;
        const line = document.createElement('div');
        const dot = document.createElement('span'); dot.className = 'om-dot'; dot.style.background = s.color;
        line.append(dot, s.name + ' ' + num(p.v) + '회');
        tip.append(line);
      });
      tip.hidden = false;
      const bw = chartBox.clientWidth;
      tip.style.left = Math.max(0, Math.min(bw - tip.offsetWidth, (x(new Date(day + 'T00:00:00')) / W) * bw + 10)) + 'px';
      tip.style.top = '4px';
    });
    svg.on('mouseleave', () => { tip.hidden = true; });
  });

