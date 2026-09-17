import {assert,GuardError,hash,parseWatchKey} from '../core/util.js';
import {resilienceFor} from '../config.js';

const HOST='www.strem.io';

export class TraktAdapter {
  constructor(profile,store,http,stremio){Object.assign(this,{profile,store,http,stremio});this.resilience=resilienceFor(profile);}
  configured(){const s=this.store.read(this.profile.id,'trakt-native-status',null);return !!this.stremio?.configured()&&s?.connected===true;}
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
    this.deadline?.();
    const {token,identity}=await this.stremioTrakt(),u=new URL(`https://${HOST}/trakt/watched.json`);
    u.searchParams.set('token',token);
    const {data}=await this.http.json(u.toString(),{allowedHosts:[HOST],retries:this.resilience.readRetries,timeout:this.resilience.requestTimeoutSeconds*1000,maxRetryAfterMs:this.resilience.maxRetryAfterSeconds*1000,limit:12_000_000});
    assert(Array.isArray(data),'INVALID_STREMIO_TRAKT_HISTORY',502);
    const buckets={};for(const row of data){assert(row&&typeof row.type==='string'&&Array.isArray(row.data),'INVALID_STREMIO_TRAKT_HISTORY',502);buckets[row.type]=row.data;}
    const movies=buckets.movies??[],shows=buckets.shows??[],states={},dates={},labels={};let unmapped=0;
    for(const e of movies){const imdb=e?.movie?.ids?.imdb;if(!/^tt\d{5,12}$/.test(imdb??'')){unmapped++;continue;}const key=`movie:${imdb}`;states[key]=true;labels[key]=e.movie?.title??imdb;if(e.last_watched_at)dates[key]=e.last_watched_at;}
    for(const e of shows){const imdb=e?.show?.ids?.imdb;if(!/^tt\d{5,12}$/.test(imdb??'')){unmapped++;continue;}assert(Array.isArray(e.seasons),'TRAKT_EPISODE_PROGRESS_MISSING',502);for(const season of e.seasons){assert(Number.isInteger(season?.number)&&Array.isArray(season.episodes),'TRAKT_SEASON_INVALID',502);for(const ep of season.episodes){assert(Number.isInteger(ep?.number),'TRAKT_EPISODE_INVALID',502);const key=`episode:${imdb}:${season.number}:${ep.number}`;parseWatchKey(key);states[key]=true;labels[key]=`${e.show?.title??imdb} · S${season.number}E${ep.number}`;if(ep.last_watched_at)dates[key]=ep.last_watched_at;}}}
    return {source:'trakt-via-stremio',mode:'stremio-native',identity,complete:true,states,dates,labels,unmapped,at:new Date().toISOString()};
  }
}