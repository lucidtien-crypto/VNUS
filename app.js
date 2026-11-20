'use strict';
const $=id=>document.getElementById(id);
const editor=$('editor'),record=$('record'),state=$('state'),dot=$('dot');
const MODEL_VERSION='whisper-tiny-multilingual-q8-v1';
const APP_VERSION='1.0.0';
const STORAGE_KEY='voicenote_vius_text_v1';
let language=localStorage.getItem('voicenote_lang')==='en'?'en':'vi';
let recording=false,busy=false,initializing=false,audioContext=null,sourceNode=null,processor=null,stream=null;
let audioBuffers=[],audioLength=0,chunkId=0,inFlight=0,chunkQueue=[],history=[],lastSelection=0,engineReady=false, worker=null,downloadPending=false;
let lastAudioLang='vi', chunkDuration=12,flushTimer=0,toaster=0;
let readUtterance=null;
const setStatus=(txt,kind='')=>{state.textContent=txt;dot.className='dot '+(kind||'');};
const notice=(txt)=>{$('notice').textContent=txt;$('notice').classList.toggle('visible',!!txt);};
const toast=(txt)=>{clearTimeout(toaster);$('toast').textContent=txt;$('toast').classList.add('show');toaster=setTimeout(()=>$('toast').classList.remove('show'),2500);};
const save=()=>{try{localStorage.setItem(STORAGE_KEY,editor.value)}catch{}; updateCounts()};
const updateCounts=()=>{const s=editor.value.trim();$('counts').textContent=`${s?s.split(/\s+/u).length:0} từ · ${editor.value.length} ký tự`;};
const snapshot=()=>{history.push(editor.value);if(history.length>30)history.shift();$('undo').disabled=false;};
const setText=(txt)=>{editor.value=txt;save();lastSelection=editor.selectionStart;};
function insertPunctuation(char){
  snapshot();const s=editor.selectionStart,e=editor.selectionEnd;
  const before=editor.value.slice(0,s).replace(/[ \t]+$/u,'');const after=editor.value.slice(e).replace(/^[ \t]+/u,'');
  setText(before+char+' '+after);const p=before.length+2;editor.focus();editor.setSelectionRange(p,p);
}
$('period').onclick=()=>insertPunctuation('.');$('comma').onclick=()=>insertPunctuation(',');
$('delWord').onclick=()=>{let text=editor.value;if(!text.trim())return;snapshot();text=text.replace(/[\s\p{P}]*[^\s\p{P}]+[\s\p{P}]*$/u,'').trimEnd();setText(text);toast('Đã xóa 1 từ cuối');};
$('clear').onclick=()=>{if(!editor.value)return;if(!confirm('Xóa tất cả văn bản? Bạn có thể bấm Phục hồi.'))return;snapshot();setText('');toast('Đã xóa. Có thể phục hồi.');};
$('undo').onclick=()=>{if(!history.length)return;setText(history.pop());$('undo').disabled=!history.length;toast('Đã phục hồi');};
$('copy').onclick=async()=>{if(!editor.value.trim()){toast('Không có văn bản để sao chép');return;}try{await navigator.clipboard.writeText(editor.value)}catch{editor.select();const ok=document.execCommand('copy');if(!ok){toast('Không sao chép được');return;}}toast('Đã sao chép văn bản');};
$('theme').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('voicenote_theme',document.body.classList.contains('dark')?'dark':'light');};
if(localStorage.getItem('voicenote_theme')==='dark')document.body.classList.add('dark');
editor.value=localStorage.getItem(STORAGE_KEY)||'';updateCounts();$('undo').disabled=true;
editor.addEventListener('input',()=>{save()});
function selectLanguage(l){
 language=l;localStorage.setItem('voicenote_lang',l);
 $('vi').setAttribute('aria-pressed',String(l==='vi'));$('en').setAttribute('aria-pressed',String(l==='en'));
 editor.placeholder=l==='vi'?'Văn bản sẽ xuất hiện ở đây…':'Recognized text appears here…';
 if(recording)toast('Ngôn ngữ mới áp dụng từ đoạn ghi tiếp theo');
}
$('vi').onclick=()=>selectLanguage('vi');$('en').onclick=()=>selectLanguage('en');selectLanguage(language);
$('speak').onclick=()=>{
 if(!('speechSynthesis' in window)){toast('Trình duyệt không hỗ trợ đọc văn bản');return;}
 if(speechSynthesis.speaking||speechSynthesis.pending){speechSynthesis.cancel();$('speak').textContent='🔊';return;}
 const text=editor.value.trim();if(!text){toast('Chưa có văn bản');return;}
 readUtterance=new SpeechSynthesisUtterance(text);readUtterance.lang=language==='vi'?'vi-VN':'en-US';readUtterance.rate=.95;
 readUtterance.onend=readUtterance.onerror=()=>{$('speak').textContent='🔊';};
 $('speak').textContent='■';speechSynthesis.speak(readUtterance);
};
// PWA shell assets cached by the service worker, which also caches loaded cross-origin libraries and WASM.
if('serviceWorker' in navigator && location.protocol!=='file:'){
 navigator.serviceWorker.register('./sw.js').then(()=>{
   if(!navigator.serviceWorker.controller){
     notice('Ứng dụng đã đăng ký lưu offline. Hãy tải lại trang một lần trước khi tải mô hình.');
   }
 }).catch(e=>notice('Không thể đăng ký chế độ offline: '+e.message));
}
if(location.protocol==='file:')notice('Để sử dụng micro và chế độ offline, hãy đưa bộ web lên HTTPS rồi thêm vào màn hình chính. Mở trực tiếp file HTML chưa đủ.');
if(!window.isSecureContext)notice('Micro cần HTTPS (hoặc localhost).');
function getWorker(){
 if(!worker){
  worker=new Worker('./recognizer.js',{type:'module'});
  worker.onmessage=onWorkerMessage;
  worker.onerror=e=>{setStatus('Lỗi mô hình','warn');notice('Không tải được thư viện nhận dạng. Lần đầu cần Internet, sau đó cần tài nguyên được lưu đầy đủ.');busy=false;initButtons();};
 }
 return worker;
}
function initButtons(){
 $('download').disabled=busy||initializing;
 $('check').disabled=busy||initializing;
 $('update').disabled=busy||initializing;
 record.disabled=initializing||(!engineReady&&!recording);
}
function uiModel(ok){$('modelTag').textContent=ok?'Đã nạp · dùng offline':'Chưa sẵn sàng';$('modelTag').style.color=ok?'#047857':'';}
function onWorkerMessage({data}){
 switch(data.type){
 case 'status': setStatus(data.text,'warn');break;
 case 'progress': $('progressrow').classList.add('visible');$('progress').value=Number(data.percent)||0;$('percent').textContent=Math.round(Number(data.percent)||0)+'%';break;
 case 'ready':
  engineReady=true;initializing=false;busy=false;downloadPending=false;uiModel(true);setStatus('Sẵn sàng');$('progressrow').classList.remove('visible');
  try{localStorage.setItem('voicenote_model_version',MODEL_VERSION)}catch{}
  initButtons();toast('Đã nạp mô hình nhận dạng');pump();break;
 case 'verified':engineReady=true;initializing=false;busy=false;uiModel(true);setStatus('Sẵn sàng');initButtons();toast('Mô hình đã lưu có thể nạp');break;
 case 'transcript':
  inFlight=0;appendRecognized(data.text||'');pump();break;
 case 'error':
  if(data.step==='transcribe'){inFlight=0;notice('Đoạn âm thanh xử lý lỗi: '+data.message);pump();}
  else {engineReady=false;initializing=false;busy=false;uiModel(false);setStatus('Chưa sẵn sàng','warn');initButtons();
   notice('Không xác minh được mô hình offline: '+data.message+'. Hãy kết nối mạng và bấm “Tải bộ nhận dạng”.');}
  break;
 }
}
function appendRecognized(raw){
 let text=raw.trim();if(!text)return;
 // Avoid known no-speech marker; never alter meaning or silently translate.
 if(/^\[?(?:music|applause|silence)\]?$/i.test(text))return;
 snapshot();let v=editor.value;
 if(v && !/[\s\n]$/u.test(v))v+=' ';
 setText(v+text);editor.scrollTop=editor.scrollHeight;
}
async function ensureModel(verifyOnly=false){
 if(initializing||busy)return;
 if(!navigator.onLine&&!verifyOnly&&!engineReady){toast('Lần đầu tải cần có mạng');return;}
 if('serviceWorker' in navigator&&!navigator.serviceWorker.controller){
  notice('Lần đầu mở trang: hãy tải lại trang một lần để hoàn tất cài đặt offline, rồi mới tải mô hình.');
  if(!verifyOnly)return;
 }
 initializing=true;busy=true;downloadPending=!verifyOnly;initButtons();notice('');
 setStatus(verifyOnly?'Kiểm tra dữ liệu offline…':'Đang tải mô hình…','warn');
 $('progressrow').classList.toggle('visible',!verifyOnly);
 getWorker().postMessage({type:verifyOnly?'verify':'load',offlineOnly:verifyOnly});
}
$('download').onclick=()=>ensureModel(false);
$('check').onclick=()=>ensureModel(true);
$('update').onclick=async()=>{
 if(!navigator.onLine){toast('Cần Internet để kiểm tra cập nhật');return;}
 try{
  const response=await fetch('./model-release.json?check='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('Không thể lấy thông tin cập nhật');
  const release=await response.json();
  const differentApp=release.appVersion!==APP_VERSION;
  const differentModel=release.modelVersion!==MODEL_VERSION;
  if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();}
  if(differentApp||differentModel){
    notice('Đã có bản cập nhật trên website. Hãy mở lại trang để nhận ứng dụng mới; nếu đổi mô hình, ứng dụng sẽ tải dữ liệu mới khi bạn bấm Tải bộ nhận dạng.');
    if(confirm('Đã có bản mới. Tải lại trang ngay?'))location.reload();
  }else{
    toast('Đang sử dụng bản được phát hành mới nhất tại website này');
  }
 }catch(e){notice('Lỗi kiểm tra cập nhật: '+e.message);}
};
// AudioCapture: raw PCM via ScriptProcessor, which avoids unreliable independent MediaRecorder codec chunks.
// Small processing segments reduce phone memory usage and are queued strictly in order.
function resample(samples,sourceRate,targetRate=16000){
 if(sourceRate===targetRate)return samples;
 const length=Math.round(samples.length*targetRate/sourceRate),out=new Float32Array(length);
 for(let i=0;i<length;i++){const p=i*sourceRate/targetRate,j=Math.floor(p),f=p-j;out[i]=samples[j]*(1-f)+(samples[Math.min(j+1,samples.length-1)]||0)*f;}
 return out;
}
function flushAudio(){
 if(audioLength<4000)return;
 const buf=new Float32Array(audioLength);let p=0;for(const x of audioBuffers){buf.set(x,p);p+=x.length;}
 const rate=audioContext?.sampleRate||48000;
 audioBuffers=[];audioLength=0;
 chunkQueue.push({id:++chunkId,lang:lastAudioLang,audio:resample(buf,rate)});
 pump();
}
function pump(){
 if(!engineReady||inFlight||!chunkQueue.length)return;
 const job=chunkQueue.shift();inFlight=job.id;setStatus('Đang chuyển thành chữ…','warn');
 getWorker().postMessage({type:'transcribe',id:job.id,audio:job.audio,language:job.lang,offlineOnly:true},[job.audio.buffer]);
}
function audioCallback(e){
 if(!recording)return;
 const channel=e.inputBuffer.getChannelData(0);
 audioBuffers.push(new Float32Array(channel));audioLength+=channel.length;
 if(audioLength>=audioContext.sampleRate*chunkDuration){lastAudioLang=language;flushAudio();}
}
async function startRecording(){
 if(recording||initializing||!engineReady){toast('Hãy tải và kiểm tra mô hình trước');return;}
 if(!navigator.mediaDevices?.getUserMedia){notice('Trình duyệt cần HTTPS và quyền micro.');return;}
 try{
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
  audioContext=new (window.AudioContext||window.webkitAudioContext)();await audioContext.resume();
  sourceNode=audioContext.createMediaStreamSource(stream);
  processor=audioContext.createScriptProcessor(4096,1,1);
  const zero=audioContext.createGain();zero.gain.value=0;
  sourceNode.connect(processor);processor.connect(zero);zero.connect(audioContext.destination);
  processor.onaudioprocess=audioCallback;
  audioBuffers=[];audioLength=0;lastAudioLang=language;recording=true;
  record.classList.add('stop');$('recText').textContent='Dừng nói';$('recIcon').textContent='■';editor.classList.add('recording');setStatus('Đang nghe…','busy');
  // Periodic chunk capture avoids waiting indefinitely on silence.
  flushTimer=setInterval(()=>{if(recording&&audioLength>=audioContext.sampleRate*6){lastAudioLang=language;flushAudio();}},9000);
 }catch(e){stopRecording();notice('Không mở được micro: '+e.message);setStatus('Lỗi micro','warn');}
}
function stopRecording(){
 if(!recording&&!stream)return;
 recording=false;clearInterval(flushTimer);
 if(audioLength){flushAudio();}
 if(processor){processor.onaudioprocess=null;processor.disconnect();processor=null;}
 if(sourceNode){sourceNode.disconnect();sourceNode=null;}
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
 if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}
 record.classList.remove('stop');$('recText').textContent='Bắt đầu nói';$('recIcon').textContent='🎙';editor.classList.remove('recording');
 setStatus(inFlight||chunkQueue.length?'Đang xử lý…':'Sẵn sàng',inFlight?'warn':'');
}
record.onclick=()=>recording?stopRecording():startRecording();
window.addEventListener('pagehide',()=>{if(recording)stopRecording()});
window.addEventListener('online',()=>{if(!engineReady)setStatus('Có mạng · chưa tải','warn');});
window.addEventListener('offline',()=>{setStatus(engineReady?'Offline · sẵn sàng':'Offline · cần mô hình',engineReady?'':'warn');});
// Check the real model by constructing it from the browser cache; a localStorage flag alone is NOT proof.
initButtons();record.disabled=true;
if(localStorage.getItem('voicenote_model_version')===MODEL_VERSION){
 $('modelTag').textContent='Đã tải trước đó · cần kiểm tra';setStatus('Đang kiểm tra…','warn');
 // Load offline-only to ensure resources are really available; failed validation stays visible.
 ensureModel(true);
}else{setStatus('Chưa tải mô hình','warn');}
