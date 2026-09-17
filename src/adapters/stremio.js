import {assert,GuardError,hash,plain,itemKey} from '../core/util.js';
import {resilienceFor} from '../config.js';
const HOST='api.strem.io';
export class StremioAdapter {
  constructor(profile,store,http){Object.assign(this,{profile,store,http});this.resilience=resilienceFor(profile);this.atomicMetadataWrites=false;}
  configured(){return !!this.store.secret(this.profile.id,'stremioAuth');}
  async accountIdentity(){const user=await this.call('getUser');const id=user?._id??user?.id;assert(typeof id==='string'&&id.length>0,'STREMIO_ACCOUNT_ID_MISSING');return hash('stremio:'+id);}
  async call(endpoint,args={}){this.deadline?.();
    assert(['datastoreGet','datastorePut','getUser'].includes(endpoint),'STREMIO_ENDPOINT_BLOCKED');
    const authKey=this.store.secret(this.profile.id,'stremioAuth');assert(authKey,'STREMIO_NOT_CONNECTED');
    const retries=endpoint==='datastoreGet'||endpoint==='getUser'?this.resilience.readRetries:0;
    const {data}=await this.http.json(`https://${HOST}/api/${endpoint}`,{allowedHosts:[HOST],method:'POST',retries,timeout:this.resilience.requestTimeoutSeconds*1000,maxRetryAfterMs:this.resilience.maxRetryAfterSeconds*1000,body:{...args,authKey},limit:12_000_000});
    assert(plain(data)&&!data.error&&Object.hasOwn(data,'result'),'INVALID_STREMIO_RESPONSE',502);return data.result;
  }
  async library(ids=[]){
    const result=await this.call('datastoreGet',{collection:'libraryItem',ids,all:ids.length===0});
    const items=result;
    assert(Array.isArray(items),'INVALID_STREMIO_LIBRARY',502);assert(items.length<=20000,'LIBRARY_LIMIT',502);
    const found=new Set();for(const item of items){assert(plain(item)&&typeof item._id==='string'&&!found.has(item._id)&&plain(item.state),'INVALID_STREMIO_ITEM',502);found.add(item._id);}
    return structuredClone(items);
  }
  async item(id){const items=await this.library([id]);assert(items.length===1&&items[0]._id===id,'STREMIO_ITEM_MISSING');return items[0];}
  async write(item){itemKey(item.type,item._id);const result=await this.call('datastorePut',{collection:'libraryItem',changes:[item]});assert(result===true||result?.success===true,'STREMIO_WRITE_NOT_CONFIRMED',502);}
  identity(){return hash(this.store.secret(this.profile.id,'stremioAuth'));}
}
