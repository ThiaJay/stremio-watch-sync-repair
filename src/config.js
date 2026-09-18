import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assert,plain,rejectPoison,hash} from './core/util.js';
import {atomicWrite,readJson} from './core/store.js';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const MODULES=['libraryRepair','watchedState','traktBridge','diagnostics'];
export const DEFAULT_RESILIENCE={readRetries:2,requestTimeoutSeconds:15,sourceFailureThreshold:3,sourceCooldownSeconds:120,maxRetryAfterSeconds:60,watchedMappingFallback:'validated-cache-only'};
export const resilienceFor=profile=>({...DEFAULT_RESILIENCE,...(profile?.resilience??{})});
export function defaultProfile(id='main'){return {
 id,label:id,locale:'en',timezone:'UTC',
 modules:{libraryRepair:true,watchedState:true,traktBridge:true,diagnostics:true},
 metadata:{source:'upstream',fallbackSources:['tmdb'],repairFallback:false,upstreamSecret:'metadataUrl',requestLanguageParameter:false,cacheSeconds:60},
 metadataText:{preferredLanguages:['en'],fallbackOrder:['preferred','original']},
 libraryRepair:{writeEnabled:false,allowNonAtomicAccountWrites:false,quietSeconds:300,maxChanges:10,fields:['poster','posterShape'],intervalMinutes:30,verifyPosterReachability:true},
 trakt:{mode:'stremio-native',stremioWriteEnabled:false,syncMarkUnwatched:true,autoApplyConfirmedUnwatch:false,confirmUnwatchedCycles:2,conflictPolicy:'manual',maxChanges:20,intervalMinutes:15,outboundGraceMinutes:60,outboundStaleMinutes:1440},
 resilience:{...DEFAULT_RESILIENCE},
 network:{imageHosts:['image.tmdb.org','artworks.thetvdb.com','images.metahub.space','api.ratingposterdb.com'],metadataHosts:[]}
};}
export const defaultConfig=()=>({version:3,server:{host:'127.0.0.1',port:7080,dataDir:'./data',scheduleEnabled:false},profiles:[defaultProfile()]});
function keys(o,allowed,where){assert(plain(o),`INVALID_${where}`);assert(Object.keys(o).every(k=>allowed.includes(k)),`UNKNOWN_${where}_SETTING`);}
function flag(x,n){assert(typeof x==='boolean',`INVALID_${n}`);}
function int(x,a,b,n){assert(Number.isInteger(x)&&x>=a&&x<=b,`INVALID_${n}`);}
function choice(v,options,n){assert(options.includes(v),`INVALID_${n}`);}
function subset(v,list,n){assert(Array.isArray(v)&&new Set(v).size===v.length&&v.every(x=>list.includes(x)),`INVALID_${n}`);}
function tags(a,n){assert(Array.isArray(a)&&a.length>0&&a.length<=12,`INVALID_${n}`);for(const s of a){assert(typeof s==='string'&&s.length<=50,`INVALID_${n}`);try{assert(Intl.getCanonicalLocales(s).length===1,`INVALID_${n}`);}catch{assert(false,`INVALID_${n}`);}}}
function hosts(a){assert(Array.isArray(a)&&a.length<=40&&a.every(h=>typeof h==='string'&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)),'INVALID_HOST_ALLOWLIST');}
function migrateProfile(p){const legacy=p.modules??{};for(const m of ['artworkGuard','spoilerGuard','unwatchedCatalogs','scrobbleMonitor'])assert(legacy[m]!==true,'LEGACY_PUBLIC_SURFACE_REMOVED');const d=defaultProfile(p.id);return {
 id:p.id,label:p.label,locale:p.locale,timezone:p.timezone,
 modules:{libraryRepair:legacy.libraryRepair??true,watchedState:legacy.watchedState??true,traktBridge:legacy.traktBridge??true,diagnostics:legacy.diagnostics??true},
 metadata:{source:p.metadata?.source??d.metadata.source,fallbackSources:p.metadata?.fallbackSources??[],repairFallback:p.metadata?.repairFallback===true,upstreamSecret:p.metadata?.upstreamSecret??d.metadata.upstreamSecret,requestLanguageParameter:p.metadata?.requestLanguageParameter??false,cacheSeconds:p.metadata?.cacheSeconds??60},
 metadataText:p.metadataText??d.metadataText,
 libraryRepair:{...d.libraryRepair,...p.libraryRepair,verifyPosterReachability:p.libraryRepair?.verifyPosterReachability!==false},
 trakt:{...d.trakt,...p.trakt,mode:'stremio-native',stremioWriteEnabled:p.trakt?.stremioWriteEnabled??p.trakt?.writeEnabled??false},resilience:{...DEFAULT_RESILIENCE,...p.resilience},
 network:{imageHosts:p.network?.imageHosts??d.network.imageHosts,metadataHosts:p.network?.metadataHosts??[]}
};}
function normalizeV3(input){const c=structuredClone(input);for(const p of c.profiles??[]){if(p.trakt){p.trakt={...defaultProfile(p.id).trakt,...p.trakt,mode:'stremio-native',stremioWriteEnabled:p.trakt.stremioWriteEnabled??p.trakt.writeEnabled??false};delete p.trakt.writeEnabled;delete p.trakt.direction;}}return c;}
export function migrateConfig(input){rejectPoison(input);if(input?.version===3)return normalizeV3(input);assert(input?.version===2,'CONFIG_MIGRATION_REQUIRED');assert(input.server?.publicUrl===''||input.server?.publicUrl===undefined,'PUBLIC_HOSTING_REMOVED');return normalizeV3({version:3,server:{host:input.server.host,port:input.server.port,dataDir:input.server.dataDir,scheduleEnabled:input.server.scheduleEnabled},profiles:input.profiles.map(migrateProfile)});}
export function validateConfig(input){const c=migrateConfig(input);rejectPoison(c);keys(c,['version','server','profiles'],'ROOT');assert(c.version===3,'CONFIG_MIGRATION_REQUIRED');
 keys(c.server,['host','port','dataDir','scheduleEnabled'],'SERVER');choice(c.server.host,['127.0.0.1'],'HOST');int(c.server.port,1024,65535,'PORT');flag(c.server.scheduleEnabled,'SCHEDULE');
 assert(typeof c.server.dataDir==='string'&&c.server.dataDir.length>0&&c.server.dataDir.length<500,'INVALID_DATA_DIR');const resolvedData=path.resolve(ROOT,c.server.dataDir),relativeData=path.relative(ROOT,resolvedData);assert(relativeData&&!relativeData.startsWith('..'+path.sep)&&!path.isAbsolute(relativeData),'PROJECT_LOCAL_DATA_REQUIRED');
 assert(Array.isArray(c.profiles)&&c.profiles.length>=1&&c.profiles.length<=20,'INVALID_PROFILES');const ids=new Set();
 for(const p of c.profiles){const d=defaultProfile();keys(p,Object.keys(d),'PROFILE');assert(typeof p.id==='string'&&/^[a-z][a-z0-9_-]{0,39}$/.test(p.id)&&!ids.has(p.id),'INVALID_OR_DUPLICATE_PROFILE');ids.add(p.id);assert(typeof p.label==='string'&&p.label.length<=80,'INVALID_LABEL');tags([p.locale],'LOCALE');try{new Intl.DateTimeFormat('en',{timeZone:p.timezone});}catch{assert(false,'INVALID_TIMEZONE');}
  keys(p.modules,MODULES,'MODULE');for(const m of MODULES)flag(p.modules[m],'MODULE_FLAG');
  keys(p.metadata,Object.keys(d.metadata),'METADATA');choice(p.metadata.source,['upstream','tmdb'],'SOURCE');subset(p.metadata.fallbackSources,['upstream','tmdb'],'METADATA_FALLBACKS');assert(!p.metadata.fallbackSources.includes(p.metadata.source),'DUPLICATE_METADATA_SOURCE');flag(p.metadata.repairFallback,'REPAIR_FALLBACK');assert(/^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(p.metadata.upstreamSecret),'INVALID_SECRET_REFERENCE');flag(p.metadata.requestLanguageParameter,'LANG_PARAM');int(p.metadata.cacheSeconds,0,300,'CACHE_SECONDS');
  keys(p.metadataText,Object.keys(d.metadataText),'TEXT');tags(p.metadataText.preferredLanguages,'TEXT_LANGUAGES');subset(p.metadataText.fallbackOrder,['preferred','original','any'],'TEXT_FALLBACK');assert(p.metadataText.fallbackOrder.length>0,'EMPTY_TEXT_FALLBACK');
  keys(p.libraryRepair,Object.keys(d.libraryRepair),'LIBRARY_REPAIR');for(const f of ['writeEnabled','allowNonAtomicAccountWrites','verifyPosterReachability'])flag(p.libraryRepair[f],f);int(p.libraryRepair.quietSeconds,60,86400,'QUIET_SECONDS');int(p.libraryRepair.maxChanges,1,100,'MAX_REPAIRS');int(p.libraryRepair.intervalMinutes,5,1440,'REPAIR_INTERVAL');subset(p.libraryRepair.fields,['poster','posterShape','name'],'METADATA_FIELDS');assert(p.libraryRepair.fields.length>0,'NO_REPAIR_FIELDS');
  keys(p.trakt,Object.keys(d.trakt),'TRAKT');choice(p.trakt.mode,['stremio-native'],'TRAKT_MODE');for(const f of ['stremioWriteEnabled','syncMarkUnwatched','autoApplyConfirmedUnwatch'])flag(p.trakt[f],f);int(p.trakt.confirmUnwatchedCycles,2,10,'UNWATCHED_CYCLES');choice(p.trakt.conflictPolicy,['manual','watched-wins'],'CONFLICT_POLICY');int(p.trakt.maxChanges,1,100,'MAX_SYNC_CHANGES');int(p.trakt.intervalMinutes,5,1440,'SYNC_INTERVAL');int(p.trakt.outboundGraceMinutes,5,1440,'OUTBOUND_GRACE');int(p.trakt.outboundStaleMinutes,60,10080,'OUTBOUND_STALE');assert(p.trakt.outboundStaleMinutes>=p.trakt.outboundGraceMinutes,'OUTBOUND_STALE_BEFORE_GRACE');
  keys(p.resilience,Object.keys(d.resilience),'RESILIENCE');int(p.resilience.readRetries,0,3,'READ_RETRIES');int(p.resilience.requestTimeoutSeconds,5,60,'REQUEST_TIMEOUT');int(p.resilience.sourceFailureThreshold,1,10,'SOURCE_FAILURE_THRESHOLD');int(p.resilience.sourceCooldownSeconds,5,3600,'SOURCE_COOLDOWN');int(p.resilience.maxRetryAfterSeconds,1,300,'MAX_RETRY_AFTER');choice(p.resilience.watchedMappingFallback,['validated-cache-only','none'],'WATCHED_MAPPING_FALLBACK');
  keys(p.network,Object.keys(d.network),'NETWORK');for(const a of Object.values(p.network))hosts(a);
 }return c;
}
export class ConfigStore{
 constructor(file=process.env.STREMIO_WATCH_SYNC_REPAIR_CONFIG||process.env.STREMIO_GUARD_CONFIG||path.join(ROOT,'config.json')){this.file=path.resolve(file);this.config=validateConfig(readJson(this.file,defaultConfig()));this.revision=hash(this.config);}
 get(){return structuredClone(this.config);}
 set(c,revision){assert(revision===this.revision,'CONFIG_CHANGED_RELOAD_REQUIRED',409);const valid=validateConfig(c);assert(valid.server.host===this.config.server.host&&valid.server.port===this.config.server.port,'BIND_CHANGE_REQUIRES_RESTART');assert(path.resolve(ROOT,valid.server.dataDir)===path.resolve(ROOT,this.config.server.dataDir),'DATA_DIR_CHANGE_REQUIRES_RESTART');atomicWrite(this.file,valid);this.config=structuredClone(valid);this.revision=hash(valid);return this.get();}
}
