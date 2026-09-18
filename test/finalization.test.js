import test from 'node:test';
import assert from 'node:assert/strict';
import {Runtime} from '../src/runtime.js';
import {defaultProfile} from '../src/config.js';
import {snapshotItem} from '../src/modules/watched.js';
import {item,meta} from './helpers.js';
function fixture(){
 const p=defaultProfile();
 p.modules.watchedState=true;p.modules.libraryRepair=true;p.modules.traktBridge=true;
 const calls=[];
 const rt={generation:1,config:{server:{scheduleEnabled:true}},refresh:async()=>{calls.push('watched');},plan:async(_id,kind)=>{calls.push(kind);return {operations:[],conflicts:[]};},apply:async()=>{calls.push('write');}};
 return {p,rt,calls};
}
test('a failed scheduled module does not prevent the next module from running',async()=>{
 const {p,rt,calls}=fixture();rt.refresh=async()=>{calls.push('watched');throw new Error('fixture source failure');};
 await Runtime.prototype.scheduledPass.call(rt,p,new Map(),1);
 assert.deepEqual(calls,['watched','repair','sync']);
});
test('scheduler honours separate module intervals',async()=>{
 const {p,rt,calls}=fixture();const due=new Map([['watchedState',Date.now()+60000],['libraryRepair',Date.now()+60000]]);
 await Runtime.prototype.scheduledPass.call(rt,p,due,1);
 assert.deepEqual(calls,['sync']);
});
test('disabling a scheduler generation stops queued work',async()=>{
 const {p,rt,calls}=fixture();rt.refresh=async()=>{calls.push('watched');rt.generation++;};
 await Runtime.prototype.scheduledPass.call(rt,p,new Map(),1);
 assert.deepEqual(calls,['watched']);
});
test('scheduler keeps truncated metadata repair manual but advances safe watched repairs in bounded batches',async()=>{
 const {p,rt,calls}=fixture();
 p.libraryRepair.writeEnabled=true;p.libraryRepair.allowNonAtomicAccountWrites=true;p.trakt.stremioWriteEnabled=true;
 rt.plan=async(_id,kind)=>{calls.push(kind);return {id:'plan',digest:'digest',operations:[kind==='repair'?{id:'tt12345'}:{target:'stremio',key:'movie:tt12345',desired:true}],conflicts:[],remaining:1};};
 await Runtime.prototype.scheduledPass.call(rt,p,new Map(),1);
 assert.deepEqual(calls,['watched','repair','sync','write']);
});
test('scheduler requests a short continuation after applying a partial watched batch',async()=>{
 const {p,rt}=fixture();p.modules.watchedState=false;p.modules.libraryRepair=false;p.trakt.stremioWriteEnabled=true;
 rt.plan=async()=>({id:'plan',digest:'digest',operations:[{target:'stremio',key:'movie:tt12345',desired:true}],conflicts:[],remaining:5});
 rt.apply=async()=>({});
 const due=new Map(),before=Date.now();await Runtime.prototype.scheduledPass.call(rt,p,due,1);const delay=due.get('traktBridge')-before;
 assert.ok(delay>=29000&&delay<=32000,delay);
});
test('scheduler may auto-apply a complete positive sync plan',async()=>{
 const {p,rt,calls}=fixture();p.modules.watchedState=false;p.modules.libraryRepair=false;p.trakt.stremioWriteEnabled=true;
 rt.plan=async(_id,kind)=>{calls.push(kind);return {id:'plan',digest:'digest',operations:[{target:'stremio',key:'movie:tt12345',desired:true}],conflicts:[],remaining:0};};
 await Runtime.prototype.scheduledPass.call(rt,p,new Map(),1);
 assert.deepEqual(calls,['sync','write']);
});test('a series timestamp is never fabricated as an individual episode watch date',()=>{
 const row=item(),metadata=meta();row.state.lastWatched='2026-01-01T00:00:00.000Z';
 const snapshot=snapshotItem(row,metadata);
 assert.deepEqual(snapshot.dates,{});
});

test('scheduler auto-applies a confirmed inbound unwatch only when explicitly enabled',async()=>{const {p,rt,calls}=fixture();p.modules.watchedState=false;p.modules.libraryRepair=false;p.trakt.stremioWriteEnabled=true;p.trakt.autoApplyConfirmedUnwatch=true;rt.plan=async(_id,kind)=>{calls.push(kind);return {id:'plan',digest:'digest',operations:[{target:'stremio',key:'movie:tt12345',desired:false}],conflicts:[],remaining:0};};rt.apply=async(_id,_plan,_digest,ack)=>{calls.push(ack?.ackRemovals===true?'unwatch-write':'unsafe-write');};await Runtime.prototype.scheduledPass.call(rt,p,new Map(),1);assert.deepEqual(calls,['sync','unwatch-write']);});
test('scheduler leaves confirmed inbound unwatch for review when automatic unwatch is disabled',async()=>{const {p,rt,calls}=fixture();p.modules.watchedState=false;p.modules.libraryRepair=false;p.trakt.stremioWriteEnabled=true;p.trakt.autoApplyConfirmedUnwatch=false;rt.plan=async(_id,kind)=>{calls.push(kind);return {id:'plan',digest:'digest',operations:[{target:'stremio',key:'movie:tt12345',desired:false}],conflicts:[],remaining:0};};await Runtime.prototype.scheduledPass.call(rt,p,new Map(),1);assert.deepEqual(calls,['sync']);});

test('one-shot reconciliation policy never authorises removals or direct Trakt writes',()=>{const p=defaultProfile();p.trakt.stremioWriteEnabled=true;p.trakt.syncMarkUnwatched=false;p.trakt.autoApplyConfirmedUnwatch=false;assert.equal(p.trakt.syncMarkUnwatched,false);assert.equal(p.trakt.autoApplyConfirmedUnwatch,false);});
