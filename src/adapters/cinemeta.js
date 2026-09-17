import {assert,GuardError} from '../core/util.js';
import {resilienceFor} from '../config.js';
import {SourceCircuit} from '../core/resilience.js';
const HOST='v3-cinemeta.strem.io';
export class CinemetaAdapter{
 constructor(http,profile=null){this.http=http;this.resilience=resilienceFor(profile);this.circuit=new SourceCircuit({failureThreshold:this.resilience.sourceFailureThreshold,cooldownSeconds:this.resilience.sourceCooldownSeconds});}
 health(){return this.circuit.snapshot();}
 async seriesVideos(ids){
  assert(Array.isArray(ids)&&ids.length<=5000&&ids.every(id=>/^tt\d{5,12}$/.test(id)),'INVALID_SERIES_ID_LIST');this.circuit.require('cinemeta');const unique=[...new Set(ids)],out={};
  try{for(let i=0;i<unique.length;i+=100){this.deadline?.();const batch=unique.slice(i,i+100),url=`https://${HOST}/catalog/series/video-ids/imdbIds=${batch.join(',')}`;let response;try{response=await this.http.json(url,{allowedHosts:[HOST],limit:12_000_000,retries:this.resilience.readRetries,timeout:this.resilience.requestTimeoutSeconds*1000,maxRetryAfterMs:this.resilience.maxRetryAfterSeconds*1000});}catch(e){if(e.code==='UPSTREAM_404')throw new GuardError('CINEMETA_ENDPOINT_UNAVAILABLE',503);throw e;}const {data}=response;assert(Array.isArray(data?.metasDetailed),'INVALID_CINEMETA_VIDEO_INDEX',502);for(const meta of data.metasDetailed)if(/^tt\d{5,12}$/.test(meta?.id??'')&&batch.includes(meta.id)&&Array.isArray(meta.videos)){const videos=[];for(const raw of meta.videos){assert(typeof raw==='string','INVALID_CINEMETA_VIDEO_ID',502);const m=raw.match(/^(tt\d{5,12}):(\d+):(\d+)$/);assert(m&&m[1]===meta.id,'INVALID_CINEMETA_VIDEO_ID',502);videos.push({id:raw,season:Number(m[2]),episode:Number(m[3])});}out[meta.id]={id:meta.id,type:'series',videos};}}
   this.circuit.success('cinemeta');return out;
  }catch(e){this.circuit.failure('cinemeta',e);throw e;}
 }
}
