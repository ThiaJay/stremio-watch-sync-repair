import {GuardError} from './util.js';

export const TRANSIENT_SOURCE_CODES=new Set([
 'UPSTREAM_408','UPSTREAM_425','UPSTREAM_429','UPSTREAM_500','UPSTREAM_502','UPSTREAM_503','UPSTREAM_504','UPSTREAM_529',
 'REMOTE_TIMEOUT','REMOTE_NETWORK','REMOTE_BUSY','INVALID_UPSTREAM_JSON','CINEMETA_ENDPOINT_UNAVAILABLE','STREMIO_TRAKT_ENDPOINT_UNAVAILABLE'
]);
export function transientSourceError(error){return TRANSIENT_SOURCE_CODES.has(error?.code);}
export class SourceCircuit{
 constructor({failureThreshold=3,cooldownSeconds=120,now=()=>Date.now()}={}){this.threshold=failureThreshold;this.cooldownMs=cooldownSeconds*1000;this.now=now;this.rows=new Map();}
 state(name){const row=this.rows.get(name)??{failures:0,openUntil:0,lastError:null,lastSuccess:null};if(row.openUntil&&row.openUntil<=this.now()){row.openUntil=0;row.failures=0;}return row;}
 available(name){return this.state(name).openUntil===0;}
 success(name){const row=this.state(name);row.failures=0;row.openUntil=0;row.lastError=null;row.lastSuccess=new Date(this.now()).toISOString();this.rows.set(name,row);}
 failure(name,error){const row=this.state(name);row.lastError=error?.code??'SOURCE_FAILED';if(transientSourceError(error)){row.failures++;if(row.failures>=this.threshold)row.openUntil=this.now()+this.cooldownMs;}this.rows.set(name,row);}
 require(name){if(!this.available(name)){const e=new GuardError('SOURCE_COOLDOWN',503);e.source=name;e.retryAfterMs=Math.max(0,this.state(name).openUntil-this.now());throw e;}}
 snapshot(){return Object.fromEntries([...this.rows].map(([name,row])=>[name,{...this.state(name)}]));}
}
