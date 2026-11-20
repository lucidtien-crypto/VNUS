// This caches the offline user interface and runtime resources loaded by the app.
const SHELL='voicenote-shell-v1';
const RUNTIME='voicenote-runtime-v1';
const FILES=['./','./index.html','./app.js','./recognizer.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./model-release.json'];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(SHELL);await c.addAll(FILES);await self.skipWaiting();})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('voicenote-')&&![SHELL,RUNTIME].includes(k))await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;
 const url=new URL(req.url),same=url.origin===self.location.origin;
 if(same){
  if(req.mode==='navigate')e.respondWith((async()=>{try{return await fetch(req);}catch{return await (await caches.open(SHELL)).match('./index.html')||Response.error();}})());
  else e.respondWith((async()=>{const cache=await caches.open(SHELL);return await cache.match(req)||fetch(req);})());
  return;
 }
 // Cache cross-origin runtime JS/WASM (not model blobs, which Transformers.js caches itself).
 if((url.hostname==='cdn.jsdelivr.net'||url.hostname==='cdn.jsdelivr.net') && /\.(?:mjs|wasm|js)(?:$|\?)/.test(url.pathname+url.search)){
  e.respondWith((async()=>{
   const c=await caches.open(RUNTIME),hit=await c.match(req);
   if(hit)return hit;
   const res=await fetch(req);
   if(res.ok||res.type==='opaque'){try{await c.put(req,res.clone())}catch{}}
   return res;
  })());
 }
});
