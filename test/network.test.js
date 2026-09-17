import test from 'node:test';import a from 'node:assert/strict';import {EventEmitter} from 'node:events';import {publicAddress,resolveSafe,HttpClient} from '../src/core/network.js';import {fixture} from './helpers.js';
test('private, loopback, link-local and mapped IPs are blocked',()=>{for(const ip of ['127.0.0.1','10.1.2.3','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fe80::1'])a.equal(publicAddress(ip),false,ip);a.equal(publicAddress('8.8.8.8'),true);});
test('credential-bearing, non-HTTPS and disallowed remote hosts are blocked',async()=>{for(const url of ['http://public.example/a','https://user:password@public.example/a','https://public.example:444/a','https://other.example/a'])await a.rejects(resolveSafe(url,['public.example'],async()=>[{address:'8.8.8.8',family:4}]),/UNSAFE|NOT_ALLOWED/);});
test('DNS response with any private address is rejected',async()=>{await a.rejects(resolveSafe('https://public.example/a',['public.example'],async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]),/PRIVATE_NETWORK/);});
function transport(status,headers,parts){return(url,opts,callback)=>{const req=new EventEmitter();req.write=()=>{};req.end=()=>{const res=new EventEmitter();res.statusCode=status;res.headers=headers;res.resume=()=>{};res.destroy=()=>{};callback(res);setImmediate(()=>{for(const p of parts)res.emit('data',Buffer.from(p));res.emit('end');});};req.destroy=()=>{};return req;};}
const options={allowedHosts:['public.example'],retries:0,timeout:1000};
test('redirects cannot escape the checked host',async()=>{const h=new HttpClient({lookup:async()=>[{address:'8.8.8.8',family:4}],transport:transport(302,{location:'http://127.0.0.1'},[])});await a.rejects(h.request('https://public.example/a',options),/REDIRECT_BLOCKED/);});
test('streamed body size is bounded even without content-length',async()=>{const h=new HttpClient({lookup:async()=>[{address:'8.8.8.8',family:4}],transport:transport(200,{},['abc','def'])});await a.rejects(h.request('https://public.example/a',{...options,limit:4}),/TOO_LARGE/);});
test('response compression cannot bypass size accounting',async()=>{const h=new HttpClient({lookup:async()=>[{address:'8.8.8.8',family:4}],transport:transport(200,{'content-encoding':'gzip'},['x'])});await a.rejects(h.request('https://public.example/a',options),/ENCODING_BLOCKED/);});
test('network concurrency has a hard upper bound',async()=>{const h=new HttpClient({maxConcurrent:0});await a.rejects(h.request('https://public.example/a',options),/REMOTE_BUSY/);});
test('a redirect can be inspected only for an explicitly allowed HTTPS OAuth host',async()=>{const h=new HttpClient({lookup:async()=>[{address:'8.8.8.8',family:4}],transport:transport(302,{location:'https://trakt.tv/oauth/authorize?client_id='+('a'.repeat(64))},[])});const r=await h.request('https://public.example/a',{...options,captureRedirectHosts:['trakt.tv']});a.equal(r.status,302);a.match(r.headers.location,/^https:\/\/trakt\.tv\//);});
test('redirect inspection still rejects HTTP and unlisted targets',async()=>{for(const location of ['http://trakt.tv/oauth/authorize','https://evil.example/oauth/authorize']){const h=new HttpClient({lookup:async()=>[{address:'8.8.8.8',family:4}],transport:transport(302,{location},[])});await a.rejects(h.request('https://public.example/a',{...options,captureRedirectHosts:['trakt.tv']}),/UNSAFE_REDIRECT/);}});

test('transient upstream 529 is retryable when the caller permits retries',async()=>{
 let calls=0;const dynamic=(url,opts,callback)=>transport(++calls===1?529:200,{},calls===1?[]:['ok'])(url,opts,callback);
 const h=new HttpClient({lookup:async()=>[{address:'8.8.8.8',family:4}],transport:dynamic});
 const r=await h.request('https://public.example/a',{...options,retries:1});
 a.equal(r.status,200);a.equal(calls,2);
});
test('Stremio retries idempotent account reads but never datastore writes',async t=>{
 const {StremioAdapter}=await import('../src/adapters/stremio.js');const f=fixture(t);f.store.setSecret('main','stremioAuth','synthetic-auth');const seen=[];
 const http={json:async(_url,o)=>{seen.push(o.retries);return {data:{result:true}};}};const s=new StremioAdapter(f.profile,f.store,http);
 await s.call('getUser');await s.call('datastoreGet');await s.call('datastorePut');
 a.deepEqual(seen,[2,2,0]);
});

test('Retry-After is honoured for retryable GETs and never causes a POST retry',async()=>{let calls=0,sleepless=new HttpClient({lookup:async()=>[{address:'93.184.216.34',family:4}],transport:(url,opts,cb)=>{calls++;const req=new EventEmitter();req.write=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=calls===1?429:200;res.headers=calls===1?{'retry-after':'0'}:{'content-length':'2'};res.resume=()=>{};cb(res);if(calls>1)queueMicrotask(()=>{res.emit('data',Buffer.from('{}'));res.emit('end')});});req.destroy=()=>{};return req;}});const r=await sleepless.json('https://example.com/x',{allowedHosts:['example.com'],retries:1,timeout:1000});a.deepEqual(r.data,{});a.equal(calls,2);calls=0;await a.rejects(sleepless.json('https://example.com/x',{allowedHosts:['example.com'],method:'POST',body:{x:1},retries:0,timeout:1000}),/UPSTREAM_429/);a.equal(calls,1);});
