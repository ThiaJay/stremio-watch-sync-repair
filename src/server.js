import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Runtime} from './runtime.js';
import {ROOT} from './config.js';
import {acquireLock} from './core/store.js';
import {assert,GuardError,secureEqual,safeError,rejectPoison} from './core/util.js';
function json(res,status,value){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,maxBytes=128000){assert((req.headers['content-type']??'').split(';')[0]==='application/json','JSON_REQUIRED',415);let bytes=0;const chunks=[];for await(const c of req){bytes+=c.length;assert(bytes<=maxBytes,'BODY_TOO_LARGE',413);chunks.push(c);}let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new GuardError('INVALID_JSON');}rejectPoison(data);return data;}
export function createServer(rt,{lock=true}={}){const release=lock?acquireLock(path.join(rt.store.dir,'service.lock')):()=>{};const rates=new Map();let active=0;
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{active++;res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('x-frame-options','DENY');res.setHeader('permissions-policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');res.setHeader('cross-origin-opener-policy','same-origin');res.setHeader('cross-origin-resource-policy','same-origin');res.setHeader('x-permitted-cross-domain-policies','none');res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try{assert(active<=32,'SERVICE_BUSY',503);assert(typeof req.url==='string'&&req.url.length<=4096,'REQUEST_TARGET_TOO_LONG',414);assert(req.url.startsWith('/')&&!req.url.startsWith('//'),'INVALID_REQUEST');const hosts=[`127.0.0.1:${rt.config.server.port}`,`localhost:${rt.config.server.port}`,`[::1]:${rt.config.server.port}`];assert(hosts.includes(req.headers.host),'UNEXPECTED_HOST',403);const url=new URL(req.url,`http://${req.headers.host}`);const pathname=url.pathname;assert(!url.search||!pathname.startsWith('/admin/'),'QUERY_PARAMETERS_NOT_ALLOWED');
   if(pathname==='/healthz'&&req.method==='GET')return json(res,200,{service:'stremio-watch-sync-repair',version:'1.0.1',alive:true});
   if(pathname.startsWith('/admin/')){const ip=req.socket.remoteAddress??'';assert(['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip),'MANAGEMENT_LOOPBACK_ONLY',403);const origin=req.headers.origin;if(origin)assert(origin===`http://${req.headers.host}`,'CROSS_ORIGIN_ADMIN_BLOCKED',403);const token=(req.headers.authorization??'').replace(/^Bearer /,'');const k=ip,rate=rates.get(k)??{n:0,until:Date.now()+60000};if(rate.until<Date.now()){rate.n=0;rate.until=Date.now()+60000;}assert(rate.n<30,'AUTH_RATE_LIMIT',429);if(!secureEqual(token,rt.store.secret('_system','adminToken'))){rate.n++;rates.set(k,rate);throw new GuardError('AUTH_REQUIRED',401);}rates.delete(k);
    if(req.method==='GET'&&pathname==='/admin/status')return json(res,200,rt.status());
    if(req.method==='GET'&&pathname==='/admin/config')return json(res,200,{config:rt.configStore.get(),revision:rt.configStore.revision});
    if(req.method==='POST'&&pathname==='/admin/config'){const b=await body(req);return json(res,200,rt.setConfig(b.config,b.revision));}
    if(req.method==='POST'&&pathname==='/admin/shutdown'){await body(req);assert(rt.lock.keys.size===0,'OPERATION_IN_PROGRESS',409);json(res,200,{stopping:true});rt.close();setTimeout(()=>{server.close();server.closeIdleConnections();},100);return;}
    const match=pathname.match(/^\/admin\/profiles\/([a-z][a-z0-9_-]{0,39})\/(.+)$/);assert(match,'ADMIN_ROUTE_NOT_FOUND',404);const [,pid,action]=match;rt.profile(pid);const e=rt.environment(pid);
    if(req.method==='GET'&&action==='connections')return json(res,200,rt.connections(pid));
    if(req.method==='GET'&&action==='audit')return json(res,200,rt.store.read(pid,'audit',[]).slice(-100));
    if(req.method==='GET'&&action==='backups')return json(res,200,rt.store.read(pid,'backup-index',[]));
    if(req.method==='GET'&&action==='plans'){const ps=rt.store.read(pid,'plan-index',[]).slice(-20).map(x=>rt.store.read(pid,x.id)).filter(Boolean).map(x=>rt.summary(x));return json(res,200,ps);}
    assert(req.method==='POST','METHOD_NOT_ALLOWED',405);const b=await body(req,action==='history/import/plan'?12_000_000:128000);
    if(action==='secret')return json(res,200,rt.saveSecret(pid,b.name,b.value));
    if(action==='pair/stremio/start')return json(res,200,await rt.job(pid,'connection',x=>x.pairing.begin()));
    if(action==='pair/stremio/poll')return json(res,200,await rt.job(pid,'connection',x=>x.pairing.poll()));
    if(action==='pair/trakt/start')return json(res,200,await rt.job(pid,'connection',x=>x.trakt.beginNative()));
    if(action==='pair/trakt/poll')return json(res,200,await rt.job(pid,'connection',x=>x.trakt.pollNative()));
    if(action==='watched/refresh')return json(res,200,await rt.refresh(pid));
    if(action==='repair/plan'){assert(Array.isArray(b.ids??[])&&(b.ids??[]).length<=100,'INVALID_ID_LIST');return json(res,200,await rt.plan(pid,'repair',b.ids??[]));}
    if(action==='sync/plan')return json(res,200,await rt.plan(pid,'sync'));
    if(action==='history/export')return json(res,200,await rt.historyExport(pid));
    if(action==='history/import/plan'){assert(['json','csv'].includes(b.format)&&typeof b.text==='string','INVALID_HISTORY_IMPORT');return json(res,200,await rt.historyImportPlan(pid,b.text,b.format));}
    if(action==='plan/apply')return json(res,200,await rt.apply(pid,b.id,b.digest,{ackRemovals:b.ackRemovals===true,ackEstimatedDates:b.ackEstimatedDates===true}));
    if(action==='recovery/plan')return json(res,200,await rt.recoveryPlan(pid,b.backupId));
    if(action==='hold/release'){assert(b.confirm==='REVIEWED BACKUP AND LIVE STATE','HOLD_REVIEW_CONFIRMATION_REQUIRED');await rt.acknowledgeHold(pid,b.backupId);return json(res,200,{released:true});}
    throw new GuardError('ADMIN_ROUTE_NOT_FOUND',404);
   }
   assert(req.method==='GET','METHOD_NOT_ALLOWED',405);const files={'/':{file:'index.html',type:'text/html; charset=utf-8'},'/app.js':{file:'app.js',type:'text/javascript; charset=utf-8'},'/style.css':{file:'style.css',type:'text/css; charset=utf-8'},'/assets/tmdb-primary-short-blue.svg':{file:'assets/tmdb-primary-short-blue.svg',type:'image/svg+xml'}};const asset=files[pathname];assert(asset,'NOT_FOUND',404);const f=path.join(ROOT,'web',asset.file),data=fs.readFileSync(f);res.writeHead(200,{'content-type':asset.type,'cache-control':'no-store'});res.end(data);
  }catch(err){if(!res.headersSent)json(res,err instanceof GuardError?err.status:500,{error:safeError(err)});else res.destroy();}finally{active--;}
 });server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;server.maxHeadersCount=50;server.maxRequestsPerSocket=100;server.on('close',()=>{rt.close();release();});server.on('error',()=>{release();});return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{const rt=new Runtime();const server=createServer(rt);server.listen(rt.config.server.port,rt.config.server.host,()=>{rt.schedule();console.log(JSON.stringify({service:'stremio-watch-sync-repair',version:'1.0.1',listening:true,host:rt.config.server.host,port:rt.config.server.port}));});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{if(rt.lock.keys.size===0)server.close();});}catch(e){console.error(JSON.stringify({error:safeError(e)}));process.exitCode=1;}}
