'use strict';
const VERSION='v61',CACHE="xuehai-static-v61-0cad72700fae",ASSETS=[{"path":"index.html","mime":"text/html","sha256":"0cad72700faed3bf53836a0784b012244712f22db36930bebaa729ade97bb4c1"},{"path":"apple-touch-icon.png","mime":"image/png","sha256":"4eee9ff21b3652823fef3301ecbb6d1b3a65e00dc9ce77c59e560a9bbe88b7dc"},{"path":"apple-touch-icon-v58.png","mime":"image/png","sha256":"4eee9ff21b3652823fef3301ecbb6d1b3a65e00dc9ce77c59e560a9bbe88b7dc"},{"path":"favicon.png","mime":"image/png","sha256":"287a839d928e4ded531554c1d88655b2662d6c3928e0de1d75cd194167ed50bc"},{"path":"icon-192.png","mime":"image/png","sha256":"bb1fc2f654930a86978505ac2a2440057e249f02253e906d047c85095f7ac348"},{"path":"icon-512.png","mime":"image/png","sha256":"4cac0fa3d60d35218811a9465e601bc5f66ca0c9b889657ae47a493d53df8a00"},{"path":"manifest.webmanifest","mime":"application/manifest+json","sha256":"99ba7b67baad545d40d5f5706eb229424f1e10d2737e7dc0f31c795224db9188"}];
const base=new URL('./',self.location.href),canonical=path=>new URL(path,base).href;
const allowed=new Map(ASSETS.map(asset=>[new URL(asset.path,base).pathname,asset]));
async function tell(value){const clients=await self.clients.matchAll({includeUncontrolled:true,type:'window'});for(const client of clients)client.postMessage(value);}
async function checked(asset){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
  const response=await fetch(canonical(asset.path),{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw Error('Missing '+asset.path);
  const mime=response.headers.get('Content-Type')||'';
  if(!mime.toLowerCase().includes(asset.mime))throw Error('Wrong content type '+asset.path);
  const bytes=await response.clone().arrayBuffer();
  const sum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(sum!==asset.sha256)throw Error('Incomplete release '+asset.path);
  return response;
  }finally{clearTimeout(timer);}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try{
    let done=0;
    // Settle every download before reporting failure so late progress cannot mask the error.
    const settled=await Promise.allSettled(ASSETS.map(async asset=>{const response=await checked(asset);await tell({type:'CACHE_PROGRESS',done:++done,total:ASSETS.length});return {asset,response};}));
    const rejected=settled.find(item=>item.status==='rejected');if(rejected)throw rejected.reason;
    const responses=settled.map(item=>item.value);
    const cache=await caches.open(CACHE);
    await Promise.all(responses.map(({asset,response})=>cache.put(canonical(asset.path),response)));
    // No forced activation and no automatic page reload during a practice.
  }catch(error){await tell({type:'CACHE_FAILED'});throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('xuehai-static-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==base.origin)return;
  const root=url.pathname===base.pathname||url.pathname===new URL('index.html',base).pathname;
  const asset=allowed.get(url.pathname);
  if(!root&&!asset)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),key=canonical(root?'index.html':asset.path),saved=await cache.match(key);
    if(saved)return saved;
    // Only read the fixed public app files. Never store arbitrary responses or learning data.
    try{return await fetch(event.request);}catch(_){return new Response(root?'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>暂时无法打开</title><p>程序尚未完整准备离线使用，请联网后重新打开。学习记录不会自动清空。</p><button onclick="location.reload()">重试</button>':'Offline file unavailable',{status:503,headers:{'Content-Type':root?'text/html; charset=utf-8':'text/plain; charset=utf-8'}});}
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type!=='OFFLINE_STATUS'||!event.ports?.[0])return;
  event.waitUntil((async()=>{const cache=await caches.open(CACHE);const found=await Promise.all(ASSETS.map(asset=>cache.match(canonical(asset.path))));event.ports[0].postMessage({version:VERSION,ready:found.every(Boolean)});})());
});
