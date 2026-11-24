import { LEADERBOARD } from './leaderboard-config.js';

const BOARD_SIZE = 10;
const PLAYER_KEY = 'gattlen-flow:leaderboard-player';

const words = {
  saving: 'Wird gespeichert …',
  submit: 'Eintragen ↗',
  loading: 'Rangliste wird geladen …',
  error: 'Die Rangliste ist gerade nicht erreichbar. Versuch es später nochmal.',
  notConfigured: 'Die Rangliste ist noch nicht verbunden.',
  tooMany: 'Zu viele Einträge in kurzer Zeit. Versuch es später nochmal.',
  empty: 'Noch keine Einträge. Sei die erste Person auf der Rangliste!',
  yourRank: 'Dein Platz in Level {level}: {rank} von {total}',
  moves: '{moves} Züge',
  you: 'DU'
};

const configured = () => Boolean(LEADERBOARD.url && LEADERBOARD.key);
const pad = n => String(n).padStart(2, '0');

// 23400 -> "23,4 s", 65200 -> "1:05,2"
export function formatTime(ms) {
  const tenths = Math.max(0, Math.floor((Number(ms) || 0) / 100));
  const seconds = Math.floor(tenths / 10), rest = tenths % 10;
  if (seconds < 60) return seconds + ',' + rest + ' s';
  return Math.floor(seconds / 60) + ':' + pad(seconds % 60) + ',' + rest;
}

async function rpc(name, body) {
  const response = await fetch(LEADERBOARD.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: LEADERBOARD.key,
      // Alte "anon"-Schlüssel (JWT) brauchen zusätzlich Authorization. Neue "sb_publishable_"-Schlüssel nicht.
      ...(LEADERBOARD.key.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + LEADERBOARD.key })
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text.includes('too_many_entries') ? 'tooMany' : 'error');
  }
  return response.json();
}

function readPlayer() {
  try { const v = JSON.parse(localStorage.getItem(PLAYER_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function writePlayer(value) {
  try { localStorage.setItem(PLAYER_KEY, JSON.stringify({ ...readPlayer(), ...value })); } catch {}
}

// Rangliste nach Zeit, eine pro Level: Formular (Name, E-Mail) -> Bestenliste mit eigenem Platz.
// getRun() liefert das zuletzt geschaffte Level: { id, level, timeMs, moves, hints } oder null.
// getLevel() liefert das Level, das gerade gespielt wird (für die reine Ansicht).
export function setupLeaderboard({ getRun, getLevel, onContinue }) {
  const $ = id => document.getElementById(id);
  const dialog = $('board-dialog');
  const form = $('board-form');
  const list = $('board-list');
  const message = $('board-message');
  const submit = $('board-submit');
  const levels = $('board-levels');
  let lastResult = null, busy = false, shownLevel = 1, request = 0;

  for (let n = 1; n <= 12; n++) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = pad(n); b.dataset.level = n;
    b.setAttribute('aria-label', 'Rangliste Level ' + n);
    b.addEventListener('click', () => { if (n !== shownLevel || $('board-view').hidden) loadBoard(n); });
    levels.append(b);
  }

  function show(view) {
    $('board-entry').hidden = view !== 'form';
    $('board-view').hidden = view !== 'list';
    levels.hidden = view !== 'list';
  }
  function setMessage(key) {
    message.textContent = key ? words[key] : '';
    message.hidden = !key;
  }
  function row(rank, name, timeMs, moves, mine) {
    const li = document.createElement('li');
    if (mine) li.className = 'mine';
    const r = document.createElement('span'); r.className = 'board-rank'; r.textContent = rank;
    const n = document.createElement('span'); n.className = 'board-name'; n.textContent = name;
    if (mine) { const you = document.createElement('small'); you.textContent = words.you; n.append(' ', you); }
    const m = document.createElement('span'); m.className = 'board-moves'; m.textContent = words.moves.replace('{moves}', moves);
    const t = document.createElement('strong'); t.textContent = formatTime(timeMs);
    li.append(r, n, m, t);
    return li;
  }

  async function loadBoard(level) {
    shownLevel = level;
    const mineHere = lastResult && lastResult.level === level ? lastResult : null;
    show('list');
    levels.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.level) === level)));
    $('board-level-title').textContent = 'LEVEL ' + pad(level) + ' · SCHNELLSTE ZEITEN';
    list.replaceChildren();
    $('board-rank').hidden = true;
    if (!configured()) { setMessage('notConfigured'); return; }
    setMessage('loading');
    const ticket = ++request;
    try {
      const rows = await rpc('gattlen_flow_board', { p_level: level, p_limit: BOARD_SIZE });
      if (ticket !== request) return;
      let marked = false;
      for (const entry of rows) {
        const mine = Boolean(mineHere) && !marked && Number(entry.rank) === mineHere.rank && entry.name === mineHere.name;
        if (mine) marked = true;
        list.append(row(entry.rank, entry.name, entry.time_ms, entry.moves, mine));
      }
      if (mineHere && !marked) {
        const gap = document.createElement('li'); gap.className = 'board-gap'; gap.textContent = '…';
        list.append(gap, row(mineHere.rank, mineHere.name, mineHere.best, mineHere.moves, true));
      }
      if (mineHere) {
        $('board-rank').textContent = words.yourRank.replace('{level}', level).replace('{rank}', mineHere.rank).replace('{total}', mineHere.total);
        $('board-rank').hidden = false;
      }
      setMessage(rows.length ? '' : 'empty');
    } catch {
      if (ticket === request) setMessage('error');
    }
  }

  function open() {
    const run = getRun();
    const saved = readPlayer();
    const fresh = run && saved.submitted !== run.id;
    setMessage('');
    $('board-score-box').hidden = !fresh;
    if (fresh) {
      $('board-score-label').textContent = 'DEINE ZEIT · LEVEL ' + pad(run.level);
      $('board-score').textContent = formatTime(run.timeMs);
      $('board-score-moves').textContent = words.moves.replace('{moves}', run.moves) + (run.hints ? ' · ' + run.hints + (run.hints === 1 ? ' Tipp' : ' Tipps') : '');
    }
    if (!$('board-name').value) $('board-name').value = saved.name || '';
    if (!$('board-email').value) $('board-email').value = saved.email || '';
    if (fresh) { lastResult = null; show('form'); }
    else loadBoard(run ? run.level : getLevel());
    if (!dialog.open) dialog.showModal();
    if (fresh) (!$('board-name').value ? $('board-name') : submit).focus();
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const run = getRun();
    if (!run) return;
    const name = $('board-name').value.trim().replace(/\s+/g, ' ');
    const email = $('board-email').value.trim();
    if (!configured()) { setMessage('notConfigured'); return; }
    busy = true; submit.disabled = true; submit.textContent = words.saving; setMessage('');
    try {
      const [result] = await rpc('gattlen_flow_submit', {
        p_name: name, p_email: email, p_level: run.level, p_time_ms: run.timeMs, p_moves: run.moves, p_hints: run.hints
      });
      writePlayer({ name, email, submitted: run.id });
      lastResult = { level: run.level, name, rank: Number(result.rank), best: result.best_time_ms, moves: result.best_moves, total: Number(result.total) };
      $('board-score-box').hidden = true;
      await loadBoard(run.level);
    } catch (error) {
      setMessage(error.message === 'tooMany' ? 'tooMany' : 'error');
    } finally {
      busy = false; submit.disabled = false; submit.textContent = words.submit;
    }
  });

  document.querySelectorAll('[data-board]').forEach(button => button.addEventListener('click', () => {
    const win = $('win-dialog');
    if (win?.open) win.close();
    open();
  }));
  $('board-view-only').addEventListener('click', () => { const run = getRun(); loadBoard(run ? run.level : getLevel()); });
  $('board-again').addEventListener('click', () => { dialog.close(); onContinue?.(); });

  return { open };
}
