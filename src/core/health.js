export class Health{
  constructor(){this.rows=new Map();}
  key(pid,module){return `${pid}:${module}`;}
  set(pid,module,state,detail={}){const key=this.key(pid,module),old=this.rows.get(key)??{lastRun:null,lastSuccess:null,checked:0,changed:0,failures:0};const row={...old,state,...detail};if(state==='RUNNING')row.lastRun=new Date().toISOString();if(state==='READY'){row.lastSuccess=new Date().toISOString();row.lastError=null;}if(['BLOCKED','DEGRADED'].includes(state))row.failures++;this.rows.set(key,row);}
  get(pid,module){return this.rows.get(this.key(pid,module))??{state:'IDLE',lastSuccess:null,lastError:null};}
  snapshot(pid){return Object.fromEntries([...this.rows].filter(([k])=>k.startsWith(pid+':')).map(([k,v])=>[k.slice(pid.length+1),structuredClone(v)]));}
}
