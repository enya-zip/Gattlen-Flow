import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
async function open(room:string,player:string){
 const res=await SELF.fetch("https://game.test/ws/"+room,{headers:{Upgrade:"websocket"}});
 expect(res.status).toBe(101);const ws=res.webSocket!;ws.accept();const frames:any[]=[];
 ws.addEventListener("message",(e:MessageEvent)=>{try{frames.push(JSON.parse(String(e.data)))}catch{}});
 const next=async(pred:(f:any)=>boolean)=>{for(let n=0;n<100;n++){const x=frames.find(pred);if(x)return x;await scheduler.wait(10)}throw Error("frame timeout")};
 ws.send(JSON.stringify({type:"join",playerId:player}));await next(f=>f.type==="state");
 return {ws,frames,next,send:(msg:unknown)=>ws.send(JSON.stringify(msg))};
}
describe("Gattlen Flow rooms",()=>{
 it("starts solo and persists rotations across reconnect",async()=>{
  const room="persist-"+crypto.randomUUID();const a=await open(room,"alice");
  a.send({type:"action",action:{type:"start",level:1,seed:1,mode:"campaign"}});
  const init=await a.next(f=>f.view?.initialized);const cell=init.view.board.findIndex((t:any)=>!t.locked);
  a.send({type:"action",action:{type:"rotate",cell}});const moved=await a.next(f=>f.view?.moves===1);a.ws.close();
  const b=await open(room,"alice");const restored=await b.next(f=>f.view?.moves===1);
  expect(restored.view.board).toEqual(moved.view.board);b.ws.close();
 });
 it("makes a second identity a spectator and rejects their moves",async()=>{
  const room="spectator-"+crypto.randomUUID();const a=await open(room,"alice");const b=await open(room,"bob");
  const state=await b.next(f=>f.type==="state");expect(state.view.yourTurn).toBe(false);
  b.send({type:"action",action:{type:"rotate",cell:1}});await b.next(f=>f.type==="error");
  a.ws.close();b.ws.close();
 });
 it("broadcasts the same board to two connections of the same seat",async()=>{
  const room="shared-"+crypto.randomUUID();const a=await open(room,"alice");const b=await open(room,"alice");
  a.send({type:"action",action:{type:"start",level:2,seed:123,mode:"challenge"}});
  const av=await a.next(f=>f.view?.level===2);const bv=await b.next(f=>f.view?.level===2);
  expect(av.view.board).toEqual(bv.view.board);a.ws.close();b.ws.close();
 });
 it("rejects malformed messages and non-websocket requests",async()=>{
  expect((await SELF.fetch("https://game.test/ws")).status).toBe(426);
  const a=await open("invalid-"+crypto.randomUUID(),"alice");a.ws.send("not-json");await a.next(f=>f.type==="error");a.ws.close();
 });
});
