import assert from "node:assert/strict";
import {setup,validateAction,applyAction,isGameOver,viewFor} from "../src/logic.js";
const start=(level=1,seed=1,mode="challenge")=>applyAction(setup(["p"]),"p",{type:"start",level,seed,mode});
function solve(state){let safety=0;while(!viewFor(state,"p").flow.ready&&safety++<30){const v=validateAction(state,"p",{type:"hint"});assert.equal(v.ok,true,"a solvable authored puzzle must offer a next hint");state=applyAction(state,"p",{type:"hint"});}assert.equal(viewFor(state,"p").flow.ready,true);return applyAction(state,"p",{type:"check"});}
let count=0;
for(let level=1;level<=12;level++)for(const seed of[1,20261028,20261231,777]){
 const s=start(level,seed);const original=JSON.stringify(s);const v=viewFor(s,"p");
 assert.equal(v.board.length,25);assert.equal(v.flow.ready,false);assert.equal("solution"in v,false);assert.equal(v.par>0,true);
 assert.equal(validateAction(s,"intruder",{type:"check"}).ok,false);
 for(const cell of[-1,25,1.5,"2",null])assert.equal(validateAction(s,"p",{type:"rotate",cell}).ok,false);
 const fixed=v.board.findIndex(t=>t.locked);assert.equal(validateAction(s,"p",{type:"rotate",cell:fixed}).ok,false);
 const rot=v.board.findIndex(t=>!t.locked);const after=applyAction(s,"p",{type:"rotate",cell:rot});
 assert.equal(JSON.stringify(s),original,"actions must not mutate the previous state");assert.equal(after.moves,s.moves+1);
 const undo=applyAction(after,"p",{type:"undo"});assert.equal(undo.board[rot].mask,s.board[rot].mask);assert.equal(undo.moves,after.moves,"undo must not erase score cost");
 const won=solve(s);assert.equal(isGameOver(won).over,true);assert.ok(won.score>=100&&won.score<=1000);
 assert.equal(validateAction(won,"p",{type:"rotate",cell:rot}).ok,false);count++;
}
const dailyA=start(12,20261028,"daily"),dailyB=start(12,20261028,"daily");assert.deepEqual(dailyA,dailyB);
assert.notDeepEqual(dailyA.board,start(12,20261029,"daily").board);
let campaign=applyAction(setup(["p"]),"p",{type:"start",level:1,seed:1,mode:"campaign"});assert.equal(validateAction(campaign,"p",{type:"start",level:13,seed:1,mode:"campaign"}).ok,false);campaign=solve(campaign);assert.equal(campaign.unlocked,2);
assert.equal(validateAction(setup(["p"]),"p",{type:"start",level:1,seed:0,mode:"challenge"}).ok,false);
console.log("PASS: "+count+" level/seed combinations solvable; immutable actions, guarded inputs, daily determinism, score integrity and progression checked.");

for(let level=1;level<=12;level++){assert.deepEqual(viewFor(start(level,1,"campaign"),"p").board,viewFor(start(level,1,"challenge"),"p").board,"shared campaign challenges must keep the identical starting board");}
console.log("PASS: friend challenges preserve every campaign starting board.");
