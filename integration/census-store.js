/* Canonical data and one in-memory navigation state. Original annotations remain intact. */
(function(){
 'use strict';
 const events=new EventTarget();let data=null;
 let state={view:'monitor',camera:'street2',cameraId:'CAM02',currentTime:0,paused:true,selectedObjectId:null,filter:null,globalViewTransform:null};
 const ready=fetch('data/census.json').then(r=>{if(!r.ok)throw Error('统一普查数据加载失败 '+r.status);return r.json()}).then(d=>{data=d;return d});
 const emit=(type,detail)=>events.dispatchEvent(new CustomEvent(type,{detail}));
 function setState(patch,notify=true){state={...state,...structuredClone(patch)};if(notify)emit('statechange',structuredClone(state));}
 events.addEventListener('scenechange',e=>setState({camera:e.detail.sceneId,cameraId:e.detail.sceneId==='legacy'?null:'CAM0'+e.detail.sceneId.slice(-1),selectedObjectId:null}));
 events.addEventListener('frame',e=>setState({currentTime:e.detail.time},false));
 events.addEventListener('select',e=>setState({selectedObjectId:e.detail.canonicalId}));
 const NATURE=/^\s*(TREE|HEDGE)\s*$/i;
 const candidates=()=>data?.records.filter(r=>r.sky&&r.populationEligible!==false&&!NATURE.test(r.labelEn||''))||[];
 window.Census={ready,events,emit,setState,get state(){return structuredClone(state)},get summary(){return data?.summary},get scenes(){return data?.scenes||[]},get records(){return data?.records||[]},
  get(id){return data?.records.find(r=>r.canonicalId===id)},
  resolve(sourceId,sceneId){return data?.records.find(r=>r.sceneId===sceneId&&(r.sourceId===sourceId||r.canonicalId===sourceId))},
  get candidateRecords(){return candidates()},get contextRecords(){return data?.records.filter(r=>r.sky&&r.populationEligible===false&&!NATURE.test(r.labelEn||''))||[]},
  async scene(key){await ready;const scene=data.scenes.find(s=>s.key===key);if(!scene)throw Error('Unknown scene '+key);return {...scene,objects:data.records.filter(r=>r.sceneId===key).map(r=>({...structuredClone(r.annotation),canonicalId:r.canonicalId,sourceId:r.sourceId,sceneId:r.sceneId,cameraId:r.cameraId,timeRange:r.timeRange,thumb:r.thumb,archive:r.archive,resourceData:r.resourceData,populationEligible:r.populationEligible,populationEligibility:r.populationEligibility,eligibilityStatus:r.eligibilityStatus,modelStatus:r.modelStatus,visualGroupId:r.visualGroupId,color:r.color,source:r.source}))}},
  get populationView(){return data?.records.filter(r=>r.sky&&r.populationEligible===true)||[]},
  async sky(){await ready;const records=candidates();return {scenes:data.scenes.filter(s=>s.key!=='legacy').map(s=>({...s,rawCount:s.count,count:records.filter(r=>r.sceneId===s.key).length})),objects:records.map(r=>({...structuredClone(r.sky),cameraId:r.cameraId,eligibilityStatus:r.eligibilityStatus}))}}
 };
})();
