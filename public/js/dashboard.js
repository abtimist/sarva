let socket;
if(typeof io!=="undefined"){socket=io();}

let stream=null,loopActive=false,displayLang="hi";
let audioCtx=null,analyser=null,waveAnimId=null;
let sessionInterval=null,sessionSeconds=0,listeningTimeout=null;
let retryCount=0;
const MAX_RETRIES=5;
let captions=[];
let currentSessionId=null;
let sessions=[];
let activeTabSessionId=null;
let allSessionData={};

const LANG_MAP={hi:{name:"Hindi",flag:"🇮🇳"},ta:{name:"Tamil",flag:"🇮🇳"},kn:{name:"Kannada",flag:"🇮🇳"},te:{name:"Telugu",flag:"🇮🇳"},ml:{name:"Malayalam",flag:"🇮🇳"}};
const LANG_NAMES={"en-IN":"English","hi-IN":"Hindi","ta-IN":"Tamil","kn-IN":"Kannada","te-IN":"Telugu","ml-IN":"Malayalam"};

// QR
async function generateQR(){let url;try{const r=await fetch("/server-ip");const d=await r.json();url=`http://${d.ip}:${d.port}/student`;}catch{url=window.location.origin+"/student";}document.getElementById("qr-url").textContent=url;if(typeof QRCode!=="undefined")new QRCode(document.getElementById("qrcode"),{text:url,width:90,height:90,colorDark:"#000",colorLight:"#fff"});}
generateQR();

function setDisplayLang(btn){document.querySelectorAll(".lang-btn").forEach(b=>b.classList.remove("active"));btn.classList.add("active");displayLang=btn.dataset.lang;const cfg=LANG_MAP[displayLang];document.getElementById("lang-label").textContent=cfg.name;document.getElementById("lang-flag").textContent=cfg.flag;renderParagraphs();}

// ── ONE single paragraph per panel ──
function renderParagraphs(){
  renderPara("para-en","scroll-en","en");
  renderPara("para-lang","scroll-lang",displayLang);
}

function renderPara(paraId,scrollId,lang){
  const para=document.getElementById(paraId);
  const scroll=document.getElementById(scrollId);
  const emptyId=paraId==="para-en"?"empty-en":"empty-lang";
  const empty=document.getElementById(emptyId);

  // Remove old text span
  const old=para.querySelector(".text");
  if(old) old.remove();

  if(captions.length===0){empty.style.display="block";return;}
  empty.style.display="none";

  // Merge ALL captions into ONE single paragraph with spaces
  const fullText=captions.map(c=>c[lang]||"").join(" ").trim();

  const span=document.createElement("span");
  span.className="text";
  span.textContent=fullText;

  // Add blinking cursor at the end
  const cursor=document.createElement("span");
  cursor.className="cursor";
  span.appendChild(cursor);

  para.appendChild(span);
  scroll.scrollTop=scroll.scrollHeight;
}

function esc(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML;}

// ── Notes Drawer ──
function toggleNotes(){document.getElementById("notes-drawer").classList.toggle("open");document.getElementById("drawer-backdrop").classList.toggle("visible");if(document.getElementById("notes-drawer").classList.contains("open"))loadSessions();}

async function loadSessions(){try{const r=await fetch("/sessions");sessions=await r.json();}catch{sessions=[];}renderSessionTabs();}

function renderSessionTabs(){const tabs=document.getElementById("session-tabs");tabs.innerHTML="";sessions.slice(0,10).forEach(s=>{const tab=document.createElement("div");tab.className="session-tab"+(activeTabSessionId===s.id?" active":"");const startedAt=s.started_at?s.started_at:s.created_at;const date=new Date(startedAt+"Z").toLocaleDateString(undefined,{month:"short",day:"numeric"});const time=new Date(startedAt+"Z").toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});const label=s.title!=="Untitled Session"?s.title:`${date} ${time}`;const badge=s.note_count>0?`<span class="tab-badge">${s.note_count}</span>`:"";tab.innerHTML=label+badge;tab.onclick=()=>switchSession(s.id);tabs.appendChild(tab);});}

async function switchSession(sessionId){activeTabSessionId=sessionId;renderSessionTabs();try{const r=await fetch(`/sessions/${sessionId}`);const data=await r.json();allSessionData[sessionId]=data;renderNotesText(sessionId);}catch{renderNotesText(sessionId);}}

function renderNotesText(sessionId){
  const container=document.getElementById("notes-text");
  const empty=document.getElementById("notes-empty");
  const data=allSessionData[sessionId];
  const notes=data?data.notes:[];
  container.innerHTML="";
  if(notes.length===0){empty.style.display="block";return;}
  empty.style.display="none";
  notes.forEach(n=>{
    if(n.is_auto){
      const span=document.createElement("span");
      span.className="auto-text";
      span.textContent=n.content+"\n\n";
      container.appendChild(span);
    }else{
      const time=new Date(n.created_at+"Z").toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"});
      const span=document.createElement("span");
      span.className="manual-text";
      span.textContent=`[${time}] ${n.content}\n`;
      container.appendChild(span);
    }
  });
  document.getElementById("notes-content").scrollTop=document.getElementById("notes-content").scrollHeight;
}

async function sendNote(){const input=document.getElementById("note-input");const text=input.value.trim();if(!text)return;const sid=activeTabSessionId||currentSessionId;if(!sid){alert("No active session.");return;}try{await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:sid,content:text})});input.value="";await switchSession(sid);updateBadge();}catch(e){console.error(e);}}

async function updateBadge(){try{const r=await fetch("/sessions");const s=await r.json();document.getElementById("notes-badge").textContent=s.reduce((a,b)=>a+b.note_count,0);}catch{}}

// ── Merge Dialog ──
let pendingMergeRecordingId=null;
let pendingMergeSessionId=null;

function showMergeDialog(data){
  pendingMergeRecordingId=data.recordingId;
  pendingMergeSessionId=data.sessionId;
  const overlay=document.getElementById("merge-overlay");
  const options=document.getElementById("merge-options");
  const preview=document.getElementById("merge-preview");
  options.innerHTML="";
  preview.textContent=data.transcript.substring(0,200)+(data.transcript.length>200?"...":"");
  // Option 1: Create new note
  const newOpt=document.createElement("div");
  newOpt.className="merge-option selected";
  newOpt.innerHTML="<input type='radio' name='merge' value='new' checked><div class='merge-option-text'><div class='merge-option-title'>+ Create New Note</div><div class='merge-option-desc'>Start a separate note for this recording</div></div>";
  newOpt.onclick=()=>{document.querySelectorAll(".merge-option").forEach(o=>o.classList.remove("selected"));newOpt.classList.add("selected");newOpt.querySelector("input").checked=true;};
  options.appendChild(newOpt);
  // Options for each existing note
  data.existingNotes.forEach(n=>{
    const opt=document.createElement("div");
    opt.className="merge-option";
    const snippet=(n.content||"").substring(0,60);
    opt.innerHTML=`<input type='radio' name='merge' value='${n.id}'><div class='merge-option-text'><div class='merge-option-title'>${esc(n.title)}</div><div class='merge-option-desc'>Merge into: ${esc(snippet)}${snippet.length>=60?"...":""}</div></div>`;
    opt.onclick=()=>{document.querySelectorAll(".merge-option").forEach(o=>o.classList.remove("selected"));opt.classList.add("selected");opt.querySelector("input").checked=true;};
    options.appendChild(opt);
  });
  overlay.classList.add("visible");
}

function closeMergeDialog(){document.getElementById("merge-overlay").classList.remove("visible");pendingMergeRecordingId=null;pendingMergeSessionId=null;}

async function confirmMerge(){
  const selected=document.querySelector(".merge-option.selected input");
  if(!selected||!pendingMergeRecordingId)return;
  const val=selected.value;
  try{
    if(val==="new"){
      const rec=await fetch(`/sessions/${pendingMergeSessionId}`);
      const sessionData=await rec.json();
      const recording=sessionData.recordings.find(r=>r.id===pendingMergeRecordingId);
      const content=(recording&&recording.transcript)?recording.transcript:"";
      await fetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:pendingMergeSessionId,content})});
    }else{
      await fetch(`/api/notes/${val}/merge`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recordingId:pendingMergeRecordingId})});
    }
    closeMergeDialog();
    await loadSessions();
    if(pendingMergeSessionId)await switchSession(pendingMergeSessionId);
    updateBadge();
  }catch(e){console.error("Merge error:",e);closeMergeDialog();}
}

document.addEventListener("DOMContentLoaded",()=>{const inp=document.getElementById("note-input");if(inp)inp.addEventListener("keydown",e=>{if(e.key==="Enter")sendNote();});});

// ── Socket ──
if(socket){
  socket.on("caption",(data)=>{
    retryCount=0;
    clearTimeout(listeningTimeout);
    captions.push(data);
    if(captions.length>300)captions.shift();
    renderParagraphs();
    if(data.detectedLang){const name=LANG_NAMES[data.detectedLang]||data.detectedLang;const badge=document.getElementById("detected-badge");badge.textContent=name;badge.classList.add("visible");}
    if(data.processingMs!==undefined){const lp=document.getElementById("latency-pill");lp.textContent=`${data.processingMs}ms`;lp.className="tb-pill"+(data.processingMs<1500?" fast":data.processingMs<3000?" medium":" slow");}
  });
  socket.on("student-count",(c)=>{document.getElementById("student-count-text").textContent=c;});
  socket.on("note-created",(data)=>{
    if(data.sessionId===currentSessionId||data.sessionId===activeTabSessionId){
      loadSessions().then(()=>switchSession(data.sessionId));
    }
    updateBadge();
  });
  socket.on("recording-ready",(data)=>{
    if(data.sessionId===currentSessionId||data.sessionId===activeTabSessionId){
      showMergeDialog(data);
    }
  });
}

function startTimer(){sessionSeconds=0;sessionInterval=setInterval(()=>{sessionSeconds++;const m=String(Math.floor(sessionSeconds/60)).padStart(2,"0");const s=String(sessionSeconds%60).padStart(2,"0");document.getElementById("timer-pill").textContent=`⏱ ${m}:${s}`;},1000);}
function stopTimer(){clearInterval(sessionInterval);document.getElementById("timer-pill").textContent="⏱ 00:00";}

async function toggleRecording(){loopActive?stopRecording():await startRecording();}

async function startRecording(){
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("Mic not supported");
    stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    loopActive=true;retryCount=0;captions.length=0;
    const body=activeTabSessionId?{resumeSessionId:activeTabSessionId}:{};
    const r=await fetch("/recording/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const d=await r.json();
    currentSessionId=d.sessionId;
    document.getElementById("mic-btn").innerHTML="⏹ Stop";
    document.getElementById("mic-btn").classList.add("active");
    const sp=document.getElementById("status-pill");sp.textContent="🔴 Live";sp.className="tb-pill recording";
    startTimer();startWaveform();
    document.getElementById("empty-en").textContent="Listening...";document.getElementById("empty-en").style.display="block";
    document.getElementById("empty-lang").textContent="Listening...";document.getElementById("empty-lang").style.display="block";
    document.getElementById("detected-badge").classList.remove("visible");
    renderParagraphs();
    recordLoop();
  }catch(e){const sp=document.getElementById("status-pill");sp.textContent="⚠ "+e.message;sp.className="tb-pill error";loopActive=false;}
}

async function stopRecording(){
  loopActive=false;clearTimeout(listeningTimeout);
  const endedSessionId=currentSessionId;
  activeTabSessionId=endedSessionId;
  await fetch("/recording/stop",{method:"POST"});
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  stopWaveform();stopTimer();
  document.getElementById("mic-btn").innerHTML="🎤 Start";
  document.getElementById("mic-btn").classList.remove("active");
  const sp=document.getElementById("status-pill");sp.textContent="Idle";sp.className="tb-pill";
  document.getElementById("empty-en").textContent="Waiting for speech...";document.getElementById("empty-en").style.display="block";
  document.getElementById("empty-lang").textContent="Waiting for speech...";document.getElementById("empty-lang").style.display="block";
  document.getElementById("detected-badge").classList.remove("visible");
  // Server auto-saves after 2s. Poll to refresh notes.
  setTimeout(async()=>{await loadSessions();await switchSession(endedSessionId);updateBadge();},3000);
}

function startWaveform(){audioCtx=new(AudioContext||webkitAudioContext)();analyser=audioCtx.createAnalyser();analyser.fftSize=512;audioCtx.createMediaStreamSource(stream).connect(analyser);const wrap=document.getElementById("waveform-wrap");const canvas=document.getElementById("waveform");wrap.classList.add("active");canvas.width=wrap.clientWidth*devicePixelRatio;canvas.height=wrap.clientHeight*devicePixelRatio;canvas.style.width=wrap.clientWidth+"px";canvas.style.height=wrap.clientHeight+"px";drawWaveform();}
function drawWaveform(){if(!analyser)return;waveAnimId=requestAnimationFrame(drawWaveform);const canvas=document.getElementById("waveform");const ctx=canvas.getContext("2d");const buf=analyser.frequencyBinCount;const data=new Uint8Array(buf);analyser.getByteTimeDomainData(data);ctx.clearRect(0,0,canvas.width,canvas.height);const grad=ctx.createLinearGradient(0,0,canvas.width,0);grad.addColorStop(0,"rgba(74,222,128,0.08)");grad.addColorStop(0.5,"rgba(74,222,128,0.6)");grad.addColorStop(1,"rgba(74,222,128,0.08)");ctx.lineWidth=1.8*devicePixelRatio;ctx.strokeStyle=grad;ctx.beginPath();const slice=canvas.width/buf;let x=0;for(let i=0;i<buf;i++){const y=(data[i]/128)*(canvas.height/2);i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);x+=slice;}ctx.lineTo(canvas.width,canvas.height/2);ctx.stroke();}
function stopWaveform(){if(waveAnimId){cancelAnimationFrame(waveAnimId);waveAnimId=null;}if(audioCtx){audioCtx.close();audioCtx=null;analyser=null;}document.getElementById("waveform-wrap").classList.remove("active");document.getElementById("waveform").getContext("2d").clearRect(0,0,document.getElementById("waveform").width,document.getElementById("waveform").height);}

const CHUNK_DURATION=2500;
function recordLoop(){
  if(!loopActive||!stream?.active)return;
  const chunks=[];
  let recorder;
  try{recorder=new MediaRecorder(stream,{mimeType:"audio/webm"});}catch{recorder=new MediaRecorder(stream);}
  recorder.ondataavailable=e=>{if(e.data?.size>0)chunks.push(e.data);};
  recorder.onstop=()=>{
    if(!loopActive)return;
    if(chunks.length>0){
      const blob=new Blob(chunks,{type:"audio/webm"});
      if(blob.size>800){
        const form=new FormData();form.append("audio",blob,"audio.webm");
        fetch("/audio-chunk",{method:"POST",body:form}).then(()=>{retryCount=0;}).catch(()=>{retryCount++;if(retryCount>=MAX_RETRIES){stopRecording();document.getElementById("status-pill").textContent="⚠ Lost";document.getElementById("status-pill").className="tb-pill error";}});
      }
    }
    if(loopActive)recordLoop();
  };
  recorder.onerror=()=>{if(loopActive)setTimeout(recordLoop,1500);};
  recorder.start();
  setTimeout(()=>{if(recorder.state==="recording")recorder.stop();},CHUNK_DURATION);
}
