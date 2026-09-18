import crypto from 'node:crypto';
export class GuardError extends Error { constructor(code,status=400){super(code);this.name='GuardError';this.code=code;this.status=status;} }
export function assert(value,code='ASSERTION_FAILED',status=400){if(!value)throw new GuardError(code,status);}
export const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&[Object.prototype,null].includes(Object.getPrototypeOf(x));
export const clone=x=>structuredClone(x);
export function rejectPoison(x,depth=0){assert(depth<50,'DATA_TOO_DEEP');if(x&&typeof x==='object'){for(const k of Object.keys(x)){assert(!['__proto__','prototype','constructor'].includes(k),'UNSAFE_OBJECT_KEY');rejectPoison(x[k],depth+1);}}}
export function stable(x){if(Array.isArray(x))return x.map(stable);if(plain(x))return Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,stable(x[k])]));return x;}
export const canonical=x=>JSON.stringify(stable(x));
export const equal=(a,b)=>canonical(a)===canonical(b);
export const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:canonical(x)??'undefined').digest('hex');
export const randomToken=()=>crypto.randomBytes(32).toString('base64url');
export function secureEqual(a,b){const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function itemKey(type,id){assert(['movie','series'].includes(type)&&/^tt\d{5,12}$/.test(id),'INVALID_MEDIA_ID');return `${type}:${id}`;}
export function parseWatchKey(key){const p=String(key).split(':');assert(/^tt\d{5,12}$/.test(p[1]),'INVALID_WATCH_ID');if(p[0]==='movie'&&p.length===2)return {kind:'movie',type:'movie',id:p[1]};assert(p[0]==='episode'&&p.length===4&&/^\d+$/.test(p[2])&&/^\d+$/.test(p[3]),'INVALID_EPISODE_KEY');const season=+p[2],episode=+p[3];assert(season>=0&&season<=99999&&episode>=1&&episode<=100000,'INVALID_EPISODE_NUMBER');return {kind:'episode',type:'series',id:p[1],season,episode};}
export function episodeInfo(v){const s=v?.seriesInfo??v?.series_info??v;if(Number.isInteger(s?.season)&&Number.isInteger(s?.episode)&&s.season>=0&&s.episode>=1)return {season:s.season,episode:s.episode};return null;}
export function validateMeta(meta,type,id){itemKey(type,id);assert(plain(meta)&&meta.id===id&&meta.type===type&&typeof meta.name==='string'&&meta.name.length<=1000,'METADATA_IDENTITY_MISMATCH',502);rejectPoison(meta);if(meta.posterShape!==undefined)assert(['poster','landscape','square'].includes(meta.posterShape),'INVALID_POSTER_SHAPE');if(meta.videos!==undefined){assert(Array.isArray(meta.videos)&&meta.videos.length<=10000,'INVALID_VIDEO_LIST');const ids=new Set();for(const v of meta.videos){assert(plain(v)&&typeof v.id==='string'&&!ids.has(v.id),'INVALID_VIDEO_ID');ids.add(v.id);}}return meta;}
export class BoundedCache{constructor(max=200){this.max=max;this.map=new Map();}get(k){const v=this.map.get(k);if(!v||v.until<Date.now()){this.map.delete(k);return undefined;}return clone(v.value);}set(k,value,ttl=60000){this.map.delete(k);this.map.set(k,{value:clone(value),until:Date.now()+ttl});while(this.map.size>this.max)this.map.delete(this.map.keys().next().value);}clear(){this.map.clear();}}
export class Mutex{constructor(){this.keys=new Set();}async run(key,fn){assert(!this.keys.has(key),'OPERATION_BUSY',409);this.keys.add(key);try{return await fn();}finally{this.keys.delete(key);}}}
export function redact(x){if(Array.isArray(x))return x.map(redact);if(plain(x))return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,/secret|token|auth|password|url|state|watch|header|body/i.test(k)?'<redacted>':redact(v)]));if(typeof x==='string'&&(/https?:\/\//.test(x)||/Bearer\s/i.test(x)))return '<redacted>';return x;}
export const safeError=e=>e instanceof GuardError?e.code:'INTERNAL_ERROR';
