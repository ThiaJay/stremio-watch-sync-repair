import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {spawn} from 'node:child_process';
import {Runtime} from '../src/runtime.js';import {ROOT,defaultConfig} from '../src/config.js';import {atomicWrite,readJson,secureDir} from '../src/core/store.js';import {assert} from '../src/core/util.js';
const command=process.argv[2]??'start',configFile=process.env.STREMIO_WATCH_SYNC_REPAIR_CONFIG||process.env.STREMIO_GUARD_CONFIG||path.join(ROOT,'config.json');
function request(rt,endpoint,{method='GET',data}={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:rt.config.server.port,path:'/admin/'+endpoint,method,headers:{authorization:`Bearer ${rt.store.secret('_system','adminToken')}`,...(data?{'content-type':'application/json'}:{})},timeout:3000},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{if(res.statusCode!==200)return reject(new Error('PRIVATE_SERVICE_NOT_AUTHENTICATED'));try{resolve(JSON.parse(Buffer.concat(chunks).toString()));}catch{reject(new Error('INVALID_SERVICE_RESPONSE'));}});});req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('SERVICE_TIMEOUT')));req.end(data?JSON.stringify(data):undefined);});}
try{
 if(!fs.existsSync(configFile))atomicWrite(configFile,defaultConfig());const rt=new Runtime();assert(rt.config.server.host!=='::1','LAUNCHER_REQUIRES_IPV4_LOOPBACK');
 if(command==='stop'){await request(rt,'shutdown',{method:'POST',data:{}});console.log(JSON.stringify({stopRequested:true}));}
 else if(command==='start'||command==='serve'){
  let status;try{status=await request(rt,'status');}catch{}
  if(!status){const lock=readJson(path.join(rt.store.dir,'service.lock'),null);if(lock){let alive=true;try{process.kill(lock.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}assert(!alive,'SERVICE_OWNER_STILL_RUNNING');assert(false,'STALE_LOCK_REVIEW_REQUIRED');}
   const logs=path.join(rt.store.dir,'runtime');secureDir(logs);const out=fs.openSync(path.join(logs,'server.log'),'a',0o600),err=fs.openSync(path.join(logs,'server-error.log'),'a',0o600);
   const child=spawn(process.execPath,[path.join(ROOT,'src','server.js')],{cwd:ROOT,env:process.env,windowsHide:true,detached:true,stdio:['ignore',out,err]});child.unref();fs.closeSync(out);fs.closeSync(err);
   for(let n=0;n<50;n++){await new Promise(r=>setTimeout(r,300));try{status=await request(rt,'status');break;}catch{}}
   assert(status,'SERVICE_START_FAILED_CHECK_PRIVATE_LOG');
  }
  if(command==='start'){
   const url=`http://127.0.0.1:${rt.config.server.port}/#token=${rt.store.secret('_system','adminToken')}`;
   if(process.platform==='win32'){const exe=path.join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');const p=spawn(exe,['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $env:WATCH_SYNC_REPAIR_DASHBOARD_LINK'],{env:{...process.env,WATCH_SYNC_REPAIR_DASHBOARD_LINK:url},windowsHide:true,stdio:'ignore'});p.unref();}
   else assert(false,'OPEN_LOCAL_MANAGEMENT_LINK_WITH_CLI_DASHBOARD_URL');
  }
  console.log(JSON.stringify({running:true,version:status.version,profiles:status.profiles.length,scheduleEnabled:status.scheduleEnabled,remoteReady:status.publicReady}));
 }else throw new Error('UNKNOWN_LAUNCH_COMMAND');
}catch(e){console.error(JSON.stringify({error:e.code??e.message??'LAUNCH_FAILED'}));process.exitCode=1;}
