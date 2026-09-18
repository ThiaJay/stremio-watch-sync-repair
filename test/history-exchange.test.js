import test from 'node:test';
import a from 'node:assert/strict';
import {historyBundle,historyCsv,parseHistoryImport,manualOperations,HISTORY_SCHEMA,parseCsv} from '../src/modules/history-exchange.js';
const key='episode:tt1234567:1:1';
const movie='movie:tt7654321';
const snap=(identity,states,complete=true,dates={},labels={})=>({identity,states,complete,dates,labels,at:'2026-09-17T00:00:00.000Z'});

function editCsv(csv,keyName,patch){
 const lines=csv.trimEnd().split('\r\n'),head=lines[0].split(','),cells=lines.find(x=>x.startsWith(keyName+',')).split(',');
 for(const [name,value] of Object.entries(patch))cells[head.indexOf(name)]=value;
 return lines[0]+'\r\n'+cells.join(',')+'\r\n';
}

test('history export compares both sources without secrets and includes human labels',()=>{const b=historyBundle(snap('stremio-account',{[key]:true,[movie]:false},true,{}, {[key]:'Example ? S1E1 ? Pilot'}),snap('trakt-account',{[movie]:true},true,{[movie]:'2026-01-01T00:00:00.000Z'},{[movie]:'Movie title'}));a.equal(b.schema,HISTORY_SCHEMA);a.equal(b.rows.find(r=>r.key===key).status,'stremio-only');a.equal(b.rows.find(r=>r.key===key).title,'Example ? S1E1 ? Pilot');a.equal(b.rows.find(r=>r.key===movie).status,'trakt-only');a.equal(b.rows.find(r=>r.key===movie).title,'Movie title');const text=JSON.stringify(b);a.ok(!/access_token|refresh_token|authorization|bearer/i.test(text));});

test('CSV export can be edited and imported as explicit decisions',()=>{const b=historyBundle(snap('s',{[key]:true}),snap('t',{}));const text=editCsv(historyCsv(b),key,{desired:'unwatched',target:'both',note:'manual correction'});const p=parseHistoryImport(text,'csv');a.deepEqual(p.decisions,[{key,desired:false,target:'both',note:'manual correction'}]);a.equal(p.sources.stremio.identity,'s');a.equal(p.sources.trakt.identity,'t');});

test('new CSV identity columns prevent accidental import into different accounts',()=>{const b=historyBundle(snap('s1',{[key]:true}),snap('t1',{}));const text=editCsv(historyCsv(b),key,{desired:'watched'}),p=parseHistoryImport(text,'csv');a.throws(()=>manualOperations(p,snap('s2',{[key]:false}),snap('t1',{})),/STREMIO_EXPORT_ACCOUNT_CHANGED/);});

test('legacy CSV without identity columns remains importable but is fresh-state validated',()=>{const text=`key,desired,target,note\r\n${key},watched,both,legacy\r\n`,p=parseHistoryImport(text,'csv');a.equal(p.sources,null);a.deepEqual(p.decisions,[{key,desired:true,target:'both',note:'legacy'}]);});

test('JSON import preserves account identities and rejects an account change',()=>{const b=historyBundle(snap('s1',{[key]:true}),snap('t1',{}));b.rows[0].desired='watched';const p=parseHistoryImport(JSON.stringify(b),'json');a.throws(()=>manualOperations(p,snap('s2',{[key]:false}),snap('t1',{})),/STREMIO_EXPORT_ACCOUNT_CHANGED/);});

test('manual import never creates a missing Stremio item or directly writes Trakt',()=>{const imported={schema:HISTORY_SCHEMA,sources:null,decisions:[{key,desired:true,target:'both',note:''}]};const r=manualOperations(imported,snap('s',{}),snap('t',{}));a.deepEqual(r.operations,[]);a.ok(r.skipped.some(x=>x.target==='stremio'&&x.code==='STREMIO_ITEM_NOT_PRESENT'));a.ok(r.skipped.some(x=>x.target==='trakt'&&x.code==='STREMIO_NATIVE_OUTBOUND_PENDING'));});

test('unknown source state cannot be converted into an unwatched decision automatically',()=>{const b=historyBundle(snap('s',{},false),snap('t',{},true));a.equal(b.rows.length,0);const imported={schema:HISTORY_SCHEMA,sources:null,decisions:[{key,desired:false,target:'both',note:''}]};a.throws(()=>manualOperations(imported,snap('s',{[key]:true},false),snap('t',{[key]:true},true)),/INCOMPLETE_WATCHED_SOURCE/);});

test('duplicate and malformed imported keys fail closed',()=>{const bad=`key,desired,target\n${key},watched,both\n${key},unwatched,both\n`;a.throws(()=>parseHistoryImport(bad,'csv'),/DUPLICATE_HISTORY_KEY/);const malformed=`key,desired,target\nepisode:not-an-imdb:1:1,watched,both\n`;a.throws(()=>parseHistoryImport(malformed,'csv'),/INVALID_WATCH_ID/);});

test('malformed CSV column counts and conflicting account identities fail closed',()=>{a.throws(()=>parseHistoryImport(`key,desired,target\r\n${key},watched,both,extra\r\n`,'csv'),/COLUMN_COUNT/);const b=historyBundle(snap('s',{[key]:true,[movie]:false}),snap('t',{})),rows=parseCsv(historyCsv(b));rows[1].stremioIdentity='other';const head=Object.keys(rows[0]);const forged=head.join(',')+'\r\n'+rows.map(r=>head.map(k=>r[k]).join(',')).join('\r\n')+'\r\n';a.throws(()=>parseHistoryImport(forged,'csv'),/IDENTITY_CONFLICT/);});

test('CSV export neutralises spreadsheet formula prefixes',()=>{const b=historyBundle(snap('s',{[key]:true},true,{}, {[key]:'=HYPERLINK("bad")'}),snap('t',{}));const csv=historyCsv(b);a.ok(csv.includes("'=HYPERLINK"));});

test('differences-only CSV contains review rows but omits rows already equal',()=>{const equal='movie:tt1111111',b=historyBundle(snap('s',{[key]:true,[equal]:true}),snap('t',{[equal]:true}));const csv=historyCsv(b,{differencesOnly:true});a.ok(csv.includes(key));a.ok(!csv.includes(equal));});

test('same complete snapshots need no manual operations when decision already matches',()=>{const imported={schema:HISTORY_SCHEMA,sources:null,decisions:[{key,desired:true,target:'both',note:''}]};const r=manualOperations(imported,snap('s',{[key]:true}),snap('t',{[key]:true}));a.equal(r.operations.length,0);a.equal(r.skipped.length,0);});

test('manual watched import can target an existing Stremio series before it has a local bitmap',()=>{const imported={schema:HISTORY_SCHEMA,sources:null,decisions:[{key,desired:true,target:'stremio',note:''}]};const s={...snap('s',{}),presentIds:['tt1234567'],unknownIds:[]};const r=manualOperations(imported,s,snap('t',{}));a.deepEqual(r.operations,[{target:'stremio',key,desired:true,watchedAt:null,manual:true}]);});

test('manual import never writes an unresolved Stremio series or bypasses native Trakt ownership',()=>{const imported={schema:HISTORY_SCHEMA,sources:null,decisions:[{key,desired:true,target:'both',note:''}]};const s={...snap('s',{}),presentIds:['tt1234567'],unknownIds:['tt1234567']};const r=manualOperations(imported,s,snap('t',{}));a.equal(r.operations.length,0);a.ok(r.skipped.some(x=>x.code==='STREMIO_WATCH_STATE_UNRESOLVED'));a.ok(r.skipped.some(x=>x.target==='trakt'&&x.code==='STREMIO_NATIVE_OUTBOUND_PENDING'));});

test('ambiguous Stremio episode state exports as unknown and cannot be forced through manual import',()=>{const key='episode:tt1234567:0:2',s={source:'stremio',identity:'s',complete:true,states:{[key]:false},unresolvedKeys:[key],labels:{}},t={source:'trakt',identity:'t',complete:true,states:{[key]:true},labels:{}},bundle=historyBundle(s,t);a.equal(bundle.rows[0].stremio,null);a.equal(bundle.rows[0].status,'unknown');const imported={schema:HISTORY_SCHEMA,decisions:[{key,desired:true,target:'stremio',note:''}]},r=manualOperations(imported,s,t);a.equal(r.operations.length,0);a.equal(r.skipped[0].code,'STREMIO_WATCH_STATE_UNRESOLVED');});
