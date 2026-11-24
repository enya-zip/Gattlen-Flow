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
  noRun: 'Schaff ein Level der Reise, dann kannst du dich eintragen.',
  yourRank: 'Dein Platz: {rank} von {total}',
  levels: '{levels} von 12 Levels · {stars} ★',
  you: 'DU'
};

const configured = () => Boolean(LEADERBOARD.url && LEADERBOARD.key);
const number = n => Math.round(Number(n) || 0).toLocaleString('de-CH');

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
  try { localStorage.setItem(PLAYER_KEY, JSON.stringify(value)); } catch {}
}

// Rangliste: Formular (Name, E-Mail) -> Bestenliste mit eigenem Platz.
// getRun() liefert den aktuellen Stand der Reise: { id, score, levels, stars } oder null.
// Die id ändert sich, sobald sich Punkte, Levels oder Sterne verbessern.
export function setupLeaderboard({ getRun, onContinue }) {
  const $ = id => document.getElementById(id);
  const dialog = $('board-dialog');
  const form = $('board-form');
  const list = $('board-list');
  const message = $('board-message');
  const submit = $('board-submit');
  let lastResult = null, busy = false;

  function show(view) {
    $('board-entry').hidden = view !== 'form';
    $('board-view').hidden = view !== 'list';
  }
  function setMessage(key) {
    message.textContent = key ? words[key] : '';
    message.hidden = !key;
  }
  function row(rank, name, score, mine) {
    const li = document.createElement('li');
    if (mine) li.className = 'mine';
    const r = document.createElement('span'); r.className = 'board-rank'; r.textContent = rank;
    const n = document.createElement('span'); n.className = 'board-name'; n.textContent = name;
    if (mine) { const you = document.createElement('small'); you.textContent = words.you; n.append(' ', you); }
    const s = document.createElement('strong'); s.textContent = number(score);
    li.append(r, n, s);
    return li;
  }

  async function loadBoard(note) {
    show('list');
    list.replaceChildren();
    $('board-rank').hidden = true;
    if (!configured()) { setMessage('notConfigured'); return; }
    setMessage('loading');
    try {
      const rows = await rpc('gattlen_flow_board', { p_limit: BOARD_SIZE });
      let marked = false;
      for (const entry of rows) {
        const mine = Boolean(lastResult) && !marked && Number(entry.rank) === lastResult.rank && entry.name === lastResult.name;
        if (mine) marked = true;
        list.append(row(entry.rank, entry.name, entry.score, mine));
      }
      if (lastResult && !marked) {
        const gap = document.createElement('li'); gap.className = 'board-gap'; gap.textContent = '…';
        list.append(gap, row(lastResult.rank, lastResult.name, lastResult.best, true));
      }
      if (lastResult) {
        $('board-rank').textContent = words.yourRank.replace('{rank}', lastResult.rank).replace('{total}', lastResult.total);
        $('board-rank').hidden = false;
      }
      setMessage(rows.length ? (note || '') : 'empty');
    } catch {
      setMessage('error');
    }
  }

  function open() {
    const run = getRun();
    setMessage('');
    $('board-score-box').hidden = !run;
    if (run) {
      $('board-score').textContent = number(run.score);
      $('board-levels').textContent = words.levels.replace('{levels}', run.levels).replace('{stars}', run.stars);
    }
    const saved = readPlayer();
    if (!$('board-name').value) $('board-name').value = saved.name || '';
    if (!$('board-email').value) $('board-email').value = saved.email || '';
    if (!run || saved.submitted === run.id) loadBoard(run ? '' : 'noRun');
    else { lastResult = null; show('form'); }
    if (!dialog.open) dialog.showModal();
    if (run && saved.submitted !== run.id) (!$('board-name').value ? $('board-name') : submit).focus();
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
        p_name: name, p_email: email, p_score: run.score, p_levels: run.levels, p_stars: run.stars
      });
      writePlayer({ name, email, submitted: run.id });
      lastResult = { name, rank: Number(result.rank), best: result.best_score, total: Number(result.total) };
      await loadBoard();
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
  $('board-view-only').addEventListener('click', () => { lastResult = null; loadBoard(); });
  $('board-again').addEventListener('click', () => { dialog.close(); onContinue?.(); });

  return { open };
}
