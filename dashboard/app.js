// Token Radar's page. It reads window.RADAR (data.js, beside dashboard/) and draws four views from it:
// the Board (ranked, filterable, sortable), a detail view per protocol (the numbers, the arithmetic of the
// implied value, its nearest comparables and the farm plan), the Live tokens the model learns from, and
// the Not ranked list with its reasons. Filters and sort live in the URL hash, so a view can be shared
// and re-rendered exactly. No network: every byte the page shows is in data.js.
(function () {
  'use strict';

  var R = window.RADAR;
  var app = document.getElementById('view');
  var rows = R.rows.slice().sort(function (a, b) { return a.rank - b.rank; });
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.slug] = r; });
  var top = rows[0];
  var maxLog = Math.log10(top.implied_value_usd);
  var LOG_FLOOR = 5;

  var cats = uniq(rows.map(function (r) { return r.category || 'Uncategorised'; })).sort();
  var chains = uniq([].concat.apply([], rows.map(function (r) { return r.chains; }))).sort();
  var BANDS = [
    { key: '1b', label: '$1B and over', test: function (v) { return v >= 1e9; } },
    { key: '100m', label: '$100M to $1B', test: function (v) { return v >= 1e8 && v < 1e9; } },
    { key: '10m', label: '$10M to $100M', test: function (v) { return v >= 1e7 && v < 1e8; } },
    { key: 'lt10m', label: 'Under $10M', test: function (v) { return v < 1e7; } }
  ];
  var SORTS = {
    rank: { dir: 'asc', get: function (r) { return r.rank; } },
    value: { dir: 'desc', get: function (r) { return r.implied_value_usd; } },
    tvl: { dir: 'desc', get: function (r) { return r.tvl_usd; } },
    chg: { dir: 'desc', get: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; } },
    age: { dir: 'desc', get: function (r) { return r.age_days === null ? -1 : r.age_days; } }
  };
  var CONF = { low: 'thin record', medium: 'under a year', higher: 'a year or more' };

  /* ---------- helpers ---------- */
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(v >= 1e10 ? 1 : 2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e8 ? 0 : 1) + 'M';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + Math.round(v);
  }
  function pct(p, digits) {
    if (p === null || p === undefined) return '—';
    var s = (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(digits === undefined ? 1 : digits) + '%';
    return s;
  }
  function pctClass(p) { return p === null || p === undefined ? '' : p > 0 ? 'up' : p < 0 ? 'down' : ''; }
  function age(d) {
    if (d === null || d === undefined) return '—';
    return d < 365 ? Math.round(d / 30.4) + ' mo' : (d / 365).toFixed(1) + ' yr';
  }
  function barPx(v) {
    var x = (Math.log10(v) - LOG_FLOOR) / (maxLog - LOG_FLOOR);
    return Math.max(4, Math.min(1, x)) * 120;
  }
  function parseHash() {
    var raw = location.hash.replace(/^#/, '');
    var qAt = raw.indexOf('?');
    var path = qAt < 0 ? raw : raw.slice(0, qAt);
    var params = {};
    if (qAt >= 0) {
      raw.slice(qAt + 1).split('&').forEach(function (kv) {
        var i = kv.indexOf('=');
        if (i > 0) params[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
      });
    }
    var parts = path.split('/').filter(Boolean);
    return { view: parts[0] || 'board', slug: parts[1] ? decodeURIComponent(parts[1]) : null, params: params };
  }
  function qs(params) {
    var out = [];
    Object.keys(params).forEach(function (k) {
      if (params[k] !== '' && params[k] !== null && params[k] !== undefined && params[k] !== false) {
        out.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    });
    return out.join('&');
  }
  function setTab(view) {
    var links = document.querySelectorAll('.tabs a');
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute('data-tab') === view) links[i].setAttribute('aria-current', 'page');
      else links[i].removeAttribute('aria-current');
    }
  }
  function kpis() {
    var watch = rows.filter(function (r) { return r.watchlist; }).length;
    var c = R.calibration;
    document.getElementById('kpis').innerHTML =
      '<div class="kpi"><div class="label">Ranked protocols</div><div class="value">' + rows.length + '</div>' +
      '<div class="sub">records no token, not bridges, wrappers or exchanges</div></div>' +
      '<div class="kpi"><div class="label">Watchlist covered</div><div class="value">' + watch + ' / ' + R.watchlist_size + '</div>' +
      '<div class="sub">floor ' + usd(R.floor_usd) + ' TVL, the house watchlist</div></div>' +
      '<div class="kpi"><div class="label">Top implied value</div><div class="value">' + usd(top.implied_value_usd) + '</div>' +
      '<div class="sub">' + esc(top.name) + ', rank 1</div></div>' +
      '<div class="kpi"><div class="label">Comparables learned</div><div class="value">' + c.comparables + '</div>' +
      '<div class="sub">tokened protocols; slope ' + c.slope_b.toFixed(3) + ', scatter ±' + c.sd_dex.toFixed(2) + ' dex</div></div>';
    document.getElementById('ver').textContent = R.model_version;
    document.getElementById('snap').textContent = 'Snapshot ' + R.as_of + ' · DefiLlama · ' + R.calibration.comparables + ' tokened comparables';
  }

  /* ---------- board ---------- */
  function filterRows(p) {
    var q = (p.q || '').toLowerCase().trim();
    var band = null;
    for (var i = 0; i < BANDS.length; i++) if (BANDS[i].key === p.band) band = BANDS[i];
    return rows.filter(function (r) {
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      if (p.cat && (r.category || 'Uncategorised') !== p.cat) return false;
      if (p.chain && r.chains.indexOf(p.chain) < 0) return false;
      if (band && !band.test(r.implied_value_usd)) return false;
      if (p.w === '1' && !r.watchlist) return false;
      return true;
    });
  }
  function sortRows(list, p) {
    var key = SORTS[p.sort] ? p.sort : 'rank';
    var dir = p.dir === 'asc' || p.dir === 'desc' ? p.dir : SORTS[key].dir;
    var get = SORTS[key].get;
    var sign = dir === 'asc' ? 1 : -1;
    return list.slice().sort(function (a, b) { return sign * (get(a) - get(b)) || a.rank - b.rank; });
  }
  function renderBoard(p) {
    app.innerHTML =
      '<h1>Board</h1>' +
      '<p class="lede">Pre-token protocols ranked by the market value a token they could issue would carry, estimated from the market caps of tokened protocols in this snapshot. Bars run on a log scale. Open a row for the arithmetic and the farm plan.</p>' +
      '<section class="panel">' +
      '<div class="toolbar" role="search">' +
      '<label class="search">Find<input id="f-q" type="search" placeholder="Protocol name or slug" value="' + esc(p.q || '') + '"></label>' +
      '<label>Category<select id="f-cat"><option value="">All categories (' + cats.length + ')</option>' +
      cats.map(function (c) { return '<option' + (p.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Chain<select id="f-chain"><option value="">All chains (' + chains.length + ')</option>' +
      chains.map(function (c) { return '<option' + (p.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select></label>' +
      '<label>Implied value<select id="f-band"><option value="">Any band</option>' +
      BANDS.map(function (b) { return '<option value="' + b.key + '"' + (p.band === b.key ? ' selected' : '') + '>' + esc(b.label) + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="check"><input id="f-w" type="checkbox"' + (p.w === '1' ? ' checked' : '') + '> Watchlist only</label>' +
      '<button id="f-reset" type="button">Reset</button>' +
      '<span class="count" id="count" aria-live="polite"></span>' +
      '</div>' +
      '<div id="table-wrap"></div>' +
      '<div class="scale-note">Range is the 50% scatter of comparable market caps around the estimate. Records younger than a year carry less weight in the confidence label, not in the value.</div>' +
      '</section>';

    ['f-q', 'f-cat', 'f-chain', 'f-band', 'f-w'].forEach(function (id) {
      var el = document.getElementById(id);
      el.addEventListener(id === 'f-q' ? 'input' : 'change', function () { readFilters(); });
    });
    document.getElementById('f-reset').addEventListener('click', function () {
      writeHash({ view: 'board', params: {} });
      renderBoard({});
    });
    renderTable();
  }
  function readFilters() {
    var p = currentBoardParams();
    p.q = document.getElementById('f-q').value.trim();
    p.cat = document.getElementById('f-cat').value;
    p.chain = document.getElementById('f-chain').value;
    p.band = document.getElementById('f-band').value;
    p.w = document.getElementById('f-w').checked ? '1' : '';
    writeHash({ view: 'board', params: p });
    renderTable();
  }
  function currentBoardParams() {
    var h = parseHash();
    return {
      q: h.params.q || '', cat: h.params.cat || '', chain: h.params.chain || '', band: h.params.band || '',
      w: h.params.w || '', sort: h.params.sort || '', dir: h.params.dir || ''
    };
  }
  function writeHash(h) {
    var s = '#/' + h.view + (h.slug ? '/' + encodeURIComponent(h.slug) : '');
    var q = qs(h.params || {});
    history.replaceState(null, '', s + (q ? '?' + q : ''));
  }
  function renderTable() {
    var p = currentBoardParams();
    var list = sortRows(filterRows(p), p);
    var key = SORTS[p.sort] ? p.sort : 'rank';
    var dir = p.dir === 'asc' || p.dir === 'desc' ? p.dir : SORTS[key].dir;
    function th(k, label, cls) {
      var aria = key === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return '<th class="sortable ' + (cls || '') + '" data-sort="' + k + '" aria-sort="' + aria + '" tabindex="0">' + label + '</th>';
    }
    var html = '<table class="grid"><thead><tr>' +
      th('rank', '#', 'rank') +
      '<th>Protocol</th><th>Category</th><th>Chains</th>' +
      th('tvl', 'TVL', 'r') + th('chg', '7d', 'r') +
      th('value', 'Implied value', 'r') +
      '<th class="r">50% range</th>' +
      th('age', 'Record', '') +
      '</tr></thead><tbody>';
    list.forEach(function (r) {
      html += '<tr tabindex="0" data-slug="' + esc(r.slug) + '">' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td class="proto"><span class="n">' + esc(r.name) + '</span>' + (r.watchlist ? ' <span class="pill watch">watchlist</span>' : '') + '<span class="s">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="chains" title="' + esc(r.chains.join(', ')) + '">' + esc(r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '')) + '</td>' +
        '<td class="r num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="r num ' + pctClass(r.change_7d) + '">' + pct(r.change_7d) + '</td>' +
        '<td class="r"><span class="value">' + usd(r.implied_value_usd) + '</span><span class="bar" style="width:' + barPx(r.implied_value_usd).toFixed(0) + 'px"></span></td>' +
        '<td class="r range">' + usd(r.band_low_usd) + ' to ' + usd(r.band_high_usd) + '</td>' +
        '<td><span class="pill ' + (r.confidence === 'low' ? 'low' : '') + '">' + age(r.age_days) + ', ' + CONF[r.confidence] + '</span></td>' +
        '</tr>';
    });
    if (list.length === 0) html += '<tr><td colspan="9" class="empty">No protocol matches these filters. Reset them to see the whole board.</td></tr>';
    html += '</tbody></table>';
    document.getElementById('table-wrap').innerHTML = html;
    document.getElementById('count').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' ranked';
    var heads = document.querySelectorAll('th.sortable');
    for (var i = 0; i < heads.length; i++) {
      heads[i].addEventListener('click', onSort);
      heads[i].addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort.call(this); } });
    }
    var trs = document.querySelectorAll('tr[data-slug]');
    for (var j = 0; j < trs.length; j++) {
      trs[j].addEventListener('click', openRow);
      trs[j].addEventListener('keydown', function (e) { if (e.key === 'Enter') openRow.call(this); });
    }
  }
  function onSort() {
    var k = this.getAttribute('data-sort');
    var p = currentBoardParams();
    var cur = SORTS[p.sort] ? p.sort : 'rank';
    var dir;
    if (cur === k) dir = (p.dir || SORTS[k].dir) === 'asc' ? 'desc' : 'asc';
    else dir = SORTS[k].dir;
    p.sort = k; p.dir = dir;
    writeHash({ view: 'board', params: p });
    renderTable();
  }
  function openRow() { location.hash = '#/p/' + encodeURIComponent(this.getAttribute('data-slug')); }

  /* ---------- detail ---------- */
  function renderDetail(slug) {
    var r = bySlug[slug];
    if (!r) {
      app.innerHTML = '<h1>Protocol not on the board</h1><p class="lede">No ranked row carries the slug <code>' + esc(slug || '') + '</code>. <a href="#/board">Back to the board</a>.</p>';
      return;
    }
    var f = r.reasoning;
    var base = f.comparable_base_usd;
    var afterFam = base * (1 + f.family_adj_pct / 100);
    var afterChain = afterFam * (1 + f.chain_adj_pct / 100);
    var afterWrap = afterChain * (1 + f.wrapper_adj_pct / 100);
    var c = R.calibration;
    var rowsHtml =
      '<li><span class="k">1. TVL today</span><span class="formula">DefiLlama, ' + esc(R.as_of) + '</span><span class="f">' + usd(r.tvl_usd) + '</span></li>' +
      '<li><span class="k">2. Smoothed TVL</span><span class="f">' + usd(f.smoothed_tvl_usd) + '</span>' +
      '<span class="formula">mean of this week and last week (TVL ÷ (1 + 7d change)), 7d change ' + pct(f.growth_pct) + ' clamped to −60 to +120%</span></li>' +
      '<li><span class="k">3. Comparable line</span><span class="f">' + usd(base) + '</span>' +
      '<span class="formula">10^(' + c.intercept_a.toFixed(3) + ' + ' + c.slope_b.toFixed(3) + ' × log10 smoothed TVL), fit on ' + c.comparables + ' tokened protocols</span></li>' +
      '<li><span class="k">4. Category family</span><span class="f">' + pct(f.family_adj_pct) + '</span>' +
      '<span class="formula">' + esc(f.family_label) + ', n = ' + f.family_n + ': median residual shrunk by n ÷ (n + 5)</span></li>' +
      '<li><span class="k">5. Chain reach</span><span class="f">' + pct(f.chain_adj_pct) + '</span>' +
      '<span class="formula">' + f.chain_count + ' chains, against the comparables’ mean of ' + c.chain_mean.toFixed(1) + ' (capped at 10)</span></li>' +
      '<li><span class="k">6. Wrapper check</span><span class="f">' + (f.wrapper_adj_pct === 0 ? 'none' : pct(f.wrapper_adj_pct)) + '</span>' +
      '<span class="formula">' + (f.wrapper_adj_pct === 0 ? 'the category is not a soft wrapper type' : 'a soft wrapper type may be a product of a token that trades: half weight') + '</span></li>' +
      '<li class="total"><span class="k">Implied value</span><span class="f">' + usd(r.implied_value_usd) + '</span>' +
      '<span class="formula">running product: ' + usd(afterWrap) + ' after step 6, rounded from the fit in log space</span></li>';

    var near = f.nearest.map(function (n) {
      return '<tr><td>' + esc(n.name) + '</td><td class="muted">' + esc(n.category || 'Uncategorised') + '</td>' +
        '<td class="r num">' + usd(n.tvl_usd) + '</td><td class="r num">' + usd(n.mcap_usd) + '</td>' +
        '<td class="r num">' + n.ratio.toFixed(2) + '×</td></tr>';
    }).join('');

    var plan = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

    app.innerHTML =
      '<div class="crumb"><a href="#/board">Board</a> / ' + esc(r.name) + '</div>' +
      '<div class="head"><h1>' + esc(r.name) + '</h1><span class="meta">rank ' + r.rank + ' of ' + rows.length + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(r.chains.join(', ') || 'no chain listed') + '</span>' +
      (r.watchlist ? '<span class="pill watch">watchlist</span>' : '') + '<span class="pill">records no token</span></div>' +
      '<div class="hero">' +
      '<section class="panel big"><div class="label muted">Implied token value, if the record stays as it is</div>' +
      '<div class="value">' + usd(r.implied_value_usd) + '</div>' +
      '<span class="range">50% range ' + usd(r.band_low_usd) + ' to ' + usd(r.band_high_usd) + '</span>' +
      '<div class="facts">' +
      fact('TVL', usd(r.tvl_usd)) + fact('7-day TVL change', pct(r.change_7d), pctClass(r.change_7d)) +
      fact('Record age', age(r.age_days) + ' (listed ' + (r.listed_at || 'unknown') + ')') + fact('Confidence', CONF[r.confidence]) +
      fact('Capital per position', '$' + f.capital_per_position_usd) + fact('Chains', r.chains.length) +
      '</div>' +
      '<p class="note">An estimate of market value from this snapshot’s own figures. It does not say a token will exist, when, or at what price.</p>' +
      '</section>' +
      '<section class="panel"><h2 class="pad">How the number is made</h2><ul class="steps">' + rowsHtml + '</ul></section>' +
      '</div>' +
      '<div class="grid2">' +
      '<section class="panel"><h2 class="pad">Nearest tokened comparables</h2>' +
      '<table class="grid"><thead><tr><th>Protocol</th><th>Category</th><th class="r">TVL</th><th class="r">Market cap</th><th class="r">Cap ÷ TVL</th></tr></thead><tbody>' + near + '</tbody></table>' +
      '<p class="note">Same family first, then nearest in smoothed TVL. Their market cap over TVL is what the estimate scales from.</p></section>' +
      '<section class="panel"><h2 class="pad">Farm plan</h2><ol class="plan">' + plan + '</ol></section>' +
      '</div>';
  }
  function fact(label, value, cls) {
    return '<div><div class="label">' + esc(label) + '</div><div class="v ' + (cls || '') + '">' + esc(value) + '</div></div>';
  }

  /* ---------- live, not ranked, method ---------- */
  function renderLive() {
    var list = R.live;
    app.innerHTML =
      '<h1>Live tokens</h1>' +
      '<p class="lede">' + list.length + ' protocols record a token with a market cap. They are not ranked here: the radar takes their market caps as the market’s own values and learns from them. Exchanges are left out of the comparables.</p>' +
      '<section class="panel"><table class="grid"><thead><tr><th>Protocol</th><th>Category</th><th>Chains</th><th class="r">TVL</th><th class="r">Market cap</th><th class="r">Cap ÷ TVL</th><th class="r">7d</th></tr></thead><tbody>' +
      list.map(function (l) {
        return '<tr><td><span class="n">' + esc(l.name) + '</span></td><td class="muted">' + esc(l.category || 'Uncategorised') + '</td>' +
          '<td class="muted">' + esc(l.chains.slice(0, 3).join(', ')) + '</td>' +
          '<td class="r num">' + usd(l.tvl_usd) + '</td><td class="r num">' + usd(l.mcap_usd) + '</td>' +
          '<td class="r num">' + l.ratio.toFixed(2) + '×</td><td class="r num ' + pctClass(l.change_7d) + '">' + pct(l.change_7d) + '</td></tr>';
      }).join('') +
      '</tbody></table></section>';
  }
  function renderNotRanked() {
    var list = R.not_ranked;
    app.innerHTML =
      '<h1>Not ranked</h1>' +
      '<p class="lede">' + list.length + ' protocols record no token and are still left off the ranked board. Each is a bridge, a wrapped or staked product, an exchange, or a versioned pool of another protocol, so its token, if any, may already trade under another name.</p>' +
      '<section class="panel"><table class="grid"><thead><tr><th>Protocol</th><th>Category</th><th class="r">TVL</th><th>Why not ranked</th></tr></thead><tbody>' +
      list.map(function (n) {
        return '<tr><td><span class="n">' + esc(n.name) + '</span><span class="s">' + esc(n.slug) + '</span></td><td class="muted">' + esc(n.category || 'Uncategorised') + '</td>' +
          '<td class="r num">' + usd(n.tvl_usd) + '</td><td>' + esc(n.reason) + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
      '<p class="note">Another ' + R.ticker_only_size + ' protocols record a ticker but no CoinGecko id and no market cap. They are not ranked either: the ticker may belong to a token that trades.</p></section>';
  }
  function renderMethod() {
    var c = R.calibration;
    var k = R.constants;
    var famRows = c.families.map(function (f) {
      return '<tr><td>' + esc(f.label) + '</td><td class="r num">' + f.n + '</td><td class="r num">' + (f.median_ratio === null ? '—' : f.median_ratio.toFixed(2) + '×') + '</td><td class="r num ' + pctClass(f.adj_pct) + '">' + pct(f.adj_pct) + '</td></tr>';
    }).join('');
    app.innerHTML =
      '<h1>Method, ' + esc(R.model_version) + '</h1>' +
      '<div class="two" style="margin-top:12px">' +
      '<section class="panel prose">' +
      '<p><strong>The question.</strong> What would a token be worth if the protocol’s record stayed as it is? The radar does not predict whether a token is issued. Every value is a claim of this entry, built only from the snapshot’s own fields.</p>' +
      '<p><strong>1. Smoothed TVL.</strong> One week’s change is partly a spike, so the TVL is valued at the mean of this week and last week, with the 7-day change clamped to −' + Math.abs(k.growth_floor) + ' to +' + k.growth_cap + '%.</p>' +
      '<p><strong>2. Comparable line.</strong> Over the ' + c.comparables + ' tokened protocols, log10 market cap = ' + c.intercept_a.toFixed(3) + ' + ' + c.slope_b.toFixed(3) + ' × log10 smoothed TVL, residual scatter ±' + c.sd_dex.toFixed(2) + ' dex. The slope under 1 means a larger TVL earns a smaller cap per dollar.</p>' +
      '<p><strong>3. Category family.</strong> Each family’s median residual, shrunk by n ÷ (n + ' + k.prior_weight + '), so a thin family moves the estimate little.</p>' +
      '<p><strong>4. Chain reach.</strong> A small slope on the number of chains, capped at ' + k.chain_cap + ', against the comparables’ mean. It is ' + c.chain_slope_dex.toFixed(3) + ' dex per chain here, so reach barely moves the value.</p>' +
      '<p><strong>5. Wrappers.</strong> Bridges, liquid staking and wrapped products are not ranked, since the house rule treats them as products of a token that already trades. A soft set (restaking, staking pools, BTC wrappers) keeps its place and takes half weight.</p>' +
      '<p><strong>Band.</strong> The 50% range is the comparables’ scatter, ±' + k.band_z + ' standard deviations. Record age (DefiLlama’s listing day) sets the confidence label and the farm plan’s hold period.</p>' +
      '<p><strong>What the snapshot showed.</strong> Growth correlates ' + c.growth_corr.toFixed(2) + ' with the residual once TVL is smoothed, age ' + c.age_corr.toFixed(2) + '. Neither is large enough to act on at this sample, so the value uses smoothing and not age.</p>' +
      '<p><strong>Limits.</strong> Market cap stands in for a token’s value, not its fully diluted value. DefiLlama’s record is one day’s fetch. A protocol that records no token may still have one the record does not carry.</p>' +
      '</section>' +
      '<section class="panel"><h2 class="pad">Families, from the tokened comparables</h2>' +
      '<table class="grid"><thead><tr><th>Family</th><th class="r">n</th><th class="r">Median cap ÷ TVL</th><th class="r">Adjustment</th></tr></thead><tbody>' + famRows + '</tbody></table>' +
      '<p class="note">Adjustment is the shrunk median residual, as a change to the estimate.</p></section>' +
      '</div>';
  }

  /* ---------- router ---------- */
  function route() {
    var h = parseHash();
    setTab(h.view === 'p' ? 'board' : h.view);
    if (h.view === 'p') { renderDetail(h.slug); }
    else if (h.view === 'live') { renderLive(); }
    else if (h.view === 'not-ranked') { renderNotRanked(); }
    else if (h.view === 'method') { renderMethod(); }
    else { renderBoard(currentBoardParams()); }
    app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  kpis();
  window.addEventListener('hashchange', route);
  if (!location.hash) history.replaceState(null, '', '#/board');
  route();
})();
