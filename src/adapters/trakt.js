import {assert,GuardError,hash,parseWatchKey} from '../core/util.js';
import {resilienceFor} from '../config.js';
import {SourceCircuit} from '../core/resilience.js';

const HOST='www.strem.io';
function validWatchedAt(v){return typeof v==='string'&&v.length<=64&&Number.isFinite(Date.parse(v));}

export class TraktAdapter {
  constructor(profile,store,http,stremio){
    Object.assign(this,{profile,store,http,stremio});
    this.resilience=resilienceFor(profile);
    this.circuit=new SourceCircuit({failureThreshold:this.resilience.sourceFailureThreshold,cooldownSeconds:this.resilience.sourceCooldownSeconds});
  }
  configured(){const s=this.store.read(this.profile.id,'trakt-native-status',null);return !!this.stremio?.configured()&&s?.connected===true;}
  health(){return {mode:'stremio-native',circuits:this.circuit.snapshot()};}
  async stremioTrakt(){
    assert(this.stremio?.configured(),'STREMIO_NOT_CONNECTED');
    const user=await this.stremio.call('getUser'),uid=user?._id??user?.id,trakt=user?.trakt;
    assert(typeof uid==='string'&&uid.length>0,'STREMIO_ACCOUNT_ID_MISSING');
    if(typeof trakt?.access_token!=='string'||trakt.access_token.length<20){
      this.store.write(this.profile.id,'trakt-native-status',{connected:false,checkedAt:new Date().toISOString(),reason:'TRAKT_NOT_CONNECTED'});
      throw new GuardError('TRAKT_NOT_CONNECTED',409);
    }
    const explicitExpires=Number(trakt.expires_at),created=Number(trakt.created_at),expiresIn=Number(trakt.expires_in),expires=Number.isFinite(explicitExpires)&&explicitExpires>0?explicitExpires:(Number.isFinite(created)&&Number.isFinite(expiresIn)?created+expiresIn:NaN);
    if(Number.isFinite(expires)&&expires>0&&expires<=Date.now()/1000){
      this.store.write(this.profile.id,'trakt-native-status',{connected:false,checkedAt:new Date().toISOString(),reason:'TRAKT_STREMIO_REAUTH_REQUIRED'});
      throw new GuardError('TRAKT_STREMIO_REAUTH_REQUIRED',409);
    }
    const identity=hash('stremio-native-trakt:'+uid+':'+(Number.isFinite(created)?created:'unknown'));
    this.store.write(this.profile.id,'trakt-native-status',{connected:true,checkedAt:new Date().toISOString(),identity});
    return {uid,token:trakt.access_token,identity};
  }
  async beginNative(){
    assert(this.stremio?.configured(),'STREMIO_NOT_CONNECTED');
    const user=await this.stremio.call('getUser'),uid=user?._id??user?.id;
    assert(typeof uid==='string'&&uid.length>0,'STREMIO_ACCOUNT_ID_MISSING');
    return {url:`https://www.strem.io/trakt/auth/${encodeURIComponent(uid)}`,mode:'stremio-native'};
  }
  async pollNative(){
    try{const x=await this.stremioTrakt();return {connected:true,mode:'stremio-native',identity:x.identity};}
    catch(e){if(['TRAKT_NOT_CONNECTED','TRAKT_STREMIO_REAUTH_REQUIRED'].includes(e.code))return {connected:false,pending:true,mode:'stremio-native',reason:e.code};throw e;}
  }
  async snapshot(){
    this.deadline?.();const source='stremio-native-trakt';this.circuit.require(source);
    let auth;try{auth=await this.stremioTrakt();}catch(e){this.circuit.failure(source,e);throw e;}
    const {token,identity}=auth,u=new URL(`https://${HOST}/trakt/watched.json`);u.searchParams.set('token',token);let response;
    try{response=await this.http.json(u.toString(),{allowedHosts:[HOST],retries:this.resilience.readRetries,timeout:this.resilience.requestTimeoutSeconds*1000,maxRetryAfterMs:this.resilience.maxRetryAfterSeconds*1000,limit:12_000_000});}
    catch(e){const err=e.code==='UPSTREAM_404'?new GuardError('STREMIO_TRAKT_ENDPOINT_UNAVAILABLE',503):e;this.circuit.failure(source,err);this.store.audit(this.profile.id,'traktBridge','nativeHistorySourceFailed',{code:err.code??'SOURCE_FAILED'});throw err;}
    this.circuit.success(source);const {data}=response;
    assert(Array.isArray(data)&&data.length<=20,'INVALID_STREMIO_TRAKT_HISTORY',502);
    const buckets={};for(const row of data){assert(row&&typeof row.type==='string'&&Array.isArray(row.data),'INVALID_STREMIO_TRAKT_HISTORY',502);assert(!Object.hasOwn(buckets,row.type),'DUPLICATE_STREMIO_TRAKT_BUCKET',502);buckets[row.type]=row.data;}
    assert(Array.isArray(buckets.movies)&&Array.isArray(buckets.shows),'INCOMPLETE_STREMIO_TRAKT_HISTORY',503);
    const movies=buckets.movies,shows=buckets.shows;assert(movies.length<=100000&&shows.length<=100000,'STREMIO_TRAKT_HISTORY_LIMIT',502);const states={},dates={},labels={};let unmapped=0,seen=new Set();
    for(const e of movies){const imdb=e?.movie?.ids?.imdb;if(!/^tt\d{5,12}$/.test(imdb??'')){unmapped++;continue;}const key=`movie:${imdb}`;assert(!seen.has(key),'DUPLICATE_STREMIO_TRAKT_ITEM',502);seen.add(key);states[key]=true;labels[key]=e.movie?.title??imdb;if(e.last_watched_at!==undefined&&e.last_watched_at!==null){assert(validWatchedAt(e.last_watched_at),'INVALID_TRAKT_WATCHED_AT',502);dates[key]=e.last_watched_at;}}
    for(const e of shows){const imdb=e?.show?.ids?.imdb;if(!/^tt\d{5,12}$/.test(imdb??'')){unmapped++;continue;}assert(Array.isArray(e.seasons)&&e.seasons.length<=10000,'TRAKT_EPISODE_PROGRESS_MISSING',502);for(const season of e.seasons){assert(Number.isInteger(season?.number)&&season.number>=0&&season.number<=99999&&Array.isArray(season.episodes)&&season.episodes.length<=100000,'TRAKT_SEASON_INVALID',502);for(const ep of season.episodes){assert(Number.isInteger(ep?.number)&&ep.number>=1&&ep.number<=100000,'TRAKT_EPISODE_INVALID',502);const key=`episode:${imdb}:${season.number}:${ep.number}`;parseWatchKey(key);assert(!seen.has(key),'DUPLICATE_STREMIO_TRAKT_ITEM',502);seen.add(key);states[key]=true;labels[key]=`${e.show?.title??imdb} · S${season.number}E${ep.number}`;if(ep.last_watched_at!==undefined&&ep.last_watched_at!==null){assert(validWatchedAt(ep.last_watched_at),'INVALID_TRAKT_WATCHED_AT',502);dates[key]=ep.last_watched_at;}}}}
    return {source:'trakt-via-stremio',mode:'stremio-native',identity,identityScheme:'stremio-native-trakt-v1',complete:true,states,dates,labels,unmapped,at:new Date().toISOString()};
  }
}
