/* TOKEN RADAR — static dashboard. Reads window.RADAR from ../data.js, which main.ts writes from the
   same rows as board.json: the table, the benchmark arithmetic and every farm step are the model's
   own numbers, not a second implementation. No network, no framework, no external assets. */
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var params = new URLSearchParams(window.location.search);
  var VIEWS = { board: 1, detail: 1, live: 1, method: 1 };
  var state = {
    view: VIEWS[params.get('view')] ? params.get('view') : 'board',
    slug: params.get('slug') || null,
    q: params.get('q') || '',
    cat: params.get('cat') || 'all',
    chain: params.get('chain') || 'all',
    min: params.get('min') || '0',
    wl: params.get('wl') === '1',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === '1' ? 1 : params.get('dir') === '-1' ? -1 : (params.get('sort') ? 1 : -1)
  };
  if (state.view === 'detail' && !state.slug) state.view = 'board';
  var refocus = false;

  var SORTS = ['implied', 'benchmark', 'score', 'tvl', 'rank', 'change', 'age', 'name', 'category'];
  if (SORTS.indexOf(state.sort) < 0) state.sort = 'implied';
  var ASC_DEFAULT = { rank: 1, name: 1, category: 1 };
  var SORT_LABELS = { implied: 'Sort: implied value', benchmark: 'Sort: benchmark', score: 'Sort: launch score', tvl: 'Sort: TVL', rank: 'Sort: rank', change: 'Sort: 7d change', age: 'Sort: age', name: 'Sort: name', category: 'Sort: category' };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    if (days >= 60) return Math.round(days / 30) + 'mo';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtX(n) { return (n === null || n === undefined || !isFinite(n) ? 'n/a' : Number(n).toFixed(2)) + '×'; }
  function growthClass(n) { return n === null || n === undefined ? 'flat' : n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat'; }
  function monthDay(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function catName(r) { return r.category || 'Other'; }
  function benchOf(r) { return r.factors.benchmark; }

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else if (k === 'checked') node.checked = !!v;
        else if (k === 'value') node.value = v;
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(node, arguments[i]);
    return node;
  }
  function add(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { add(node, c); }); return; }
    if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
    else node.appendChild(child);
  }

  function writeUrl() {
    var p = new URLSearchParams();
    if (state.view !== 'board') p.set('view', state.view);
    if (state.view === 'detail' && state.slug) p.set('slug', state.slug);
    if (state.q) p.set('q', state.q);
    if (state.cat !== 'all') p.set('cat', state.cat);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.min !== '0') p.set('min', state.min);
    if (state.wl) p.set('wl', '1');
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.sort !== 'implied' && state.dir === 1) p.set('dir', '1');
    var qs = p.toString();
    try { window.history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '')); } catch (e) { /* file:// is fine */ }
  }

  function categories() {
    var set = {};
    DATA.rows.forEach(function (r) { set[catName(r)] = 1; });
    return Object.keys(set).sort();
  }
  function chains() {
    var set = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { set[c] = 1; }); });
    return Object.keys(set).sort();
  }

  function matches(r) {
    if (state.cat !== 'all' && catName(r) !== state.cat) return false;
    if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
    if (Number(state.min) > 0 && r.tvl_usd < Number(state.min)) return false;
    if (state.wl && !r.watchlist) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
  }
  function filtered() { return DATA.rows.filter(matches); }

  function sortRows(list) {
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = catName(a).toLowerCase(); bv = catName(b).toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'benchmark') { av = benchOf(a); bv = benchOf(b); }
      else if (key === 'score') { av = a.launch_score; bv = b.launch_score; }
      else if (key === 'change') { av = a.change_7d; bv = b.change_7d; }
      else if (key === 'age') { av = a.age_days; bv = b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av === null && bv === null) return a.rank - b.rank;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  function setView(view, slug) {
    state.view = view;
    state.slug = view === 'detail' ? slug : null;
    writeUrl();
    render();
    window.scrollTo(0, 0);
  }

  function header() {
    return h('header', { class: 'top' },
      h('div', { class: 'brand' },
        h('div', { class: 'sigil', 'aria-hidden': 'true' }),
        h('div', null,
          h('div', { class: 'wordmark' }, h('b', null, 'TOKEN ', h('span', null, 'RADAR')), h('em', null, 'pre-token intelligence')),
          h('p', { class: 'tagline' }, 'Protocols that record no token, ranked by a launch value learned from the live market — every benchmark, factor and farm cost on the page.')
        )
      ),
      h('div', { class: 'stamp' },
        h('div', null, h('span', { class: 'dot' }), 'SNAPSHOT LIVE'),
        h('div', null, h('strong', null, monthDay(DATA.as_of))),
        h('div', null, DATA.benchmark_sample_size + ' live peers · ' + DATA.model_version),
        h('div', null, DATA.board_size + ' ranked · ' + DATA.watchlist_size + ' watchlist')
      )
    );
  }

  function kpis() {
    var covered = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    var agedPct = DATA.board_size ? Math.round((DATA.aged_two_years / DATA.board_size) * 100) : 0;
    return h('section', { class: 'kpis', 'aria-label': 'Snapshot KPIs' },
      h('div', { class: 'kpi' }, h('span', null, 'Watchlist coverage'), h('b', null, covered + ' / ' + DATA.watchlist_size), h('small', null, 'every slug on the floor')),
      h('div', { class: 'kpi' }, h('span', null, 'Board rows'), h('b', null, String(DATA.board_size)), h('small', null, DATA.early_size + ' early, ' + DATA.live_size + ' live set aside')),
      h('div', { class: 'kpi' }, h('span', null, 'Total implied value'), h('b', null, fmtUsd(DATA.total_implied_usd)), h('small', null, 'sum of all ranked rows')),
      h('div', { class: 'kpi' }, h('span', null, 'Global median mcap / TVL'), h('b', null, h('em', null, fmtX(DATA.global_median_mcap_tvl))), h('small', null, DATA.benchmark_sample_size + ' live-token protocols')),
      h('div', { class: 'kpi' }, h('span', null, 'Aged 2y+'), h('b', null, h('em', null, agedPct + '%'), ' · ' + DATA.aged_two_years), h('small', null, 'high-confidence tenure'))
    );
  }

  function tabs() {
    var active = state.view === 'detail' ? 'board' : state.view;
    function tab(id, label) {
      return h('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': active === id ? 'true' : 'false',
        text: label, onclick: function () { setView(id); }
      });
    }
    return h('nav', { class: 'bar', 'aria-label': 'Views' },
      tab('board', 'Radar board · ' + DATA.board_size),
      tab('live', 'Already trading · ' + DATA.live_size),
      tab('method', 'Method'),
      h('span', { class: 'spacer' }),
      h('div', { class: 'legend', 'aria-label': 'Signals' },
        h('span', null, h('i', { class: 'm' }), 'watchlist'),
        h('span', null, h('i', { class: 'a' }), 'early radar'),
        h('span', null, h('i', { class: 'b' }), '2y+ tenure')
      )
    );
  }

  function controls() {
    var qInput = h('input', {
      type: 'search', id: 'q', value: state.q, placeholder: 'Name, slug, category or chain',
      'aria-label': 'Search the board',
      oninput: function (e) { state.q = e.target.value; writeUrl(); refocus = true; render(); }
    });
    var cat = h('select', { id: 'cat', 'aria-label': 'Filter by category', onchange: function (e) { state.cat = e.target.value; writeUrl(); render(); } },
      h('option', { value: 'all', text: 'All categories' }),
      categories().map(function (c) { return h('option', { value: c, text: c, selected: c === state.cat }); })
    );
    var chain = h('select', { id: 'chain', 'aria-label': 'Filter by chain', onchange: function (e) { state.chain = e.target.value; writeUrl(); render(); } },
      h('option', { value: 'all', text: 'All chains' }),
      chains().map(function (c) { return h('option', { value: c, text: c, selected: c === state.chain }); })
    );
    var mins = [['0', 'Any TVL'], ['50000000', '≥ $50M TVL'], ['100000000', '≥ $100M TVL'], ['250000000', '≥ $250M TVL'], ['500000000', '≥ $500M TVL']];
    var min = h('select', { id: 'min', 'aria-label': 'Minimum TVL', onchange: function (e) { state.min = e.target.value; writeUrl(); render(); } },
      mins.map(function (m) { return h('option', { value: m[0], text: m[1], selected: m[0] === state.min }); })
    );
    var wl = h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: state.wl, onchange: function (e) { state.wl = e.target.checked; writeUrl(); render(); } }),
      h('span', null, 'Watchlist only')
    );
    var sort = h('select', { id: 'sort', 'aria-label': 'Sort the board', onchange: function (e) {
      state.sort = e.target.value; state.dir = ASC_DEFAULT[state.sort] ? 1 : -1; writeUrl(); render();
    } }, SORTS.map(function (s) { return h('option', { value: s, text: SORT_LABELS[s], selected: s === state.sort }); }));
    var reset = h('button', { class: 'reset', type: 'button', text: 'Reset', onclick: resetAll });
    return h('div', { class: 'controls' },
      h('div', { class: 'field search' }, h('label', { for: 'q' }, 'Search'), h('div', { class: 'search-wrap' }, qInput)),
      h('div', { class: 'field' }, h('label', { for: 'cat' }, 'Category'), cat),
      h('div', { class: 'field' }, h('label', { for: 'chain' }, 'Chain'), chain),
      h('div', { class: 'field' }, h('label', { for: 'min' }, 'Min TVL'), min),
      wl,
      h('div', { class: 'field' }, h('label', { for: 'sort' }, 'Sort'), sort),
      reset
    );
  }

  function resetAll() {
    state.q = ''; state.cat = 'all'; state.chain = 'all'; state.min = '0'; state.wl = false;
    state.sort = 'implied'; state.dir = -1; state.view = 'board'; state.slug = null;
    writeUrl(); render();
  }

  function resultLine(rows) {
    var total = state.view === 'live' ? DATA.live.length : DATA.board_size;
    var label = state.view === 'live' ? 'live-token protocols' : 'pre-token rows';
    return h('div', { class: 'resultline' },
      h('div', null, h('b', { class: 'accent' }, String(rows.length)), ' of ' + total + ' ' + label + ' shown',
        state.wl ? ' · watchlist only' : '',
        state.cat !== 'all' ? ' · category ' + state.cat : '',
        state.chain !== 'all' ? ' · chain ' + state.chain : ''),
      h('div', null, 'implied = TVL × benchmark × growth × tenure × breadth · ' + DATA.model_version)
    );
  }

  function sortable(key, label) {
    var active = state.sort === key;
    return h('th', { scope: 'col', 'aria-sort': active ? (state.dir === 1 ? 'ascending' : 'descending') : null },
      h('button', { type: 'button', onclick: function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = ASC_DEFAULT[key] ? 1 : -1; }
        writeUrl(); render();
      } }, label, active ? h('span', { class: 'arrow', 'aria-hidden': 'true' }, state.dir === 1 ? '▲' : '▼') : null)
    );
  }

  function chainChips(chains) {
    var list = chains || [];
    var shown = list.slice(0, 3);
    return h('div', { class: 'chips' },
      shown.map(function (c) { return h('span', { class: 'chip', text: c }); }),
      list.length > 3 ? h('span', { class: 'chip more', text: '+' + (list.length - 3) }) : null
    );
  }

  function methodStrip() {
    var list = DATA.benchmarks.slice();
    if (state.cat !== 'all') {
      list.sort(function (a, b) {
        if (a.category === state.cat) return -1;
        if (b.category === state.cat) return 1;
        return b.n - a.n;
      });
    }
    var top = list.slice(0, 4);
    return h('div', { class: 'methodstrip', 'aria-label': 'Value model summary' },
      h('div', { class: 'ms-lead' },
        h('b', null, 'Value model'),
        h('span', null, 'Category benchmark = median mcap/TVL of live peers, shrunk toward the global median ' + fmtX(DATA.global_median_mcap_tvl) + '.')
      ),
      h('div', { class: 'ms-chips' }, top.map(function (b) {
        return h('span', { class: 'ms-chip' }, h('b', null, b.category), ' ' + fmtX(b.benchmark) + ' · ' + b.n);
      })),
      h('button', { class: 'ms-link', type: 'button', text: 'Full method →', onclick: function () { setView('method'); } })
    );
  }

  function boardTable() {
    var list = sortRows(filtered());
    if (list.length === 0) {
      return h('div', { class: 'panel' }, h('div', { class: 'empty' },
        h('h2', null, 'No protocol matches this filter'),
        h('p', null, 'The radar is still scanning the whole snapshot. Clear the filters to see all ' + DATA.board_size + ' ranked rows.'),
        h('button', { class: 'reset', type: 'button', text: 'Clear filters', onclick: resetAll })
      ));
    }
    var max = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
    var tbody = h('tbody');
    list.forEach(function (r) {
      var scoreClass = r.launch_score >= 75 ? '' : r.launch_score >= 45 ? ' mid' : ' low';
      tbody.appendChild(h('tr', {
        tabindex: '0',
        'aria-label': r.name + ', rank ' + r.rank + ', implied value ' + fmtFull(r.implied_value_usd),
        onclick: function () { setView('detail', r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('detail', r.slug); } }
      },
        h('td', null, h('span', { class: 'rank' + (r.rank <= 3 ? ' top' : ''), text: '#' + r.rank })),
        h('td', null, h('span', { class: 'score' + scoreClass, title: r.confidence + ' confidence', text: String(r.launch_score) })),
        h('td', null, h('div', { class: 'proto' },
          h('b', null, r.name, h('span', { class: 'tag' + (r.watchlist ? ' wl' : ''), text: r.watchlist ? 'WL' : 'EARLY' })),
          h('span', { class: 'slug', text: r.slug })
        )),
        h('td', null, h('span', { class: 'cat', text: catName(r) })),
        h('td', null, chainChips(r.chains)),
        h('td', { class: 'r' }, h('span', { class: 'num tvl', text: fmtUsd(r.tvl_usd) })),
        h('td', { class: 'r' }, h('span', { class: 'num ' + growthClass(r.change_7d), text: fmtPct(r.change_7d) })),
        h('td', { class: 'r' }, h('span', { class: 'num age', text: fmtAge(r.age_days) })),
        h('td', { class: 'r' }, h('span', { class: 'bench', title: 'median mcap/TVL of the category, shrunk toward ' + fmtX(DATA.global_median_mcap_tvl), text: fmtX(benchOf(r)) + ' · ' + r.factors.category_n })),
        h('td', { class: 'r' }, h('div', { class: 'imp' },
          h('span', { class: 'impbar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + clamp(Math.round((r.implied_value_usd / max) * 100), 2, 100) + '%' })),
          h('b', { text: fmtUsd(r.implied_value_usd) })
        )),
        h('td', { class: 'r' }, h('button', { class: 'plan', type: 'button', text: 'Plan →', onclick: function (e) {
          e.stopPropagation(); setView('detail', r.slug);
        } }))
      ));
    });
    var table = h('table', null,
      h('thead', null, h('tr', null,
        sortable('rank', 'Rank'),
        sortable('score', 'Score'),
        sortable('name', 'Protocol'),
        sortable('category', 'Category'),
        h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Chains')),
        sortable('tvl', 'TVL'),
        sortable('change', '7d'),
        sortable('age', 'Age, no token'),
        sortable('benchmark', 'Benchmark'),
        sortable('implied', 'Implied value'),
        h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Farm'))
      )),
      tbody
    );
    return h('div', { class: 'panel' }, h('div', { class: 'table-wrap' }, table));
  }

  function liveTable() {
    var q = state.q.trim().toLowerCase();
    var list = DATA.live.filter(function (r) {
      if (state.cat !== 'all' && catName(r) !== state.cat) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (Number(state.min) > 0 && r.tvl_usd < Number(state.min)) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var tbody = h('tbody');
    list.forEach(function (r) {
      tbody.appendChild(h('tr', { style: 'cursor:default' },
        h('td', null, h('span', { class: 'live-tag', text: 'Trading' })),
        h('td', null, h('div', { class: 'proto' }, h('b', null, r.name), h('span', { class: 'slug', text: r.slug }))),
        h('td', null, h('span', { class: 'cat', text: catName(r) })),
        h('td', null, chainChips(r.chains)),
        h('td', { class: 'r' }, h('span', { class: 'num tvl', text: fmtUsd(r.tvl_usd) })),
        h('td', { class: 'r' }, h('span', { class: 'num ' + growthClass(r.change_7d), text: fmtPct(r.change_7d) })),
        h('td', { class: 'r' }, h('span', { class: 'num', text: fmtX(r.mcap_tvl_ratio) })),
        h('td', { class: 'r' }, h('span', { class: 'num', text: fmtFull(r.mcap_usd) })),
        h('td', { class: 'r' }, h('span', { class: 'num', text: r.symbol || '—' }))
      ));
    });
    return h('div', null,
      h('div', { class: 'live-note' }, h('b', null, 'Not on the radar'), h('span', null, 'These protocols already have a token, so their market cap is the market’s own number. Their mcap/TVL ratio is the raw material for the category benchmarks. They are never scored by the launch model.')),
      h('div', { class: 'panel' }, h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Status')),
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Protocol')),
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Category')),
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Chains')),
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'TVL')),
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, '7d')),
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Mcap / TVL')),
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Market cap')),
          h('th', { scope: 'col' }, h('span', { class: 'th-plain' }, 'Symbol'))
        )),
        tbody
      )))
    );
  }

  function formulaText() {
    var m = DATA.model;
    return 'implied = round( tvl_usd × benchmark(category) × growth × tenure × breadth )\n' +
      'benchmark(cat) = clamp( (n × median_cat + ' + m.shrink_prior + ' × global_median) / (n + ' + m.shrink_prior + '), ' + m.benchmark_floor + ', ' + m.benchmark_cap + ' )\n' +
      'growth  = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 × ' + m.growth_weight + '   (null = 1)\n' +
      'tenure  = min(' + m.tenure_bonus_cap + ', (' + m.tenure_base + ' + ' + m.tenure_range + ' × min(age_days, ' + m.tenure_days + ') / ' + m.tenure_days + ')\n' +
      '                   × (1 + ' + m.tenure_bonus + ' × log10(1 + age_days / ' + m.tenure_bonus_days + ')))   (null age = ' + m.unknown_age_days + 'd)\n' +
      'breadth = 1 + ' + m.breadth_weight + ' × min(chains.length, ' + m.breadth_cap + ')';
  }

  function method(compact) {
    return h('section', { class: 'method' + (compact ? ' compact' : ''), id: 'method' },
      h('div', { class: 'method-head' },
        h('h2', null, 'Value model'),
        h('span', null, 'learned from ' + DATA.benchmark_sample_size + ' live-token protocols in this snapshot · no protocol name special-cased')
      ),
      h('div', { class: 'method-body' },
        h('div', null,
          h('pre', { class: 'formula' }, formulaText()),
          h('p', { style: 'margin-top:12px' }, 'Every category benchmark comes from the snapshot itself. For each protocol whose token already trades, the model divides market cap by TVL; the category median is then shrunk toward the global median (' + fmtX(DATA.global_median_mcap_tvl) + ' across ' + DATA.benchmark_sample_size + ' live peers) with ' + DATA.model.shrink_prior + ' pseudo-peers, so a category with one live peer cannot dominate. A category with no live peer takes the global median.'),
          h('p', null, 'Growth is seven-day TVL change, clamped to ' + DATA.model.growth_floor + '%…+' + DATA.model.growth_cap + '% and weighted at ' + DATA.model.growth_weight + '. Tenure rises with time since the protocol was first listed and caps at ' + DATA.model.tenure_bonus_cap + '; an unknown age falls back to ' + DATA.model.unknown_age_days + ' days. Breadth adds ' + Math.round(DATA.model.breadth_weight * 100) + '% per chain, capped at ' + DATA.model.breadth_cap + '.'),
          h('p', null, 'Launch score is the rounded percentile of implied value across the board (100 is the top row). Confidence is high at two years of record or more, medium at six months, low otherwise.'),
          h('p', { class: 'warn' }, 'Records no token, not proof it has none. A protocol may carry a token the snapshot does not record. Implied value is this entry’s model, not a price, and it does not predict whether or when a token is issued.')
        ),
        h('div', null,
          h('table', { class: 'cat-table' }, h('caption', null, 'Category benchmarks · the full learned table'), h('tbody', null,
            DATA.benchmarks.map(function (b) {
              return h('tr', null, h('td', null, b.category), h('td', null, fmtX(b.benchmark) + ' · ' + b.n + (b.n === 1 ? ' live peer' : ' live peers')));
            }).concat(h('tr', { class: 'default' }, h('td', null, 'Global fallback'), h('td', null, fmtX(DATA.global_median_mcap_tvl) + ' · ' + DATA.benchmark_sample_size + ' live peers')))
          )),
          h('p', { style: 'margin-top:12px' }, 'The board carries every one of the ' + DATA.watchlist_size + ' watchlist slugs plus the ' + DATA.early_size + ' pre-token protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor with the most TVL. Live-token protocols are listed separately with their market caps and their own mcap/TVL ratio.')
        )
      )
    );
  }

  function methodPage() {
    return h('div', null,
      h('div', { class: 'page-head' },
        h('h1', null, 'How every number is made'),
        h('p', null, 'The model reads only the snapshot: TVL, seven-day growth, listing age, chain count and category. Category benchmarks are learned from the live-token protocols beside the pre-token ones, then every row uses the same function.')
      ),
      method(false),
      h('div', { class: 'method-extra' },
        h('div', { class: 'mx-card' }, h('span', null, 'Global median mcap / TVL'), h('b', null, fmtX(DATA.global_median_mcap_tvl)), h('small', null, DATA.benchmark_sample_size + ' live-token protocols with mcap and TVL > 0')),
        h('div', { class: 'mx-card' }, h('span', null, 'Category rows'), h('b', null, String(DATA.benchmarks.length)), h('small', null, 'each with n and its shrunk multiple')),
        h('div', { class: 'mx-card' }, h('span', null, 'Shrinkage prior'), h('b', null, DATA.model.shrink_prior + ' peers'), h('small', null, 'benchmark = (n·median + 5·global) / (n + 5)')),
        h('div', { class: 'mx-card' }, h('span', null, 'Benchmark clamp'), h('b', null, fmtX(DATA.model.benchmark_floor) + ' – ' + fmtX(DATA.model.benchmark_cap)), h('small', null, 'keeps a thin or extreme category sane'))
      )
    );
  }

  function parseStep(text) {
    var atCost = text.indexOf(' Cost: ');
    if (atCost < 0) return { action: text, cost: '', time: '' };
    var atTime = text.indexOf(' Time: ', atCost);
    return {
      action: text.slice(0, atCost),
      cost: atTime < 0 ? text.slice(atCost + 7) : text.slice(atCost + 7, atTime),
      time: atTime < 0 ? '' : text.slice(atTime + 7).replace(/\.\s*$/, '')
    };
  }
  function chainSummary(chains) {
    var list = chains || [];
    if (list.length === 0) return 'unnamed chain';
    return list.slice(0, 4).join(', ') + (list.length > 4 ? ' +' + (list.length - 4) + ' more' : '');
  }
  function riskFor(r) {
    var base = 'The snapshot records no token for this protocol; that is not proof it has none. Confirm the protocol’s own channels and contracts before you deposit.';
    if (r.confidence === 'low') return base + ' Confidence is low: the listing age or seven-day record is thin, so treat the multiple as provisional.';
    if (r.confidence === 'medium') return base + ' Confidence is medium: there is less than two years of record, so tenure contributes less to the score.';
    return base + ' Confidence is high: at least two years of record, so tenure carries real weight in the score.';
  }

  function meaningFor(r) {
    var global = DATA.global_median_mcap_tvl;
    var b = benchOf(r);
    var stage = r.tvl_usd * b;
    var pos = b > global ? 'above' : b < global ? 'below' : 'level with';
    var peers = r.factors.category_n === 0 ? 'no live peer, so the global median stands in' : r.factors.category_n + (r.factors.category_n === 1 ? ' live peer' : ' live peers');
    return 'At ' + fmtX(b) + ' — ' + peers + ', ' + pos + ' the ' + fmtX(global) + ' global median — a ' + fmtUsd(r.tvl_usd) + ' TVL book implies ' + fmtUsd(stage) + ' before growth, tenure and breadth. This is the model’s claim, not an offer price.';
  }

  function drawer(r) {
    var eq = h('div', { class: 'eq' },
      h('div', { class: 'eq-row' }, h('span', null, 'TVL', h('small', null, 'snapshot figure')), h('b', { text: fmtFull(r.tvl_usd) })),
      h('div', { class: 'eq-row op' }, h('span', null, '× benchmark', h('small', null, catName(r) + ' · ' + (r.factors.category_n || 'no') + ' live peers · global ' + fmtX(DATA.global_median_mcap_tvl))), h('b', { text: fmtX(benchOf(r)) })),
      h('div', { class: 'eq-row op' }, h('span', null, '× growth', h('small', null, r.change_7d === null ? '7d not reported · factor 1' : '7d ' + fmtPct(r.change_7d) + ' · clamped to ' + r.factors.growth_pct.toFixed(1) + '%')), h('b', { text: r.factors.growth_factor.toFixed(3) })),
      h('div', { class: 'eq-row op' }, h('span', null, '× tenure', h('small', null, fmtAge(r.age_days) + ' with no token · bonus ' + r.factors.tenure_bonus.toFixed(3))), h('b', { text: r.factors.tenure_factor.toFixed(3) })),
      h('div', { class: 'eq-row op' }, h('span', null, '× breadth', h('small', null, (r.chains || []).length + ' chain' + ((r.chains || []).length === 1 ? '' : 's'))), h('b', { text: r.factors.breadth_factor.toFixed(2) })),
      h('div', { class: 'eq-row top' }, h('span', null, '= implied value'), h('b', { text: fmtFull(r.implied_value_usd) }))
    );
    var steps = h('ol', { class: 'steps' }, r.farm_steps.map(function (s, i) {
      var p = parseStep(s);
      return h('li', null,
        h('span', { class: 'n', text: String(i + 1).padStart(2, '0') }),
        h('div', null, h('p', null, p.action),
          h('div', { class: 'costs' },
            p.cost ? h('span', null, h('b', null, 'Cost '), p.cost.replace(/\.\s*$/, '')) : null,
            p.time ? h('span', null, h('b', null, 'Time '), p.time) : null
          )
        )
      );
    }));
    return h('div', { class: 'backdrop', onclick: function () { setView('board'); } },
      h('aside', { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'd-title', onclick: function (e) { e.stopPropagation(); } },
        h('div', { class: 'drawer-top' },
          h('span', { class: 'k' }, 'Rank ', h('b', null, '#' + r.rank), ' of ' + DATA.board_size + ' · ' + (r.watchlist ? 'watchlist' : 'early radar')),
          h('div', { class: 'drawer-actions' },
            h('button', { class: 'ms-link', type: 'button', text: 'Method', onclick: function () { setView('method'); } }),
            h('button', { class: 'close', type: 'button', text: '← Back to board', onclick: function () { setView('board'); } })
          )
        ),
        h('div', { class: 'drawer-scroll' },
          h('div', { class: 'd-head' },
            h('h1', { id: 'd-title', text: r.name }),
            h('p', { class: 'd-sub' }, catName(r) + ' · ' + chainSummary(r.chains) + ' · ', h('span', { class: 'slug', text: r.slug }))
          ),
          h('div', { class: 'd-hero' },
            h('div', null,
              h('div', { class: 'lab' }, 'Implied launch value'),
              h('div', { class: 'big', text: fmtUsd(r.implied_value_usd) }),
              h('div', { class: 'lab', style: 'margin-top:7px', text: fmtFull(r.implied_value_usd) + ' · ' + ((r.implied_value_usd / (DATA.rows[0].implied_value_usd || 1)) * 100).toFixed(1) + '% of the board leader' })
            ),
            h('div', { class: 'meta' },
              h('span', { class: 'conf ' + r.confidence, text: r.confidence + ' confidence' }),
              h('span', { class: 'd-score', text: 'LAUNCH SCORE ' + r.launch_score + ' / 100' }),
              h('span', { class: 'd-score', style: 'color:var(--muted)', text: fmtAge(r.age_days) + ' no token' })
            )
          ),
          h('section', { class: 'd-section' },
            h('h2', null, 'Benchmark breakdown · every number is in the row'),
            eq,
            h('div', { class: 'meaning' }, h('b', null, 'What this means'), meaningFor(r))
          ),
          h('section', { class: 'd-section' },
            h('h2', null, 'Farm plan · ' + r.farm_steps.length + ' steps'),
            steps
          ),
          h('section', { class: 'd-section' },
            h('h2', null, 'Risk note'),
            h('div', { class: 'risk' }, h('b', null, 'Read before farming'), riskFor(r))
          ),
          h('div', { class: 'd-foot' }, 'Model ' + DATA.model_version + ' · snapshot ' + DATA.as_of + ' · ' + DATA.source)
        )
      )
    );
  }

  function render() {
    app.textContent = '';
    var wrap = h('div', { class: 'wrap' });
    wrap.appendChild(header());
    wrap.appendChild(kpis());
    wrap.appendChild(tabs());
    if (state.view !== 'method') wrap.appendChild(controls());
    if (state.view === 'live') {
      var live = DATA.live.filter(function (r) {
        var q = state.q.trim().toLowerCase();
        if (state.cat !== 'all' && catName(r) !== state.cat) return false;
        if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
        if (Number(state.min) > 0 && r.tvl_usd < Number(state.min)) return false;
        return !q || [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
      });
      wrap.appendChild(resultLine(live));
      wrap.appendChild(liveTable());
    } else if (state.view === 'method') {
      wrap.appendChild(methodPage());
    } else {
      wrap.appendChild(resultLine(filtered()));
      wrap.appendChild(methodStrip());
      wrap.appendChild(boardTable());
      wrap.appendChild(method(true));
    }
    app.appendChild(wrap);
    if (state.view === 'detail' && state.slug) {
      var row = DATA.rows.filter(function (r) { return r.slug === state.slug; })[0];
      if (row) app.appendChild(drawer(row));
      else { state.view = 'board'; state.slug = null; writeUrl(); }
    }
    if (refocus) {
      var input = document.getElementById('q');
      if (input) { input.focus(); var v = input.value; input.value = ''; input.value = v; }
      refocus = false;
    }
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.view === 'detail') setView('board'); });
  render();
  requestAnimationFrame(function () { requestAnimationFrame(function () { window.__ready = true; }); });
})();
