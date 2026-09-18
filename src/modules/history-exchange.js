import {assert,parseWatchKey,plain,clone} from '../core/util.js';

export const HISTORY_SCHEMA='stremio-watch-sync-repair-history-v1';
export const LEGACY_HISTORY_SCHEMA='stremio-guard-history-v1';
const MAX_ROWS=50000;

function tri(states,key,complete,absenceIsFalse){
  if(Object.prototype.hasOwnProperty.call(states??{},key))return states[key]===true;
  return complete&&absenceIsFalse?false:null;
}
function statusFor(s,t){
  if(s===null||t===null)return 'unknown';
  if(s&&t)return 'both-watched';
  if(s)return 'stremio-only';
  if(t)return 'trakt-only';
  return 'both-unwatched';
}
export function comparisonRows(s,t){
  assert(plain(s)&&plain(t),'INVALID_HISTORY_SNAPSHOT');
  const keys=[...new Set([...Object.keys(s.states??{}),...Object.keys(t.states??{})])].sort();
  assert(keys.length<=MAX_ROWS,'HISTORY_ROW_LIMIT');
  return keys.map(key=>{
    const x=parseWatchKey(key),seriesUnknown=(s.unknownIds??[]).includes(x.id),keyUnknown=(s.unresolvedKeys??[]).includes(key),stremio=seriesUnknown||keyUnknown?null:tri(s.states,key,s.complete===true,false),trakt=tri(t.states,key,t.complete===true,true);
    return {key,title:s.labels?.[key]??t.labels?.[key]??key,kind:x.kind,imdb:x.id,season:x.kind==='episode'?x.season:null,episode:x.kind==='episode'?x.episode:null,stremio,trakt,status:statusFor(stremio,trakt),stremioWatchedAt:s.dates?.[key]??'',traktWatchedAt:t.dates?.[key]??'',desired:'',target:'both',note:'',stremioIdentity:s.identity??'',traktIdentity:t.identity??''};
  });
}
export function historyBundle(s,t){
  return {schema:HISTORY_SCHEMA,generatedAt:new Date().toISOString(),sources:{stremio:{identity:s.identity,complete:s.complete===true,at:s.at,errors:clone(s.errors??[]),unknownIds:clone(s.unknownIds??[]),unresolvedKeys:clone(s.unresolvedKeys??[]),nonWritableKeys:clone(s.nonWritableKeys??[])},trakt:{identity:t.identity,complete:t.complete===true,at:t.at}},rows:comparisonRows(s,t)};
}
function csvCell(value){
  let s=value===null?'':String(value??'');
  if(/^[=+\-@]/.test(s))s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
}
const COLS=['key','title','kind','imdb','season','episode','stremio','trakt','status','stremioWatchedAt','traktWatchedAt','desired','target','note','stremioIdentity','traktIdentity'];
export function historyCsv(bundle,{differencesOnly=false}={}){
  assert(bundle?.schema===HISTORY_SCHEMA&&Array.isArray(bundle.rows),'INVALID_HISTORY_BUNDLE');
  const rows=differencesOnly?bundle.rows.filter(r=>!['both-watched','both-unwatched'].includes(r.status)):bundle.rows;
  const out=[COLS.join(',')];for(const r of rows){out.push(COLS.map(k=>csvCell(typeof r[k]==='boolean'?(r[k]?'watched':'unwatched'):r[k])).join(','));}return out.join('\r\n')+'\r\n';
}

export function parseCsv(text){
  assert(typeof text==='string'&&Buffer.byteLength(text)<=8_000_000,'IMPORT_TOO_LARGE');
  if(text.charCodeAt(0)===0xfeff)text=text.slice(1);
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;continue;}
    if(c==='"'){assert(cell.length===0,'INVALID_CSV_QUOTE');quoted=true;continue;}
    if(c===','){row.push(cell);cell='';continue;}
    if(c==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';assert(rows.length<=MAX_ROWS+1,'HISTORY_ROW_LIMIT');continue;}
    cell+=c;
  }
  assert(!quoted,'INVALID_CSV_QUOTE');if(cell.length||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}assert(rows.length>=1,'EMPTY_IMPORT');
  const head=rows.shift();assert(head.length===new Set(head).size,'DUPLICATE_CSV_HEADER');for(const c of ['key','desired','target'])assert(head.includes(c),'MISSING_IMPORT_COLUMN');
  return rows.filter(r=>r.some(v=>v!=='')).map(values=>{assert(values.length===head.length,'INVALID_CSV_COLUMN_COUNT');return Object.fromEntries(head.map((h,i)=>[h,values[i]??'']));});
}
function identityFromRows(rows,column){const values=[...new Set(rows.map(r=>String(r[column]??'').trim()).filter(Boolean))];assert(values.length<=1,'CSV_ACCOUNT_IDENTITY_CONFLICT');return values[0]??null;}
export function parseHistoryImport(input,format='json'){
  let parsed;
  if(format==='csv'){
    const rows=parseCsv(input),s=identityFromRows(rows,'stremioIdentity'),t=identityFromRows(rows,'traktIdentity');
    parsed={schema:HISTORY_SCHEMA,rows,sources:s||t?{stremio:s?{identity:s}:null,trakt:t?{identity:t}:null}:null};
  }else {assert(typeof input==='string'&&Buffer.byteLength(input)<=8_000_000,'IMPORT_TOO_LARGE');try{parsed=JSON.parse(input);}catch{assert(false,'INVALID_HISTORY_JSON');}}
  assert(plain(parsed)&&[HISTORY_SCHEMA,LEGACY_HISTORY_SCHEMA].includes(parsed.schema)&&Array.isArray(parsed.rows)&&parsed.rows.length<=MAX_ROWS,'INVALID_HISTORY_BUNDLE');
  const seen=new Set(),decisions=[];
  for(const raw of parsed.rows){assert(plain(raw)&&typeof raw.key==='string','INVALID_HISTORY_ROW');parseWatchKey(raw.key);assert(!seen.has(raw.key),'DUPLICATE_HISTORY_KEY');seen.add(raw.key);const d=String(raw.desired??'').trim().toLowerCase();if(!d)continue;assert(['watched','unwatched'].includes(d),'INVALID_HISTORY_DECISION');const target=String(raw.target??'both').trim().toLowerCase()||'both';assert(['both','stremio','trakt'].includes(target),'INVALID_HISTORY_TARGET');decisions.push({key:raw.key,desired:d==='watched',target,note:String(raw.note??'').slice(0,500)});}
  return {schema:HISTORY_SCHEMA,sources:plain(parsed.sources)?clone(parsed.sources):null,decisions};
}
export function manualOperations(imported,s,t){
  assert(imported?.schema===HISTORY_SCHEMA&&Array.isArray(imported.decisions),'INVALID_HISTORY_IMPORT');assert(s?.complete===true&&t?.complete===true,'INCOMPLETE_WATCHED_SOURCE');
  if(imported.sources?.stremio?.identity)assert(imported.sources.stremio.identity===s.identity,'STREMIO_EXPORT_ACCOUNT_CHANGED');
  if(imported.sources?.trakt?.identity)assert(imported.sources.trakt.identity===t.identity,'TRAKT_EXPORT_ACCOUNT_CHANGED');
  const operations=[],skipped=[];
  for(const d of imported.decisions){const parsed=parseWatchKey(d.key),wantsS=d.target!=='trakt',wantsT=d.target!=='stremio',hasState=Object.hasOwn(s.states,d.key),present=Array.isArray(s.presentIds)?s.presentIds.includes(parsed.id):hasState,unresolved=(s.unknownIds??[]).includes(parsed.id)||(s.unresolvedKeys??[]).includes(d.key),nonWritable=(s.nonWritableKeys??[]).includes(d.key);
    if(wantsS){if(!present)skipped.push({key:d.key,target:'stremio',code:'STREMIO_ITEM_NOT_PRESENT'});else if(unresolved)skipped.push({key:d.key,target:'stremio',code:'STREMIO_WATCH_STATE_UNRESOLVED'});else if(nonWritable&&((s.states[d.key]===true)!==d.desired))skipped.push({key:d.key,target:'stremio',code:'STREMIO_WATCH_STATE_NONWRITABLE'});else if(!hasState&&!d.desired)skipped.push({key:d.key,target:'stremio',code:'STREMIO_STATE_UNKNOWN'});else if((s.states[d.key]===true)!==d.desired)operations.push({target:'stremio',key:d.key,desired:d.desired,watchedAt:t.dates?.[d.key]??null,manual:true});}
    if(wantsT){const current=t.states[d.key]===true;if(current!==d.desired)skipped.push({key:d.key,target:'trakt',code:'STREMIO_NATIVE_OUTBOUND_PENDING'});}
  }
  return {operations,skipped};
}
