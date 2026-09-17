import {assert,GuardError} from '../core/util.js';
const HOST='link.stremio.com';
const API=`https://${HOST}/api/v2`;
export class StremioPairing{
  constructor(profile,store,http){Object.assign(this,{profile,store,http});}
  async begin(){
    const {data}=await this.http.json(`${API}/create?type=Create`,{allowedHosts:[HOST],retries:0});
    assert(!data?.error,'PAIRING_SERVICE_REJECTED');
    const r=data?.result;
    assert(typeof r?.code==='string'&&/^[A-Za-z0-9_-]{4,256}$/.test(r.code)&&typeof r?.link==='string','PAIRING_RESPONSE_INVALID');
    const u=new URL(r.link);
    assert(u.protocol==='https:'&&!u.username&&!u.password&&['link.stremio.com','stremio.com','www.stremio.com','web.stremio.com'].includes(u.hostname),'PAIRING_URL_INVALID');
    this.store.write(this.profile.id,'stremio-pairing',{code:r.code,expires:Date.now()+600000,lastPoll:0});
    return {code:r.code,url:u.toString(),expiresIn:600};
  }
  async poll(){
    const pid=this.profile.id,p=this.store.read(pid,'stremio-pairing');
    assert(p&&p.expires>Date.now(),'PAIRING_EXPIRED');
    assert(Date.now()-p.lastPoll>=5000,'PAIRING_POLL_TOO_FAST',429);
    p.lastPoll=Date.now();this.store.write(pid,'stremio-pairing',p);
    const {data}=await this.http.json(`${API}/read?type=Read&code=${encodeURIComponent(p.code)}`,{allowedHosts:[HOST],retries:0});
    // The public pairing service returns 101 while a fresh code is not yet authorised.
    if(data?.error?.code===101)return {connected:false,pending:true};
    assert(!data?.error,'PAIRING_SERVICE_REJECTED');
    assert(typeof data?.result?.authKey==='string'&&data.result.authKey.length>10,'PAIRING_RESPONSE_INVALID');
    this.store.setSecret(pid,'stremioAuth',data.result.authKey);
    this.store.write(pid,'stremio-pairing',null);
    return {connected:true};
  }
}
