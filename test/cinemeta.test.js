import test from 'node:test';
import a from 'node:assert/strict';
import {CinemetaAdapter} from '../src/adapters/cinemeta.js';

test('official Stremio video-id catalogue is batched and normalized for watched bitmaps',async()=>{let calls=0;const http={json:async url=>{calls++;const part=url.split('imdbIds=')[1].split(',');return {data:{metasDetailed:part.map(id=>({id,videos:[`${id}:1:1`,`${id}:1:2`]}))}};}};const ids=Array.from({length:101},(_,i)=>'tt'+String(10000+i));const map=await new CinemetaAdapter(http).seriesVideos(ids);a.equal(calls,2);a.equal(Object.keys(map).length,101);a.deepEqual(map[ids[0]].videos[1],{id:`${ids[0]}:1:2`,season:1,episode:2});});

test('malformed official video IDs fail closed rather than shifting watched bits',async()=>{const http={json:async()=>({data:{metasDetailed:[{id:'tt1234567',videos:['not-a-video-id']}]}})};await a.rejects(new CinemetaAdapter(http).seriesVideos(['tt1234567']),/INVALID_CINEMETA_VIDEO_ID/);});
