export const meta = { game: "Gattlen Flow", minPlayers: 1, maxPlayers: 1 };

const BITS = [1, 2, 4, 8];
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];
const ROUTES = [
  [[0,1,2,7,12,13,14]],
  [[0,5,10,11,12,7,2,3,4]],
  [[0,5,10,11,12,7,2,3,4],[12,17,22,23,24]],
  [[0,1,6,11,12,13,14,19,24],[11,16,21,20],[13,8,3,4]],
  [[0,5,6,7,12,17,18,19,24],[7,8,9,4],[17,16,21,20]],
  [[0,1,2,7,6,11,16,17,18,19,24],[2,3,4,9],[18,23,22,21,20]]
];
function rotate(mask) { return ((mask << 1) & 15) | ((mask >> 3) & 1); }
function nextSeed(seed) { return (Math.imul(seed, 1664525) + 1013904223) >>> 0; }
function transform(i, turns, mirror) {
  let r = Math.floor(i/5), c = i%5;
  if (mirror) c=4-c;
  for (let t=0;t<turns;t++) { const old=r; r=c; c=4-old; }
  return r*5+c;
}
function clockwise(from,to) { for (let n=0;n<4;n++) { if(from===to)return n; from=rotate(from); } return 0; }
function makeLevel(level,seed,mode) {
  const base = level<=6?level-1:3+(level%3);
  const turns=level>6?(level+seed)%4:0;
  const mirror=level>9 && seed%2===1;
  const routes=ROUTES[base].map(p=>p.map(i=>transform(i,turns,mirror)));
  const solution=Array(25).fill(0);
  for(const path of routes)for(let j=1;j<path.length;j++){
    const a=path[j-1],b=path[j],diff=b-a;
    const d=diff===-5?0:diff===1?1:diff===5?2:3;
    solution[a]|=BITS[d]; solution[b]|=BITS[(d+2)%4];
  }
  const source=routes[0][0];
  const ends=routes.map(p=>p[p.length-1]);
  const active=solution.map((m,i)=>m?i:-1).filter(i=>i>=0);
  const eligible=active.filter(i=>i!==source&&!ends.includes(i));
  const roles={};
  if(level>=4)roles[eligible[Math.floor(eligible.length*.44)]]="pump";
  if(level>=7)roles[eligible[Math.floor(eligible.length*.68)]]="fan";
  if(level>=9)roles[eligible[Math.floor(eligible.length*.22)]]="battery";
  let rng=nextSeed(seed+level*7919);
  let par=0;
  const board=solution.map((goal,i)=>{
    rng=nextSeed(rng);
    const kind=i===source?"solar":ends.includes(i)?"house":roles[i]|| (goal?"pipe":rng%4===0?"tree":"pipe");
    const locked=kind==="solar"||kind==="house"||kind==="tree";
    let mask=goal;
    if(!goal&&kind==="pipe")mask=[3,5,6,9,10,12][rng%6];
    const steps=locked?0:(rng>>>8)%4;
    for(let n=0;n<steps;n++)mask=rotate(mask);
    if(goal&&!locked)par+=clockwise(mask,goal);
    return {mask,kind,locked};
  });
  if(par===0){const i=eligible[0];board[i]={...board[i],mask:rotate(board[i].mask)};par=clockwise(board[i].mask,solution[i]);}
  return {level,seed,mode,board,initial:board.map(t=>({...t})),solution,source,par,targets:ends.length,
    moves:0,hints:0,attempts:0,history:[],won:false,score:0,stars:0,feedback:"ready",hintCell:-1,initialized:true};
}
function network(state) {
  const lit=Array(25).fill(false),queue=[state.source];lit[state.source]=true;
  const leaks=[];
  for(let q=0;q<queue.length;q++){
    const i=queue[q],mask=state.board[i].mask;
    for(let d=0;d<4;d++)if(mask&BITS[d]){
      const r=Math.floor(i/5)+DR[d],c=i%5+DC[d];
      if(r<0||r>4||c<0||c>4){leaks.push(i);continue;}
      const ni=r*5+c;
      if(!(state.board[ni].mask&BITS[(d+2)%4])){leaks.push(i);continue;}
      if(!lit[ni]){lit[ni]=true;queue.push(ni);}
    }
  }
  const required=state.board.map((t,i)=>["house","pump","fan","battery"].includes(t.kind)?i:-1).filter(i=>i>=0);
  const delivered=required.filter(i=>lit[i]).length;
  return {lit,leaks,delivered,total:required.length,ready:delivered===required.length&&leaks.length===0};
}
export function setup(players) {
  return {...makeLevel(1,1,"campaign"),owner:players[0]||"",unlocked:1,initialized:false};
}
export function validateAction(state,playerId,action) {
  if(playerId!==state.owner)return {ok:false,error:"spectator"};
  if(!action||typeof action!=="object"||Array.isArray(action))return {ok:false,error:"invalid_action"};
  if(action.type==="start"){
    if(!Number.isInteger(action.level)||action.level<1||action.level>12)return {ok:false,error:"invalid_level"};
    if(!["campaign","challenge"].includes(action.mode))return {ok:false,error:"invalid_mode"};
    if(!Number.isInteger(action.seed)||action.seed<1||action.seed>99999999)return {ok:false,error:"invalid_seed"};
    if(action.mode==="campaign"&&action.seed!==1)return {ok:false,error:"invalid_seed"};
    return {ok:true};
  }
  if(!state.initialized)return {ok:false,error:"not_started"};
  if(state.won)return {ok:false,error:"already_won"};
  if(action.type==="rotate"){
    if(!Number.isInteger(action.cell)||action.cell<0||action.cell>=25)return {ok:false,error:"invalid_cell"};
    if(state.board[action.cell].locked)return {ok:false,error:"fixed_cell"};
    return {ok:true};
  }
  if(action.type==="undo")return state.history.length?{ok:true}:{ok:false,error:"no_undo"};
  if(action.type==="hint")return state.board.some((t,i)=>state.solution[i]&&!t.locked&&t.mask!==state.solution[i])?{ok:true}:{ok:false,error:"no_hint"};
  if(action.type==="check"||action.type==="restart")return {ok:true};
  return {ok:false,error:"invalid_action"};
}
export function applyAction(state,playerId,action) {
  if(!validateAction(state,playerId,action).ok)return state;
  if(action.type==="start")return {...makeLevel(action.level,action.seed,action.mode),owner:state.owner,unlocked:Math.max(state.unlocked,action.mode==="campaign"?action.level:1)};
  if(action.type==="restart")return {...makeLevel(state.level,state.seed,state.mode),owner:state.owner,unlocked:state.unlocked};
  if(action.type==="undo"){
    const last=state.history[state.history.length-1];
    const board=state.board.map((t,i)=>i===last.cell?{...t,mask:last.mask}:t);
    return {...state,board,history:state.history.slice(0,-1),feedback:"ready",hintCell:-1};
  }
  if(action.type==="rotate"||action.type==="hint"){
    let cell=action.cell;
    if(action.type==="hint")cell=state.board.findIndex((t,i)=>state.solution[i]&&!t.locked&&t.mask!==state.solution[i]);
    const old=state.board[cell].mask;
    const mask=action.type==="hint"?state.solution[cell]:rotate(old);
    const board=state.board.map((t,i)=>i===cell?{...t,mask}:t);
    return {...state,board,moves:state.moves+1,hints:state.hints+(action.type==="hint"?1:0),
      history:[...state.history.slice(-99),{cell,mask:old}],feedback:"ready",hintCell:action.type==="hint"?cell:-1};
  }
  const flow=network(state);
  if(!flow.ready)return {...state,attempts:state.attempts+1,feedback:flow.delivered<flow.total?"missing_targets":"open_ends",hintCell:-1};
  const stars=state.hints===0&&state.moves<=state.par+2?3:state.hints<=1&&state.moves<=state.par+10?2:1;
  const score=Math.max(100,1000-Math.max(0,state.moves-state.par)*12-state.hints*120-state.attempts*35);
  return {...state,won:true,score,stars,feedback:"won",unlocked:state.mode==="campaign"?Math.max(state.unlocked,Math.min(12,state.level+1)):state.unlocked};
}
export function isGameOver(state) {
  return state.won?{over:true,winner:state.owner,score:state.score,stars:state.stars}:{over:false};
}
export function viewFor(state,playerId) {
  return {board:state.board,level:state.level,seed:state.seed,mode:state.mode,moves:state.moves,
    hints:state.hints,attempts:state.attempts,par:state.par,won:state.won,score:state.score,stars:state.stars,
    unlocked:state.unlocked,flow:network(state),feedback:state.feedback,hintCell:state.hintCell,
    canUndo:state.history.length>0,initialized:state.initialized,yourTurn:state.owner===playerId};
}
