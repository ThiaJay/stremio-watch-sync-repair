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
test('scheduler never auto-applies a truncated plan',async()=>{
 const {p,rt,calls}=fixture();
 p.libraryRepair.writeEnabled=true;p.libraryRepair.allowNonAtomicAccountWrites=true;p.trakt.stremioWriteEnabled=true;
 rt.plan=async(_id,kind)=>{calls.push(kind);return {id:'plan',digest:'digest',operations:[kind==='repair'?{id:'tt12345'}:{key:'movie:tt12345',desired:true,dateEstimated:false}],conflicts:[],remaining:1};};
 await Runtime.prototype.scheduledPass.call(rt,p,new Map(),1);
 assert.deepEqual(calls,['watched','repair','sync']);
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
