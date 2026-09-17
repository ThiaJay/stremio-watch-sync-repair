import fs from 'node:fs';
import path from 'node:path';
import {ROOT,defaultConfig,ConfigStore} from './config.js';
import {atomicWrite,readJson,secureDir} from './core/store.js';
import {Runtime} from './runtime.js';
import {assert,GuardError} from './core/util.js';
const command=process.argv[2]??'help';
try{
  const file=process.env.STREMIO_WATCH_SYNC_REPAIR_CONFIG||process.env.STREMIO_GUARD_CONFIG||path.join(ROOT,'config.json');
  if(command==='check'){const c=new ConfigStore(file);console.log(JSON.stringify({ok:true,version:'1.0.0',profiles:c.get().profiles.map(p=>p.id),configurationOnly:true,externalWrites:0}));}
  else if(command==='init'){
    if(!fs.existsSync(file))atomicWrite(file,defaultConfig());const rt=new Runtime({configStore:new ConfigStore(file)});console.log(JSON.stringify({created:true,config:file,dataDir:rt.store.dir,scheduleEnabled:rt.config.server.scheduleEnabled,externalWrites:0}));
  }else if(command==='status'){const rt=new Runtime({configStore:new ConfigStore(file)});console.log(JSON.stringify(rt.status(),null,2));}
  else if(command==='dashboard-url'){const rt=new Runtime({configStore:new ConfigStore(file)});process.stdout.write(`http://127.0.0.1:${rt.config.server.port}/#token=${rt.store.secret('_system','adminToken')}`);}
  else if(command==='secret-stdin'){
    const b=fs.readFileSync(0,'utf8');assert(b.length<100000,'SECRET_INPUT_TOO_LARGE');const data=JSON.parse(b);const rt=new Runtime({configStore:new ConfigStore(file)});rt.profile(data.profile);assert(!fs.existsSync(path.join(rt.store.dir,'service.lock')),'USE_AUTHENTICATED_DASHBOARD_WHILE_SERVICE_RUNNING');const allowed=['stremioAuth','metadataUrl','tmdbToken'];
    assert(allowed.includes(data.name)&&typeof data.value==='string','INVALID_SECRET');rt.store.setSecret(data.profile,data.name,data.value);console.log(JSON.stringify({saved:true,name:data.name}));
  }else if(command==='clear-stale-lock'){
    const c=new ConfigStore(file),f=path.join(path.resolve(ROOT,c.get().server.dataDir),'service.lock'),lock=readJson(f,null);assert(lock&&Number.isInteger(lock.pid),'LOCK_NOT_FOUND');let alive=true;try{process.kill(lock.pid,0);}catch(e){assert(e.code==='ESRCH','CANNOT_VERIFY_LOCK_OWNER');alive=false;}assert(!alive,'LOCK_OWNER_STILL_RUNNING');fs.unlinkSync(f);console.log(JSON.stringify({removedStaleLock:true}));
  }else if(command==='backup-export'){
    const [pid,id,name]=process.argv.slice(3);assert(typeof name==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.json$/.test(name)&&!name.includes('..'),'OUTPUT_JSON_FILENAME_REQUIRED');const rt=new Runtime({configStore:new ConfigStore(file)});rt.profile(pid);const data=rt.store.read(pid,id);assert(data,'BACKUP_NOT_FOUND');const dir=path.join(ROOT,'exports','private-backups');secureDir(dir);const out=path.join(dir,name);assert(!fs.existsSync(out),'OUTPUT_ALREADY_EXISTS');atomicWrite(out,data);console.log(JSON.stringify({saved:out,warning:'Private plaintext backup. Do not share.'}));
  }else {console.log('Stremio Watch Sync & Repair: init | check | status | dashboard-url | secret-stdin | clear-stale-lock | backup-export <profile> <backup-id> <filename.json>');}
}catch(e){console.error(JSON.stringify({error:e.code??'COMMAND_FAILED'}));process.exitCode=1;}
