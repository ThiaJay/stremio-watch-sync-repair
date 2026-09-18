import test from 'node:test';
import a from 'node:assert/strict';
import {fixture} from './helpers.js';
import {TraktAdapter} from '../src/adapters/trakt.js';

const TOKEN='stremio-owned-linked-token-that-is-long-enough';
function stremio({token=TOKEN,expires=Math.floor(Date.now()/1000)+3600}={}){
 return {configured:()=>true,call:async method=>{a.equal(method,'getUser');return {_id:'user-123456',trakt:token?{access_token:token,expires_at:expires}:null};}};
}

test('native Trakt connect opens Stremio authorisation and needs no developer application',async t=>{
 const f=fixture(t),api=new TraktAdapter(f.profile,f.store,{},stremio());
 const r=await api.beginNative();
 a.equal(r.mode,'stremio-native');
 a.equal(r.url,'https://www.strem.io/trakt/auth/user-123456');
 for(const name of ['traktClientId','traktClientSecret','traktAccessToken','traktRefreshToken'])a.equal(f.store.secret('main',name),'');
});

test('native Trakt snapshot reads history only through the Stremio Trakt proxy',async t=>{
 const f=fixture(t);let seen;
 const http={json:async(url,opts)=>{seen={url,opts};return {data:[
  {type:'movies',data:[{movie:{title:'Film',ids:{imdb:'tt1234567'}},last_watched_at:'2026-01-01T00:00:00.000Z'}]},
  {type:'shows',data:[{show:{title:'Series',ids:{imdb:'tt7654321'}},seasons:[{number:1,episodes:[{number:2,last_watched_at:'2026-02-01T00:00:00.000Z'}]}]}]}
 ]};}};
 const api=new TraktAdapter(f.profile,f.store,http,stremio()),r=await api.snapshot();
 const u=new URL(seen.url);a.equal(u.origin,'https://www.strem.io');a.equal(u.pathname,'/trakt/watched.json');a.equal(u.searchParams.get('token'),TOKEN);
 a.deepEqual(seen.opts.allowedHosts,['www.strem.io']);
 a.equal(r.states['movie:tt1234567'],true);a.equal(r.states['episode:tt7654321:1:2'],true);a.equal(r.mode,'stremio-native');
 for(const name of ['traktClientId','traktClientSecret','traktAccessToken','traktRefreshToken'])a.equal(f.store.secret('main',name),'');
});

test('native Trakt state is detected from the Stremio account and only non-secret status is cached',async t=>{
 const f=fixture(t),api=new TraktAdapter(f.profile,f.store,{},stremio());
 a.equal(api.configured(),false);
 const r=await api.pollNative();a.equal(r.connected,true);a.equal(api.configured(),true);
 const status=f.store.read('main','trakt-native-status');a.equal(status.connected,true);a.equal(Object.hasOwn(status,'token'),false);
});

test('missing or expired Stremio-linked Trakt state fails closed and requests Stremio reconnection',async t=>{
 const f=fixture(t);
 await a.rejects(new TraktAdapter(f.profile,f.store,{},stremio({token:null})).stremioTrakt(),/TRAKT_NOT_CONNECTED/);
 await a.rejects(new TraktAdapter(f.profile,f.store,{},stremio({expires:1})).stremioTrakt(),/TRAKT_STREMIO_REAUTH_REQUIRED/);
});

test('native adapter exposes no direct Trakt mutation or OAuth-client API',async t=>{
 const f=fixture(t),api=new TraktAdapter(f.profile,f.store,{},stremio());
 for(const name of ['request','apply','applyMany','historyForKey','beginDevice','pollDevice','credentials','refresh'])a.equal(typeof api[name],'undefined',name);
});
test('native Stremio Trakt history 404 opens bounded cooldown and never becomes empty history',async t=>{const f=fixture(t);f.profile.resilience.sourceFailureThreshold=1;let calls=0;const http={json:async()=>{calls++;const e=new Error('UPSTREAM_404');e.code='UPSTREAM_404';throw e;}};const api=new TraktAdapter(f.profile,f.store,http,stremio());await a.rejects(api.snapshot(),/STREMIO_TRAKT_ENDPOINT_UNAVAILABLE/);await a.rejects(api.snapshot(),/SOURCE_COOLDOWN/);a.equal(calls,1);});

test('native Trakt snapshot rejects partial bucket responses instead of treating a missing type as empty history',async t=>{const f=fixture(t),http={json:async()=>({data:[{type:'movies',data:[]}]})},api=new TraktAdapter(f.profile,f.store,http,stremio());await a.rejects(api.snapshot(),/INCOMPLETE_STREMIO_TRAKT_HISTORY/);});
test('native Trakt snapshot rejects duplicated type buckets and duplicate watched identities',async t=>{const f=fixture(t);let mode=0;const http={json:async()=>mode++===0?{data:[{type:'movies',data:[]},{type:'movies',data:[]},{type:'shows',data:[]}]}:{data:[{type:'movies',data:[{movie:{ids:{imdb:'tt1234567'}}},{movie:{ids:{imdb:'tt1234567'}}}]},{type:'shows',data:[]}]}};const api=new TraktAdapter(f.profile,f.store,http,stremio());await a.rejects(api.snapshot(),/DUPLICATE_STREMIO_TRAKT_BUCKET/);await a.rejects(api.snapshot(),/DUPLICATE_STREMIO_TRAKT_ITEM/);});

test('native Trakt snapshot rejects malformed watched timestamps and impossible episode numbers',async t=>{const f=fixture(t);let mode=0;const http={json:async()=>mode++===0?{data:[{type:'movies',data:[{movie:{ids:{imdb:'tt1234567'}},last_watched_at:'not-a-date'}]},{type:'shows',data:[]}]}:{data:[{type:'movies',data:[]},{type:'shows',data:[{show:{ids:{imdb:'tt7654321'}},seasons:[{number:-1,episodes:[{number:1}]}]}]}]}};const api=new TraktAdapter(f.profile,f.store,http,stremio());await a.rejects(api.snapshot(),/INVALID_TRAKT_WATCHED_AT/);await a.rejects(api.snapshot(),/TRAKT_SEASON_INVALID/);});
