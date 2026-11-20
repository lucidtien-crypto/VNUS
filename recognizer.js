// Worker: all inference is performed on the device using the multilingual model.
// The first online installation fetches the Transformers.js runtime, ONNX WASM and model files.
const LIB_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const MODEL_ID = 'Xenova/whisper-tiny';
let engine = null;
let loading = null;
let transformers = null;

async function getLib(){
  if (!transformers) transformers = await import(LIB_URL);
  transformers.env.useBrowserCache = true;
  transformers.env.useWasmCache = true;
  // Keep CPU demands moderate for mobile browsers.
  transformers.env.backends.onnx.wasm.numThreads = 1;
  return transformers;
}
async function loadEngine({force = false, offlineOnly = false} = {}){
  if (engine && !force) return engine;
  if (loading) return loading;
  loading = (async () => {
    const {pipeline, env} = await getLib();
    env.allowRemoteModels = !offlineOnly;
    postMessage({type:'status',text:offlineOnly?'Kiểm tra mô hình đã lưu…':'Đang chuẩn bị mô hình…'});
    const pipe = await pipeline('automatic-speech-recognition', MODEL_ID, {
      device:'wasm', dtype:'q8',
      progress_callback: x => {
        if (x.status === 'progress') postMessage({type:'progress',file:x.file,percent:x.progress??0});
        else if (x.status === 'initiate'||x.status === 'download') postMessage({type:'status',text:'Đang tải tài nguyên…'});
      }
    });
    engine = pipe;
    postMessage({type:'ready'});
    return pipe;
  })();
  try {return await loading;} finally {loading = null;}
}
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'load') {
      await loadEngine({offlineOnly:!!data.offlineOnly});
    } else if (data.type === 'verify') {
      if(engine){postMessage({type:'verified'});return;}
      await loadEngine({offlineOnly:true});
      postMessage({type:'verified'});
    } else if (data.type === 'transcribe') {
      const model = await loadEngine({offlineOnly:!!data.offlineOnly});
      const output = await model(data.audio, {
        language: data.language === 'vi' ? 'vietnamese' : 'english',
        task:'transcribe', return_timestamps:false
      });
      postMessage({type:'transcript',id:data.id,text:output.text||''});
    }
  } catch(e){postMessage({type:'error',id:data.id??null,step:data.type,message:String(e?.message||e)});}
};
