// Spielraum im Browser, für Hosting ohne eigenen Server (z. B. GitHub Pages).
// Verhält sich gegenüber client.js wie die WebSocket-Verbindung zu src/room.ts:
// gleiche Nachrichten, gleiche Regeln (logic.js), Spielstand bleibt im Browser gespeichert.
// logic.js wird beim Veröffentlichen aus src/logic.js hierher kopiert (siehe .github/workflows/pages.yml).
import * as logic from './logic.js';

const KEY = 'gattlen-flow:local-room:';

export class LocalSocket {
  static OPEN = 1;
  constructor(room) {
    this.room = room;
    this.readyState = 0;
    this.listeners = { open: [], message: [], close: [], error: [] };
    this.playerId = null;
    setTimeout(() => { this.readyState = 1; this.emit('open', {}); }, 0);
  }
  addEventListener(type, fn) { this.listeners[type]?.push(fn); }
  emit(type, event) { for (const fn of this.listeners[type] || []) fn(event); }
  close() { this.readyState = 3; }
  reply(data) { setTimeout(() => { if (this.readyState === 1) this.emit('message', { data: typeof data === 'string' ? data : JSON.stringify(data) }); }, 0); }
  load() {
    try { const g = JSON.parse(localStorage.getItem(KEY + this.room) || 'null'); if (g && Array.isArray(g.seats)) return g; } catch {}
    return { status: 'waiting', seats: [], state: null, result: null };
  }
  save(game) { try { localStorage.setItem(KEY + this.room, JSON.stringify(game)); } catch {} }
  broadcast(game) {
    this.reply({ type: 'state', status: game.status, seats: game.seats, you: this.playerId, connected: [this.playerId],
      view: game.state ? logic.viewFor(game.state, this.playerId) : null, result: game.result, meta: logic.meta });
  }
  send(raw) {
    if (this.readyState !== 1) return;
    if (raw === '__ping') return this.reply('__pong');
    let msg; try { msg = JSON.parse(raw); } catch { return this.reply({ type: 'error', error: 'invalid message' }); }
    const game = this.load();
    if (msg.type === 'join') {
      this.playerId = String(msg.playerId || '');
      if (!game.seats.includes(this.playerId) && game.seats.length < logic.meta.maxPlayers) game.seats.push(this.playerId);
      if (game.status === 'waiting' && game.seats.length >= logic.meta.minPlayers) { game.state = logic.setup(game.seats); game.status = 'playing'; }
      this.save(game); return this.broadcast(game);
    }
    if (!this.playerId) return this.reply({ type: 'error', error: 'join first' });
    if (msg.type === 'action') {
      if (game.status !== 'playing') return this.reply({ type: 'error', error: 'game is not in progress' });
      if (!game.seats.includes(this.playerId)) return this.reply({ type: 'error', error: 'spectator' });
      const verdict = logic.validateAction(game.state, this.playerId, msg.action);
      if (!verdict.ok) return this.reply({ type: 'error', error: verdict.error || 'invalid action' });
      game.state = logic.applyAction(game.state, this.playerId, msg.action);
      const end = logic.isGameOver(game.state);
      if (end.over) { game.status = 'over'; game.result = end; }
      this.save(game); return this.broadcast(game);
    }
    if (msg.type === 'reset') {
      if (!game.seats.includes(this.playerId)) return this.reply({ type: 'error', error: 'spectator' });
      game.state = logic.setup(game.seats); game.status = 'playing'; game.result = null;
      this.save(game); return this.broadcast(game);
    }
    this.reply({ type: 'error', error: 'invalid message' });
  }
}
