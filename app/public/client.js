import{setupLeaderboard,formatTime}from"/leaderboard.js";
const $=id=>document.getElementById(id);
const strings={
 connected:"Live gespeichert",connecting:"Verbinden …",offline:"Verbindung unterbrochen",
 ready:"Tippe auf eine blaue Leitung zum Drehen.",complete:"Alles verbunden. Jetzt Energie starten!",
 missing:"Noch nicht alle Gebäude und Technik-Bausteine sind verbunden.",open:"Im grünen Netz gibt es noch offene Leitungsenden.",
 spectator:"Du schaust zu. Öffne das Spiel ohne Raum-Link für deine eigene Runde.",
 fixed:"Dieser Baustein bleibt fest.",noHint:"Alle richtigen Bausteine stehen schon. Prüfe die offenen Enden.",
 errors:{invalid_action:"Diese Aktion ist gerade nicht möglich.",locked:"Löse zuerst das vorherige Level.",no_undo:"Noch keine Drehung zum Zurücknehmen.",already_won:"Dieses Level ist gelöst.",invalid_level:"Dieses Level gibt es nicht.",invalid_seed:"Dieser Challenge-Link ist ungültig."},
 kinds:{solar:"Solardach",house:"Haus",pipe:"Leitung",pump:"Wärmepumpe",fan:"Lüftung",battery:"Speicher",tree:"Baum"},
 levels:["Der erste Funke","Um die Ecke","Zwei Häuser, ein Netz","Wärme fürs Quartier","Clever kombiniert","Die grosse Verbindung","Frische Luft","Alles im Fluss","Energie auf Vorrat","Ein Dorf voller Leben","Das Wallis verbindet","Mit Herz für Technik"],
 goals:["Verbinde Sonne und Haus.","Finde den Weg um die Ecke.","Versorge beide Häuser.","Verbinde Häuser und Wärmepumpe.","Bring Wärme ins Quartier.","Schliesse das ganze Netz.","Bring frische Luft ins Dorf.","Verbinde alle Technik-Bausteine.","Nimm den Speicher ins Netz.","Versorge das ganze Dorf.","Eine Lösung für alle.","Bring das Wallis zum Leuchten."],
 places:["Visp","Brig","Naters","Ausserberg","Gampel","Leuk","Raron","Visperterminen","Bürchen","Saas-Fee","Zermatt","Oberwallis"]
};
function read(key,fallback){try{const s=localStorage.getItem("gattlen-flow:"+key);return s?JSON.parse(s):fallback;}catch{return fallback;}}
function save(key,value){try{localStorage.setItem("gattlen-flow:"+key,JSON.stringify(value));}catch{}}
const params=new URLSearchParams(location.search);
const safeInt=(v,min,max,fallback)=>{const n=Number(v);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;};
const id=read("player",null)||crypto.randomUUID();save("player",id);
let room=read("room",null)||"flow-"+crypto.randomUUID().replaceAll("-","").slice(0,24);save("room",room);
if(params.has("room")&&/^[A-Za-z0-9_-]{1,64}$/.test(params.get("room")))room=params.get("room");
const identity=params.get("spectator")==="1"?crypto.randomUUID():id;
let initial=params.has("challenge")?{level:safeInt(params.get("challenge"),1,12,1),seed:safeInt(params.get("seed"),1,99999999,1),mode:"challenge"}:{level:1,seed:1,mode:"campaign"};
let pendingConfig=null,view=null,lastMessage=null,socket=null,retry=0,retryTimer=null,connected=false,firstFrame=true,wonKey="",toastTimer=null,selectedCell=0;
let unlocked=read("unlocked",1);
// Zeitmessung für die Rangliste. Die Uhr startet nur bei einem frisch gestarteten Level (0 Züge),
// damit ein Neuladen mitten im Level die Zeit nicht zurücksetzt. Jeder Tipp kostet 10 Sekunden.
const HINT_PENALTY=10000;
let round=0,timer={key:"",start:0,ms:null},lastRun=null,clockFrame=0;
function tickClock(){cancelAnimationFrame(clockFrame);const ms=timer.ms??(timer.key?performance.now()-timer.start+(view?.hints||0)*HINT_PENALTY:null);$("time").textContent=ms==null?"–":formatTime(ms);if(timer.key&&timer.ms==null)clockFrame=requestAnimationFrame(()=>setTimeout(tickClock,90));}
let records=read("records",{}),settings=read("settings",{sound:false,reduced:false,contrast:false,large:false}),wantInitial=params.has("challenge");
const images={solar:"solar",house:"house",pump:"pump",fan:"fan",battery:"battery",tree:"tree"};
const soundSvg=on=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>'+(on?'<path d="M17 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/>':'<path d="m17 9 5 6m0-6-5 6"/>')+'</svg>';
const music=new Audio("/assets/music.mp3");music.loop=true;music.volume=.22;music.preload="none";
const clickAudio=new Audio("/assets/rotate.mp3");clickAudio.volume=.28;clickAudio.preload="none";
const winAudio=new Audio("/assets/win.mp3");winAudio.volume=.35;winAudio.preload="none";
function sfx(which){if(!settings.sound)return;const audio=which==="win"?winAudio:clickAudio;audio.currentTime=0;audio.play().catch(()=>{});}
function applySettings(){document.body.classList.toggle("reduce-motion",settings.reduced);document.body.classList.toggle("contrast",settings.contrast);document.body.classList.toggle("large-text",settings.large);$("sound").innerHTML=soundSvg(settings.sound);$("sound").setAttribute("aria-label",settings.sound?"Ton ausschalten":"Ton einschalten");$("sound").title=settings.sound?"Ton ausschalten":"Ton einschalten";$("reduced").checked=settings.reduced;$("contrast").checked=settings.contrast;$("large-text").checked=settings.large;if(!settings.sound)music.pause();save("settings",settings);}
applySettings();
$("sound").onclick=()=>{settings.sound=!settings.sound;applySettings();if(settings.sound)music.play().catch(()=>notify("Tippe nochmals auf Ton, um die Musik zu starten."));};
for(const [el,key]of[["reduced","reduced"],["contrast","contrast"],["large-text","large"]])$(el).onchange=()=>{settings[key]=$(el).checked;applySettings();};
function notify(text){$("toast").textContent=text;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2400);}
function showDialog(id){const d=$(id);if(!d.open)d.showModal();}
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());
document.querySelectorAll("dialog").forEach(d=>d.addEventListener("click",e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$("help").onclick=()=>showDialog("help-dialog");
function send(msg){if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify(msg));return true;}notify("Die Verbindung wird wiederhergestellt.");return false;}
function action(a){if(!connected||!view?.yourTurn)return;send({type:"action",action:a});}
function setConnection(on){connected=on;$("connection").className=on?"live":"";$("connection").innerHTML="<i></i>";$("connection").append(document.createTextNode(on?strings.connected:strings.connecting));if(!on){for(const e of[$("power"),$("undo"),$("restart"),$("hint")])e.disabled=true;}}
function requestLevel(config){if(!connected)return notify("Einen Moment, die Verbindung wird hergestellt.");pendingConfig=config;round++;timer={key:"",start:0,ms:null};wonKey="";if($("win-dialog").open)$("win-dialog").close();$("gamepanel")?.classList.remove("energizing");document.querySelector(".gamepanel").classList.remove("energizing");send({type:"reset"});}
function connect(){
 clearTimeout(retryTimer);
 if(socket){try{socket.close();}catch{}}
 const ws=new WebSocket((location.protocol==="https:"?"wss:":"ws:")+"//"+location.host+"/ws/"+encodeURIComponent(room));socket=ws;
 ws.addEventListener("open",()=>{if(socket!==ws)return;retry=0;setConnection(true);send({type:"join",playerId:identity});});
 ws.addEventListener("message",e=>{if(socket!==ws||e.data==="__pong")return;let msg;try{msg=JSON.parse(e.data);}catch{return;}
  if(msg.type==="state"){lastMessage=msg;view=msg.view;if(!view)return;
   if(pendingConfig&&!view.initialized&&msg.status==="playing"){const config=pendingConfig;pendingConfig=null;send({type:"action",action:{type:"start",...config}});return;}
   if(firstFrame){firstFrame=false;if(wantInitial){wantInitial=false;requestLevel(initial);return;}}
   if(!view.initialized){send({type:"action",action:{type:"start",...initial}});return;}
   render(msg);
  }else if(msg.type==="error"){notify(strings.errors[msg.error]|| (msg.error==="spectator"?strings.spectator:msg.error==="no_hint"?strings.noHint:"Das hat gerade nicht geklappt. Bitte nochmals versuchen."));}
 });
 ws.addEventListener("close",()=>{if(socket!==ws)return;setConnection(false);retry++;$("connection").textContent=strings.offline;if(!view){$("loading-text").textContent="Die Verbindung dauert etwas länger.";$("reconnect").hidden=false;}retryTimer=setTimeout(connect,Math.min(15000,500*2**Math.min(retry,5)));});
 ws.addEventListener("error",()=>{if(socket===ws)$("connection").textContent=strings.offline;});
}
$("reconnect").onclick=connect;
setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send("__ping");},25000);
function pathFor(mask){let p="";if(mask&1)p+="M50 50V-1";if(mask&2)p+="M50 50H101";if(mask&4)p+="M50 50V101";if(mask&8)p+="M50 50H-1";return p;}
function recordKey(v){return v.mode+":"+v.level+":"+v.seed;}
function rotateCell(i){if(!connected||!view?.yourTurn||view.won)return;selectedCell=i;const t=view.board[i];if(t.locked)return notify(strings.fixed);sfx("click");if(navigator.vibrate&&!settings.reduced)navigator.vibrate(8);action({type:"rotate",cell:i});}
function render(msg){
 const v=view,roundKey=round+":"+recordKey(v);
 if(!v.won&&timer.key!==roundKey&&v.moves===0){timer={key:roundKey,start:performance.now(),ms:null};}
 if(v.won&&timer.key===roundKey&&timer.ms==null){timer.ms=Math.round(performance.now()-timer.start)+v.hints*HINT_PENALTY;if(v.seed===1)lastRun={id:roundKey+":"+timer.ms,level:v.level,timeMs:Math.max(1000,timer.ms),moves:v.moves,hints:v.hints};}
 tickClock();unlocked=Math.max(unlocked,v.unlocked);save("unlocked",unlocked);$("loading").hidden=true;
 const oldFocus=document.activeElement?.dataset?.cell;const fragment=document.createDocumentFragment();
 for(let i=0;i<25;i++){
  const t=v.board[i],b=document.createElement("button"),lit=v.flow.lit[i];b.className="tile "+t.kind+(lit?" lit":"")+(["house","pump","fan","battery"].includes(t.kind)?" target":"")+(v.feedback!=="ready"&&v.flow.leaks.includes(i)?" bad":"")+(v.hintCell===i?" hinted":"");b.dataset.cell=i;
  b.setAttribute("aria-label",strings.kinds[t.kind]+", Zeile "+(Math.floor(i/5)+1)+", Spalte "+(i%5+1)+(t.locked?", fest":", drehen")+(lit?", mit Energie versorgt":""));b.disabled=t.locked||v.won||!v.yourTurn;
  const p=pathFor(t.mask);if(p){b.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true"><path d="'+p+'" class="pipe-shadow"/><path d="'+p+'" class="pipe-base"/><path d="'+p+'" class="pipe-gloss"/>'+(lit?'<path d="'+p+'" class="flowline"/>':"")+'</svg><span class="joint"></span>';}
  if(images[t.kind]){const img=document.createElement("img");img.src="/assets/"+images[t.kind]+".png";img.alt="";img.className="art";img.width=100;img.height=100;b.append(img);}
  if(t.locked&&t.kind!=="tree"){const mark=document.createElement("span");mark.className="fixedmark";mark.textContent=lit?"●":"◆";b.append(mark);}
  b.onclick=()=>rotateCell(i);fragment.append(b);
 }
 $("board").replaceChildren(fragment);
 if(oldFocus!==undefined){const b=$("board").querySelector('[data-cell="'+oldFocus+'"]');if(b&&!b.disabled)b.focus({preventScroll:true});}
 $("moves").textContent=v.moves;$("connected").innerHTML=v.flow.delivered+' <small>/ '+v.flow.total+"</small>";
 const record=records[recordKey(v)];$("record").textContent=record?.timeMs?formatTime(record.timeMs):"–";
 $("level-caption").textContent=v.mode==="challenge"?"DEINE HERAUSFORDERUNG":"LEVEL "+String(v.level).padStart(2,"0")+" / 12";
 $("goal").textContent=strings.goals[v.level-1];
 $("location").textContent=strings.places[v.level-1]+" · "+strings.levels[v.level-1];
 const target=safeInt(params.get("beat"),0,10000,-1);$("challenge-target").hidden=!(target>=0&&v.mode!=="campaign");$("challenge-target").textContent="Zu schlagen: "+target+" Züge. Gleicher Start, dein eigener Weg.";
 $("feedback").className="feedback"+(v.flow.ready?" readyflow":v.feedback==="missing_targets"||v.feedback==="open_ends"?" error":"");
 $("feedback").textContent=!v.yourTurn?strings.spectator:v.won?"Das Dorf leuchtet. Gut verbunden!":v.flow.ready?strings.complete:v.feedback==="missing_targets"?strings.missing:v.feedback==="open_ends"?strings.open:strings.ready;
 $("power").disabled=!connected||!v.yourTurn||v.won;$("power").classList.toggle("ready",v.flow.ready);
 $("undo").disabled=!connected||!v.yourTurn||v.won||!v.canUndo;$("restart").disabled=!connected||!v.yourTurn;$("hint").disabled=!connected||!v.yourTurn||v.won||v.flow.ready;
 $("progress").style.width=((v.mode==="campaign"?v.level-1+(v.won?1:0):v.won?12:0)/12*100)+"%";
 $("progress-text").textContent=v.mode==="campaign"?Object.keys(records).filter(k=>k.startsWith("campaign:")).length+" von 12 Levels geschafft":"Gleicher Start. Gleiche Chancen.";
 if(v.won){
  const key=recordKey(v)+":"+v.moves+":"+v.hints+":"+v.attempts;
  const k=recordKey(v),old=records[k],ms=timer.key===roundKey?timer.ms:null,bestMs=[ms,old?.timeMs].filter(Number.isFinite);
  if(!old||v.score>old.score||(bestMs.length&&Math.min(...bestMs)!==old.timeMs)){records[k]={...(old&&old.score>=v.score?old:{moves:v.moves,score:v.score,stars:v.stars,hints:v.hints}),...(bestMs.length?{timeMs:Math.min(...bestMs)}:{})};save("records",records);$("record").textContent=records[k].timeMs?formatTime(records[k].timeMs):"–";if(v.mode==="campaign")$("progress-text").textContent=Object.keys(records).filter(k=>k.startsWith("campaign:")).length+" von 12 Levels geschafft";}
  if(wonKey!==key){wonKey=key;document.querySelector(".gamepanel").classList.add("energizing");sfx("win");if(navigator.vibrate&&!settings.reduced)navigator.vibrate([15,45,25]);setTimeout(()=>{if(view?.won&&wonKey===key)showWin();},settings.reduced?100:1100);}
 }else{document.querySelector(".gamepanel").classList.remove("energizing");wonKey="";}
}
$("power").onclick=()=>action({type:"check"});$("undo").onclick=()=>action({type:"undo"});$("hint").onclick=()=>action({type:"hint"});$("restart").onclick=()=>requestLevel({level:view.level,seed:view.seed,mode:view.mode});
$("levels").onclick=()=>{const grid=$("level-grid");grid.replaceChildren();for(let n=1;n<=12;n++){const b=document.createElement("button");b.textContent=String(n).padStart(2,"0");b.disabled=n>unlocked;if(n===view?.level&&view?.mode==="campaign")b.className="current";const small=document.createElement("small");small.textContent=n>unlocked?"◆":"★".repeat(records["campaign:"+n+":1"]?.stars||0);b.append(small);b.setAttribute("aria-label","Level "+n+(n>unlocked?", gesperrt":""));b.onclick=()=>{$("levels-dialog").close();requestLevel({level:n,seed:1,mode:"campaign"});};grid.append(b);}showDialog("levels-dialog");};
function showWin(){const v=view;$("stars").innerHTML="★".repeat(v.stars)+'<span class="empty">'+"★".repeat(3-v.stars)+"</span>";$("stars").setAttribute("aria-label",v.stars+" von 3 Sternen");$("win-title").innerHTML=v.level===12?"Das ganze Wallis<br>leuchtet!":"Das Dorf<br>leuchtet!";$("win-description").textContent=v.hints?"Mit "+v.moves+" Zügen und "+v.hints+" Tipp"+(v.hints===1?"":"s")+" (+"+v.hints*HINT_PENALTY/1000+" s)"+" hast du alles verbunden.":"Mit "+v.moves+" Zügen hast du das ganze Netz verbunden.";$("result-score").textContent=v.score.toLocaleString("de-CH");$("result-moves").textContent=v.moves;$("result-time").textContent=timer.ms!=null?formatTime(timer.ms):"–";$("win-board").hidden=!(lastRun&&lastRun.id.startsWith(round+":"+recordKey(v)));$("next").textContent=v.mode==="campaign"&&v.level<12?"Nächstes Level →":"Noch eine Runde ↻";$("share-status").textContent="";$("share-fallback").hidden=true;showDialog("win-dialog");}
$("next").onclick=()=>requestLevel({level:view.mode==="campaign"?Math.min(view.level+1,12):view.level,seed:view.seed,mode:view.mode});
$("share").onclick=async()=>{const v=view,u=new URL(location.origin+"/");u.searchParams.set("challenge",v.level);u.searchParams.set("seed",v.seed);u.searchParams.set("beat",v.moves);
 const text="Mein Dorf läuft! Gattlen Flow, Level "+v.level+": "+(timer.ms!=null?formatTime(timer.ms)+", ":"")+v.moves+" Züge"+(v.hints?", "+v.hints+" Tipps":" ohne Tipp")+". Schaffst du es besser?";
 try{if(navigator.share){await navigator.share({title:"Gattlen Flow",text,url:u.href});$("share-status").textContent="Deine Challenge ist geteilt.";}else{await navigator.clipboard.writeText(text+" "+u.href);$("share-status").textContent="Challenge-Link kopiert. Jetzt an deine Freunde schicken."}}catch(e){if(e.name==="AbortError")return;const input=$("share-fallback");input.hidden=false;input.value=u.href;input.select();$("share-status").textContent="Hier kannst du den Challenge-Link kopieren.";}};
document.addEventListener("keydown",e=>{if(e.code==="Escape")return;if(e.code==="KeyH"&&!document.querySelector("dialog[open]"))showDialog("help-dialog");});
if(params.get("debug")==="1"){const el=$("debug");el.hidden=false;let last=performance.now(),count=0;function frame(now){count++;if(now-last>=1000){el.textContent="FPS "+Math.round(count*1000/(now-last))+" · 25 tiles · SVG · "+(connected?"online":"offline");last=now;count=0;}requestAnimationFrame(frame);}requestAnimationFrame(frame);}
document.addEventListener("visibilitychange",()=>{if(document.hidden)music.pause();else if(settings.sound)music.play().catch(()=>{});});
setupLeaderboard({getRun:()=>lastRun,getLevel:()=>view?.level||1,onContinue:()=>{if(view?.won)$("next").click();}});
connect();
