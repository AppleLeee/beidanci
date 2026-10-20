'use strict';
const VERSION='v75',CACHE="xuehai-static-v75-203684746ebd",ASSETS=[{"path":"index.html","mime":"text/html","sha256":"203684746ebd0286d27dbf5552da04f9318c4af03ff4907ff7d300bcc1965e74"},{"path":"apple-touch-icon.png","mime":"image/png","sha256":"4eee9ff21b3652823fef3301ecbb6d1b3a65e00dc9ce77c59e560a9bbe88b7dc"},{"path":"apple-touch-icon-v58.png","mime":"image/png","sha256":"4eee9ff21b3652823fef3301ecbb6d1b3a65e00dc9ce77c59e560a9bbe88b7dc"},{"path":"favicon.png","mime":"image/png","sha256":"287a839d928e4ded531554c1d88655b2662d6c3928e0de1d75cd194167ed50bc"},{"path":"icon-192.png","mime":"image/png","sha256":"bb1fc2f654930a86978505ac2a2440057e249f02253e906d047c85095f7ac348"},{"path":"icon-512.png","mime":"image/png","sha256":"4cac0fa3d60d35218811a9465e601bc5f66ca0c9b889657ae47a493d53df8a00"},{"path":"manifest.webmanifest","mime":"application/manifest+json","sha256":"99ba7b67baad545d40d5f5706eb229424f1e10d2737e7dc0f31c795224db9188"}];
const base=new URL('./',self.location.href),canonical=path=>new URL(path,base).href;
const allowed=new Map(ASSETS.map(asset=>[new URL(asset.path,base).pathname,asset]));
const repairPaths=new Set(['repair','repair.html'].map(p=>new URL(p,base).pathname));
async function tell(value){for(const client of await self.clients.matchAll({includeUncontrolled:true,type:'window'}))client.postMessage(value);}
// Fetch follows redirects, and Cache API retains the response URL list. Safari rejects
// that response on navigation. Rebuild decoded bytes with no redirect metadata.
async function plain(response){
  if(response.type==='opaque'||response.type==='opaqueredirect'||response.status===0)throw Error('Unreadable response');
  if(response.url&&new URL(response.url).origin!==base.origin)throw Error('Cross-origin app response');
  const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.delete('Content-Length');
  const body=[204,205,304].includes(response.status)?null:await response.arrayBuffer();
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}
async function checked(asset){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{
    // Cloudflare Pages canonicalizes index.html to ./; request ./ directly.
    const response=await fetch(asset.path==='index.html'?base.href:canonical(asset.path),{cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error('Missing '+asset.path);
    if(!(response.headers.get('Content-Type')||'').toLowerCase().includes(asset.mime))throw Error('Wrong content type '+asset.path);
    const bytes=await response.clone().arrayBuffer();
    const sum=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if(sum!==asset.sha256)throw Error('Incomplete release '+asset.path);
    return await plain(response);
  }finally{clearTimeout(timer);}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try{
    let done=0;
    const settled=await Promise.allSettled(ASSETS.map(async asset=>{const response=await checked(asset);await tell({type:'CACHE_PROGRESS',done:++done,total:ASSETS.length});return {asset,response};}));
    const rejected=settled.find(item=>item.status==='rejected');if(rejected)throw rejected.reason;
    const cache=await caches.open(CACHE);
    await Promise.all(settled.map(({value:{asset,response}})=>cache.put(canonical(asset.path),response)));
    // Normal updates wait for open practice pages to close. Never auto-reload them.
  }catch(error){await tell({type:'CACHE_FAILED'});throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('xuehai-static-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
function unavailable(root){return new Response(root?'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>暂时无法打开</title><p>程序尚未完整准备离线使用，请联网后重新打开。学习记录不会自动清空。</p><button onclick="location.reload()">重试</button><p><a href="./repair">修复程序</a></p>':'Offline file unavailable',{status:503,headers:{'Content-Type':root?'text/html; charset=utf-8':'text/plain; charset=utf-8'}});}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==base.origin)return;
  const root=url.pathname===base.pathname||url.pathname===new URL('index.html',base).pathname,asset=allowed.get(url.pathname);
  if(!root&&!asset)return; // repair and user backup URLs always bypass the app cache.
  event.respondWith((async()=>{
    try{
      const cache=await caches.open(CACHE),saved=await cache.match(canonical(root?'index.html':asset.path));
      if(saved)return saved.redirected?await plain(saved):saved;
    }catch(_){/* An unavailable/evicted static cache must not prevent an online launch. */}
    try{return await plain(await fetch(root?new Request(base.href,{cache:'no-store'}):event.request));}
    catch(_){return unavailable(root);}
  })());
});
self.addEventListener('message',event=>{
  const type=event.data?.type,port=event.ports?.[0];if(!port)return;
  if(type==='OFFLINE_STATUS')event.waitUntil((async()=>{
    try{const cache=await caches.open(CACHE),found=await Promise.all(ASSETS.map(asset=>cache.match(canonical(asset.path))));port.postMessage({version:VERSION,ready:found.every(r=>r&&r.ok&&!r.redirected)});}
    catch(_){port.postMessage({version:VERSION,ready:false});}
  })());
  if(type==='REPAIR_ACTIVATE')event.waitUntil((async()=>{
    // Explicit recovery is accepted only from the standalone repair document,
    // and never while another app window might contain a running practice.
    try{
      const source=event.source&&await self.clients.get(event.source.id);
      if(!source||new URL(source.url).origin!==base.origin||!repairPaths.has(new URL(source.url).pathname)){port.postMessage({ok:false,reason:'invalid-source'});return;}
      const others=(await self.clients.matchAll({includeUncontrolled:true,type:'window'})).filter(c=>c.id!==source.id&&new URL(c.url).origin===base.origin&&new URL(c.url).pathname.startsWith(base.pathname)&&!repairPaths.has(new URL(c.url).pathname));
      if(others.length){port.postMessage({ok:false,reason:'close-other-pages'});return;}
      await self.skipWaiting();port.postMessage({ok:true});
    }catch(_){port.postMessage({ok:false,reason:'retry'});}
  })());
});
