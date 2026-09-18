import fs from 'node:fs';
import path from 'node:path';
import {ROOT,defaultConfig,ConfigStore} from './config.js';
import {atomicWrite,readJson,secureDir} from './core/store.js';
import {Runtime} from './runtime.js';
import {assert,GuardError} from './core/util.js';
const command=process.argv[2]??'help';
function initialConfig(file){const c=defaultConfig(),custom=path.resolve(file)!==path.join(ROOT,'config.json');if(custom){const data=path.join(path.dirname(file),'data'),rel=path.relative(ROOT,data);assert(rel&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel),'CUSTOM_CONFIG_MUST_BE_PROJECT_LOCAL');c.server.dataDir='./'+rel.replaceAll('\\','/');}return c;}
try{
  const file=process.env.STREMIO_WATCH_SYNC_REPAIR_CONFIG||process.env.STREMIO_GUARD_CONFIG||path.join(ROOT,'config.json');
  if(command==='check'){const c=new ConfigStore(file);console.log(JSON.stringify({ok:true,version:'1.0.1',profiles:c.get().profiles.map(p=>p.id),configurationOnly:true,externalWrites:0}));}
  else if(command==='init'){
    if(!fs.existsSync(file))atomicWrite(file,initialConfig(file));const rt=new Runtime({configStore:new ConfigStore(file)});console.log(JSON.stringify({created:true,config:file,dataDir:rt.store.dir,scheduleEnabled:rt.config.server.scheduleEnabled,externalWrites:0}));
  }else if(command==='status'){const rt=new Runtime({configStore:new ConfigStore(file)});console.log(JSON.stringify(rt.status(),null,2));}
  else if(command==='dashboard-url'){const rt=new Runtime({configStore:new ConfigStore(file)});process.stdout.write(`http://127.0.0.1:${rt.config.server.port}/#token=${rt.store.secret('_system','adminToken')}`);}
  else if(command==='secret-stdin'){
    const b=fs.readFileSync(0,'utf8');assert(b.length<100000,'SECRET_INPUT_TOO_LARGE');const data=JSON.parse(b);const rt=new Runtime({configStore:new ConfigStore(file)});rt.profile(data.profile);assert(!fs.existsSync(path.join(rt.store.dir,'service.lock')),'USE_AUTHENTICATED_DASHBOARD_WHILE_SERVICE_RUNNING');const allowed=['stremioAuth','metadataUrl','tmdbToken'];
    assert(allowed.includes(data.name)&&typeof data.value==='string','INVALID_SECRET');rt.store.setSecret(data.profile,data.name,data.value);console.log(JSON.stringify({saved:true,name:data.name}));
  }else if(['pair-stremio-start','pair-stremio-poll','pair-trakt-start','pair-trakt-poll'].includes(command)){
    const pid=process.argv[3]??'main',rt=new Runtime({configStore:new ConfigStore(file)});rt.profile(pid);assert(!fs.existsSync(path.join(rt.store.dir,'service.lock')),'STOP_RUNNING_SERVICE_FOR_CLI_PAIRING');const e=rt.environment(pid);
    const result=command==='pair-stremio-start'?await e.pairing.begin():command==='pair-stremio-poll'?await e.pairing.poll():command==='pair-trakt-start'?await e.trakt.beginNative():await e.trakt.pollNative();
    console.log(JSON.stringify(result,null,2));
  }else if(command==='reconcile-safe-now'){
    const pid=process.argv[3]??'main',ack=process.argv.includes('--ack-non-atomic'),rt=new Runtime({configStore:new ConfigStore(file)});rt.profile(pid);assert(!fs.existsSync(path.join(rt.store.dir,'service.lock')),'STOP_RUNNING_SERVICE_FOR_RECONCILIATION');assert(ack,'ACK_NON_ATOMIC_REQUIRED');
    const p=rt.profile(pid);p.trakt.stremioWriteEnabled=true;p.trakt.syncMarkUnwatched=false;p.trakt.autoApplyConfirmedUnwatch=false;p.libraryRepair.allowNonAtomicAccountWrites=true;
    const summary={profile:pid,batches:0,operationsApplied:0,libraryItemsChanged:0,stopped:'CONVERGED',remaining:0,conflicts:0,skippedCodes:{}};
    for(let i=0;i<100;i++){
      const plan=await rt.plan(pid,'sync');summary.batches++;summary.remaining=plan.remaining??0;summary.conflicts=plan.conflicts?.length??0;
      for(const row of plan.skipped??[])summary.skippedCodes[row.code]=(summary.skippedCodes[row.code]??0)+1;
      assert(!plan.conflicts?.length,'RECONCILIATION_CONFLICT_REQUIRES_REVIEW',409);
      assert((plan.operations??[]).every(op=>op.target==='stremio'&&op.desired===true),'UNSAFE_RECONCILIATION_OPERATION',409);
      if(!(plan.operations??[]).length){if(plan.identityReset){summary.stopped='REBASELINED_CONTINUING';continue;}summary.stopped=plan.remaining?'NO_SAFE_OPERATIONS_IN_BATCH':'CONVERGED';break;}
      const result=await rt.apply(pid,plan.id,plan.digest,{ackRemovals:false});summary.operationsApplied+=plan.operations.length;summary.libraryItemsChanged+=result.changed??0;
      if(i===99)summary.stopped='BATCH_LIMIT_REACHED';
    }
    console.log(JSON.stringify(summary,null,2));
  }else if(command==='clear-stale-lock'){
    const c=new ConfigStore(file),f=path.join(path.resolve(ROOT,c.get().server.dataDir),'service.lock'),lock=readJson(f,null);assert(lock&&Number.isInteger(lock.pid),'LOCK_NOT_FOUND');let alive=true;try{process.kill(lock.pid,0);}catch(e){assert(e.code==='ESRCH','CANNOT_VERIFY_LOCK_OWNER');alive=false;}assert(!alive,'LOCK_OWNER_STILL_RUNNING');fs.unlinkSync(f);console.log(JSON.stringify({removedStaleLock:true}));
  }else if(command==='backup-export'){
    const [pid,id,name]=process.argv.slice(3);assert(typeof name==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}\.json$/.test(name)&&!name.includes('..'),'OUTPUT_JSON_FILENAME_REQUIRED');const rt=new Runtime({configStore:new ConfigStore(file)});rt.profile(pid);const data=rt.store.read(pid,id);assert(data,'BACKUP_NOT_FOUND');const dir=path.join(ROOT,'exports','private-backups');secureDir(dir);const out=path.join(dir,name);assert(!fs.existsSync(out),'OUTPUT_ALREADY_EXISTS');atomicWrite(out,data);console.log(JSON.stringify({saved:out,warning:'Private plaintext backup. Do not share.'}));
  }else {console.log('Watch Sync & Repair for Stremio: init | check | status | dashboard-url | secret-stdin | pair-stremio-start [profile] | pair-stremio-poll [profile] | pair-trakt-start [profile] | pair-trakt-poll [profile] | reconcile-safe-now [profile] --ack-non-atomic | clear-stale-lock | backup-export <profile> <backup-id> <filename.json>');}
}catch(e){console.error(JSON.stringify({error:e.code??'COMMAND_FAILED'}));process.exitCode=1;}
