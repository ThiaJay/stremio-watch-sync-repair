import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {assert,GuardError,sleep} from './util.js';
export function publicAddress(address) {
  if(net.isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
  if(net.isIP(address)===6){const a=address.toLowerCase();return /^[23][0-9a-f]{3}:/.test(a)&&!a.startsWith('2001:db8:')&&!(a.startsWith('2001:')&&parseInt(a.split(':')[1]||'0',16)<512)&&!a.startsWith('2002:')&&!a.startsWith('3fff:');}
  return false;
}
export async function resolveSafe(raw,allowedHosts,lookup=dns.lookup) {
  let u;try{u=new URL(raw);}catch{throw new GuardError('INVALID_REMOTE_URL');}
  assert(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443'),'UNSAFE_REMOTE_URL');
  assert(allowedHosts.includes(u.hostname.toLowerCase()),'REMOTE_HOST_NOT_ALLOWED');
  const records=await lookup(u.hostname,{all:true,verbatim:true});assert(records.length>0&&records.every(r=>publicAddress(r.address)),'PRIVATE_NETWORK_BLOCKED');return {url:u,record:records[0]};
}
export class HttpClient {
  constructor({maxConcurrent=6,lookup=dns.lookup,transport=https.request}={}){this.active=0;this.maxConcurrent=maxConcurrent;this.lookup=lookup;this.transport=transport;}
  async request(raw,{allowedHosts=[],method='GET',headers={},body,limit=8_000_000,timeout=15000,retries=method==='GET'?1:0,maxRetryAfterMs=60000,captureRedirectHosts=[]}={}) {
    assert(this.active<this.maxConcurrent,'REMOTE_BUSY',503);this.active++;
    try{for(let n=0;;n++){
      try{return await this.once(raw,{allowedHosts,method,headers,body,limit,timeout,captureRedirectHosts});}
      catch(e){if(n>=retries||!['UPSTREAM_429','UPSTREAM_502','UPSTREAM_503','UPSTREAM_529','REMOTE_TIMEOUT','REMOTE_NETWORK'].includes(e.code))throw e;const backoff=Number.isFinite(e.retryAfterMs)?Math.max(250,Math.min(e.retryAfterMs,maxRetryAfterMs)):Math.min(1500*(n+1),5000);await sleep(backoff);}
    }}finally{this.active--;}
  }
  async once(raw,{allowedHosts,method,headers,body,limit,timeout,captureRedirectHosts=[]}) {
    // DNS pinning prevents a checked public hostname being rebound to a private address at connect time.
    let dnsTimer; const {url,record}=await Promise.race([resolveSafe(raw,allowedHosts,this.lookup),new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(new GuardError('REMOTE_TIMEOUT',504)),timeout);})]).finally(()=>clearTimeout(dnsTimer));
    const data=body===undefined?undefined:Buffer.from(JSON.stringify(body));
    return new Promise((resolve,reject)=>{
      let done=false,timer;const finish=(e,v)=>{if(done)return;done=true;clearTimeout(timer);e?reject(e):resolve(v);};
      const req=this.transport(url,{method,servername:url.hostname,lookup:(_h,o,cb)=>o?.all?cb(null,[record]):cb(null,record.address,record.family),headers:{accept:'application/json','accept-encoding':'identity','user-agent':'Stremio-Watch-Sync-Repair/1.0',...headers,...(data?{'content-type':'application/json','content-length':data.length}:{})}},res=>{
        if(res.statusCode>=300&&res.statusCode<400){
          try{const location=res.headers.location;assert(captureRedirectHosts.length&&typeof location==='string','REDIRECT_BLOCKED',502);const target=new URL(location,url);assert(target.protocol==='https:'&&!target.username&&!target.password&&!target.hash&&(!target.port||target.port==='443')&&captureRedirectHosts.includes(target.hostname.toLowerCase()),'UNSAFE_REDIRECT',502);res.resume();return finish(null,{status:res.statusCode,headers:res.headers,buffer:Buffer.alloc(0)});}catch(e){res.resume();return finish(e);}
        }
        if(res.statusCode<200||res.statusCode>=300){const error=new GuardError(`UPSTREAM_${res.statusCode}`,502),retryAfter=res.headers['retry-after'];if(retryAfter!==undefined){const seconds=Number(retryAfter),date=Date.parse(String(retryAfter));const ms=Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?Math.max(0,date-Date.now()):NaN;if(Number.isFinite(ms))error.retryAfterMs=ms;}res.resume();return finish(error);}
        if(res.headers['content-encoding']&&!['identity'].includes(res.headers['content-encoding'])){res.resume();return finish(new GuardError('ENCODING_BLOCKED',502));}
        if(Number(res.headers['content-length'])>limit){res.destroy();return finish(new GuardError('REMOTE_TOO_LARGE',502));}
        let size=0;const chunks=[];res.on('data',b=>{size+=b.length;if(size>limit){res.destroy();finish(new GuardError('REMOTE_TOO_LARGE',502));}else chunks.push(b);});
        res.on('error',()=>finish(new GuardError('REMOTE_NETWORK',502)));res.on('aborted',()=>finish(new GuardError('REMOTE_NETWORK',502)));
        res.on('end',()=>finish(null,{status:res.statusCode,headers:res.headers,buffer:Buffer.concat(chunks)}));
      });
      timer=setTimeout(()=>{req.destroy();finish(new GuardError('REMOTE_TIMEOUT',504));},timeout);
      req.on('error',()=>finish(new GuardError('REMOTE_NETWORK',502)));if(data)req.write(data);req.end();
    });
  }
  async json(url,options={}){const r=await this.request(url,options);try{return {...r,data:r.buffer.length?JSON.parse(r.buffer.toString('utf8')):null};}catch{throw new GuardError('INVALID_UPSTREAM_JSON',502);}}
}
