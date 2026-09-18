import path from 'node:path';
import fs from 'node:fs';
import {ROOT,ConfigStore,MODULES} from './config.js';
import {SecureStore,secureDir} from './core/store.js';
import {assert,hash,randomToken,Mutex,safeError} from './core/util.js';
import {HttpClient} from './core/network.js';
import {Health} from './core/health.js';
import {SafetyGate} from './core/safety.js';
import {StremioAdapter} from './adapters/stremio.js';
import {StremioPairing} from './adapters/pairing.js';
import {MetadataAdapter} from './adapters/metadata.js';
import {TraktAdapter} from './adapters/trakt.js';
import {CinemetaAdapter} from './adapters/cinemeta.js';
import {WatchedState} from './modules/watched.js';
import {LibraryRepair} from './modules/library-repair.js';
import {TraktBridge} from './modules/trakt-bridge.js';
import {historyBundle,historyCsv,parseHistoryImport} from './modules/history-exchange.js';
function accountSafeUrl(raw){if(typeof raw!=='string')return true;try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!['localhost','127.0.0.1','::1'].includes(u.hostname.toLowerCase());}catch{return false;}}
export class Runtime{
 constructor({configStore=new ConfigStore(),store,http=new HttpClient(),factories={}}={}){this.configStore=configStore;this.config=configStore.get();this.store=store??new SecureStore(path.resolve(ROOT,this.config.server.dataDir));this.http=http;this.factories=factories;this.health=new Health();this.lock=new Mutex();this.environments=new Map();this.timers=[];this.generation=0;
  for(const p of this.config.profiles){const marker=this.store.read(p.id,'trakt-integration-mode',null);if(marker?.mode!=='stremio-native'){const baseline=this.store.read(p.id,'sync-baseline',null);if(baseline)this.store.backup(p.id,'pre-native-sync-baseline',baseline);this.store.write(p.id,'sync-baseline',null);this.store.write(p.id,'sync-observations',{});this.store.write(p.id,'trakt-unmapped',null);const secrets=this.store.read(p.id,'secrets',{}),deprecated=['traktClientId','traktClientSecret','traktAccessToken','traktRefreshToken','traktExpiresAt'],purged=[];for(const name of deprecated)if(Object.hasOwn(secrets,name)){delete secrets[name];purged.push(name);}if(purged.length)this.store.write(p.id,'secrets',secrets);this.store.write(p.id,'trakt-integration-mode',{mode:'stremio-native',at:new Date().toISOString()});this.store.audit(p.id,'traktBridge','nativeIntegrationMigrated',{baselineBackedUp:!!baseline,purgedSecrets:purged});}}
  for(const p of this.config.profiles){for(const ref of this.store.read(p.id,'plan-index',[])){const plan=this.store.read(p.id,ref.id);if(plan?.status==='APPLYING'){let ownerAlive=false;if(Number.isInteger(plan.applyPid)&&plan.applyPid>0){try{process.kill(plan.applyPid,0);ownerAlive=true;}catch(e){if(e.code!=='ESRCH')ownerAlive=true;}}if(!ownerAlive){this.store.write(p.id,'write-hold',{code:'INTERRUPTED_WRITE_REQUIRES_REVIEW',backup:null,plan:plan.id,at:new Date().toISOString()});break;}}}}}
 profile(id){const p=this.config.profiles.find(p=>p.id===id);assert(p,'PROFILE_NOT_FOUND',404);return p;}
 environment(id){if(this.environments.has(id))return this.environments.get(id);const p=this.profile(id),stremio=this.factories.stremio?.(p)??new StremioAdapter(p,this.store,this.http),metadata=this.factories.metadata?.(p)??new MetadataAdapter(p,this.store,this.http,null),trakt=this.factories.trakt?.(p)??new TraktAdapter(p,this.store,this.http,stremio),cinemeta=this.factories.cinemeta?.(p)??new CinemetaAdapter(this.http,p);const gate=new SafetyGate(p,this.store,stremio),watched=new WatchedState(p,this.store,stremio,metadata,cinemeta),repair=new LibraryRepair(p,this.store,stremio,metadata,gate),bridge=new TraktBridge(p,this.store,watched,trakt,stremio,metadata,gate),pairing=new StremioPairing(p,this.store,this.http);const e={p,stremio,metadata,trakt,cinemeta,gate,watched,repair,bridge,pairing};this.environments.set(id,e);return e;}
 connections(pid){const e=this.environment(pid);return {stremio:e.stremio.configured(),metadata:e.metadata.configured(),trakt:e.trakt.configured(),traktMode:'stremio-native'};}
 status(){const active=['libraryRepair','watchedState','traktBridge','diagnostics'];return {version:'1.0.1',revision:this.configStore.revision,scheduleEnabled:this.config.server.scheduleEnabled,publicReady:false,profiles:this.config.profiles.map(p=>{const c=this.connections(p.id),modules={};for(const m of active){let row=this.health.get(p.id,m);if(!p.modules[m])row={...row,state:'OFF',lastError:null};else if(m==='libraryRepair'&&!c.metadata)row={...row,state:'BLOCKED',lastError:'METADATA_NOT_CONNECTED'};else if(['libraryRepair','watchedState','traktBridge'].includes(m)&&!c.stremio)row={...row,state:'BLOCKED',lastError:'STREMIO_NOT_CONNECTED'};else if(m==='traktBridge'&&!c.trakt)row={...row,state:'BLOCKED',lastError:'TRAKT_NOT_CONNECTED'};modules[m]={...row,enabled:p.modules[m]};}const e=this.environment(p.id);return {id:p.id,label:p.label,locale:p.locale,connections:c,modules,sources:{metadata:e.metadata.health?.()??null,cinemeta:e.cinemeta.health?.()??null,trakt:e.trakt.health?.()??null},nativeOutbound:this.store.read(p.id,'sync-outbound-status',{total:0,pending:0,stale:0}),writeHold:this.store.read(p.id,'write-hold'),watchedUpdatedAt:e.watched.snapshot()?.at??null};})};}
 secretRevision(pid){return hash(this.store.read(pid,'secrets',{}));}
 setConfig(c,revision){assert(this.lock.keys.size===0,'OPERATION_IN_PROGRESS',409);this.config=this.configStore.set(c,revision);this.environments.clear();this.schedule();return this.status();}
 async job(pid,module,fn){this.profile(pid);return this.lock.run(pid,async()=>{const e=this.environment(pid),until=Date.now()+(module==='safety'?180000:120000);const deadline=()=>assert(Date.now()<until,'JOB_TIME_LIMIT',503);for(const k of ['metadata','stremio','trakt','cinemeta','watched','repair','bridge'])e[k].deadline=deadline;this.health.set(pid,module,'RUNNING');try{const result=await fn(e);this.health.set(pid,module,'READY',{checked:result.checked??0,changed:result.changed??0});return result;}catch(err){this.health.set(pid,module,'BLOCKED',{lastError:safeError(err)});this.store.audit(pid,module,'operationFailed',{code:safeError(err)});throw err;}finally{for(const k of ['metadata','stremio','trakt','cinemeta','watched','repair','bridge'])e[k].deadline=null;}});}
 async refresh(pid){return this.job(pid,'watchedState',async e=>{assert(e.p.modules.watchedState||e.p.modules.traktBridge,'MODULE_OFF');const s=await e.watched.scan();if(!e.p.modules.traktBridge)this.store.write(pid,'watched-canonical',{at:s.at,complete:s.complete,states:s.states});return {checked:s.items.length,complete:s.complete,known:Object.keys(s.states).length,watched:Object.values(s.states).filter(Boolean).length,errors:s.errors};});}
 summary(plan){return {id:plan.id,kind:plan.kind,mode:plan.mode,digest:plan.digest,expires:plan.expires,checked:plan.checked,identityReset:plan.identityReset===true,outbound:plan.outbound??null,operations:plan.operations.map(o=>({id:o.id??o.key,target:o.target??'stremio',desired:o.desired,fields:o.allowed,dateEstimated:o.dateEstimated})),skipped:plan.skipped??[],conflicts:plan.conflicts??[],remaining:plan.remaining??0,status:plan.status};}
 async plan(pid,kind,ids=[]){assert(['repair','sync'].includes(kind),'INVALID_PLAN_KIND');return this.job(pid,kind==='repair'?'libraryRepair':'traktBridge',async e=>{const p=kind==='repair'?await e.repair.plan(ids):await e.bridge.plan();const id='plan-'+randomToken().replaceAll('_','x').replaceAll('-','y');const plan={...p,id,profile:pid,revision:this.configStore.revision,secrets:this.secretRevision(pid),expires:Date.now()+600000,status:'REVIEW'};plan.digest=hash(plan);this.store.write(pid,id,plan);const index=this.store.read(pid,'plan-index',[]);index.push({id,kind,at:new Date().toISOString()});this.store.write(pid,'plan-index',index.slice(-100));return this.summary(plan);});}
 async historyExport(pid){return this.job(pid,'traktBridge',async e=>{assert(e.p.modules.traktBridge,'MODULE_OFF');const s=await e.watched.scan();assert(s.complete,'INCOMPLETE_STREMIO_HISTORY');const t=await e.trakt.snapshot();assert(t.complete,'INCOMPLETE_TRAKT_HISTORY');const bundle=historyBundle(s,t),csv=historyCsv(bundle),reviewCsv=historyCsv(bundle,{differencesOnly:true}),dir=path.resolve(ROOT,'exports');secureDir(dir);const stamp=new Date().toISOString().replace(/[:.]/g,'-'),base=`${pid}-history-${stamp}`,jsonPath=path.join(dir,base+'.json'),csvPath=path.join(dir,base+'.csv'),reviewCsvPath=path.join(dir,base+'-differences.csv');fs.writeFileSync(jsonPath,JSON.stringify(bundle,null,2),{encoding:'utf8',flag:'wx',mode:0o600});fs.writeFileSync(csvPath,csv,{encoding:'utf8',flag:'wx',mode:0o600});fs.writeFileSync(reviewCsvPath,reviewCsv,{encoding:'utf8',flag:'wx',mode:0o600});const disagreements=bundle.rows.filter(r=>r.status==='stremio-only'||r.status==='trakt-only').length,reviewRows=bundle.rows.filter(r=>!['both-watched','both-unwatched'].includes(r.status)).length;this.store.audit(pid,'traktBridge','historyExported',{rows:bundle.rows.length,disagreements,reviewRows});return {jsonPath,csvPath,reviewCsvPath,rows:bundle.rows.length,disagreements,reviewRows,stremioUnresolved:s.unknownIds?.length??0,stremioComplete:s.complete,traktComplete:t.complete};});}
 async historyImportPlan(pid,text,format){return this.job(pid,'traktBridge',async e=>{const imported=parseHistoryImport(text,format),p=await e.bridge.manualPlan(imported),id='plan-'+randomToken().replaceAll('_','x').replaceAll('-','y'),plan={...p,id,profile:pid,revision:this.configStore.revision,secrets:this.secretRevision(pid),expires:Date.now()+600000,status:'REVIEW'};plan.digest=hash(plan);this.store.write(pid,id,plan);const index=this.store.read(pid,'plan-index',[]);index.push({id,kind:'sync',at:new Date().toISOString(),manual:true});this.store.write(pid,'plan-index',index.slice(-100));return this.summary(plan);});}
 async uniqueWriter(pid){const p=this.profile(pid),target=await this.environment(pid).stremio.accountIdentity();for(const other of this.config.profiles){if(other.id===pid||!other.libraryRepair.writeEnabled&&!other.trakt.stremioWriteEnabled)continue;const e=this.environment(other.id);if(e.stremio.configured())assert(await e.stremio.accountIdentity()!==target,'DUPLICATE_STREMIO_ACCOUNT_WRITER');}}
 async apply(pid,id,digest,ack={}){return this.job(pid,'safety',async e=>{const plan=this.store.read(pid,id);assert(plan?.profile===pid&&plan.status==='REVIEW'&&plan.digest===digest,'INVALID_OR_CONSUMED_PLAN',409);assert(plan.revision===this.configStore.revision&&plan.secrets===this.secretRevision(pid)&&plan.expires>Date.now(),'PLAN_EXPIRED_OR_CHANGED',409);for(const op of plan.operations??[])if(op.next?.poster!==undefined)assert(accountSafeUrl(op.next.poster),'LOCAL_OR_UNSAFE_POSTER_WRITE_BLOCKED');await this.uniqueWriter(pid);plan.status='APPLYING';plan.applyPid=process.pid;plan.applyStartedAt=new Date().toISOString();this.store.write(pid,id,plan);try{const result=plan.kind==='repair'?await e.repair.apply(plan):await e.bridge.apply(plan,ack);plan.status='VERIFIED';plan.result=result;delete plan.applyPid;delete plan.applyStartedAt;this.store.write(pid,id,plan);return result;}catch(err){plan.status='STOPPED';plan.error=safeError(err);delete plan.applyPid;delete plan.applyStartedAt;this.store.write(pid,id,plan);throw err;}});}
 async recoveryPlan(pid,backupId){return this.job(pid,'safety',async e=>{const op=await e.gate.restoreMetadata(backupId);const plan={id:'plan-'+randomToken().replaceAll('_','x').replaceAll('-','y'),kind:'repair',profile:pid,account:e.stremio.identity(),revision:this.configStore.revision,secrets:this.secretRevision(pid),expires:Date.now()+600000,status:'REVIEW',operations:[{id:op.before._id,...op}],checked:1,skipped:[]};plan.digest=hash(plan);this.store.write(pid,plan.id,plan);return this.summary(plan);});}
 async acknowledgeHold(pid,backupId){assert(this.lock.keys.size===0,'OPERATION_IN_PROGRESS');const h=this.store.read(pid,'write-hold');assert(h&&h.backup===backupId,'HOLD_CONFIRMATION_MISMATCH');this.store.audit(pid,'safety','holdAcknowledged',{backup:backupId});this.store.write(pid,'write-hold',null);}
 saveSecret(pid,name,value){this.profile(pid);assert(!this.lock.keys.has(pid),'OPERATION_IN_PROGRESS',409);assert(['stremioAuth','metadataUrl','tmdbToken'].includes(name),'SECRET_NAME_NOT_ALLOWED');this.store.setSecret(pid,name,value);this.environments.delete(pid);return {saved:true,name};}
 async scheduledPass(profile,due=new Map(),generation=this.generation){
  const tasks=[];
  if(profile.modules.watchedState){
   tasks.push({id:'watchedState',minutes:profile.trakt.intervalMinutes,run:()=>this.refresh(profile.id)});
  }
  if(profile.modules.libraryRepair){
   tasks.push({id:'libraryRepair',minutes:profile.libraryRepair.intervalMinutes,run:async()=>{
    const plan=await this.plan(profile.id,'repair');
    if(profile.libraryRepair.writeEnabled&&profile.libraryRepair.allowNonAtomicAccountWrites&&plan.operations.length&&plan.remaining===0)await this.apply(profile.id,plan.id,plan.digest);
   }});
  }
  if(profile.modules.traktBridge){
   tasks.push({id:'traktBridge',minutes:profile.trakt.intervalMinutes,run:async()=>{
    const plan=await this.plan(profile.id,'sync');let applied=false;
    if(profile.trakt.stremioWriteEnabled&&plan.operations.length&&!plan.conflicts.length&&plan.operations.every(op=>op.target==='stremio'&&(op.desired===true||op.desired===false))){const removals=plan.operations.some(op=>op.desired===false);if(!removals||profile.trakt.autoApplyConfirmedUnwatch){await this.apply(profile.id,plan.id,plan.digest,{ackRemovals:removals});applied=true;}}
    return {continueSoon:applied&&plan.remaining>0};
   }});
  }
  for(const task of tasks){
   if(generation!==this.generation||!this.config.server.scheduleEnabled)break;
   if((due.get(task.id)??0)>Date.now())continue;
   try{const outcome=await task.run();due.set(task.id,Date.now()+(outcome?.continueSoon?30000:task.minutes*60000));}
   catch(error){const retry=Number.isFinite(error.retryAfterMs)?Math.min(error.retryAfterMs,task.minutes*60000):error.code==='OPERATION_BUSY'?5000:task.minutes*60000;due.set(task.id,Date.now()+Math.max(1000,retry));}
  }
  return due;
 }
 schedule(){
  const generation=++this.generation;
  for(const timer of this.timers)clearTimeout(timer);
  this.timers=new Set();
  if(!this.config.server.scheduleEnabled)return;
  for(const profile of this.config.profiles){
   const due=new Map();
   const arm=ms=>{const timer=setTimeout(()=>{this.timers.delete(timer);void loop();},ms);timer.unref();this.timers.add(timer);};
   const loop=async()=>{
    await this.scheduledPass(profile,due,generation);
    if(generation!==this.generation||!this.config.server.scheduleEnabled)return;
    const next=due.size?Math.min(...due.values()):Date.now()+60000;
    arm(Math.max(1000,Math.min(60000,next-Date.now())));
   };
   arm(5000);
  }
 }
 close(){this.generation++;for(const t of this.timers)clearTimeout(t);this.timers=[];}
}
