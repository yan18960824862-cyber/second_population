/* Derived display taxonomy only. Never rewrites the original source category. */
export const universeCategories=Object.freeze([
 {id:'vehicles',label:'交通工具',en:'VEHICLES',color:'#94c4cb',rule:'原始类别 vehicle'},
 {id:'signage',label:'导向与信息',en:'SIGNS & INFORMATION',color:'#c5cdd3',labels:['METRO SIGN','GANTRY SIGN','SIGN','BANNER']},
 {id:'lighting',label:'照明与监测',en:'LIGHTING & MONITORING',color:'#b3adc9',labels:['CAMERA POLE','LUMINAIRE','STREETLIGHT']},
 {id:'street-equipment',label:'道路围护与停放',en:'STREET EQUIPMENT',color:'#8faac4',labels:['BARRIER','GUARDRAIL','FENCE','BIKE RACK']},
 {id:'ground',label:'地表基础设施',en:'GROUND INFRASTRUCTURE',color:'#a5bcb1',labels:['KERB','ARROW','MANHOLE','LANE MARK']},
 {id:'unknown',label:'类别待核验',en:'CATEGORY PENDING',color:'#909b9f',labels:[]}
]);
export function universeCategory(record){
 if(record.category==='vehicle')return universeCategories[0];
 return universeCategories.find(c=>c.labels?.includes(String(record.labelEn||'').toUpperCase()))||universeCategories.at(-1);
}
export function organizeUniverse(records){
 const sources=['street1','street2','street3','street4'],slots=[[-1,1],[1,1],[-1,-1],[1,-1]],golden=Math.PI*(3-Math.sqrt(5));
 const groups=universeCategories.map(category=>({...category,records:records.filter(r=>universeCategory(r).id===category.id).sort((a,b)=>a.canonicalId.localeCompare(b.canonicalId))})).filter(g=>g.records.length);
 const nodes=[];
 for(const [gi,g]of groups.entries()){
  g.count=g.records.length;g.sources=sources.map((sceneId,index)=>{const items=g.records.filter(r=>r.sceneId===sceneId),radius=items.length===1?.8:1.55*Math.cbrt(items.length)+.3;return {sceneId,cameraId:'CAM0'+(index+1),index,records:items,count:items.length,radius};}).filter(s=>s.count);
  const left=Math.max(...g.sources.filter(s=>slots[s.index][0]<0).map(s=>s.radius),0),right=Math.max(...g.sources.filter(s=>slots[s.index][0]>0).map(s=>s.radius),0),top=Math.max(...g.sources.filter(s=>slots[s.index][1]>0).map(s=>s.radius),0),bottom=Math.max(...g.sources.filter(s=>slots[s.index][1]<0).map(s=>s.radius),0);
  for(const s of g.sources){const slot=slots[s.index];s.local=[slot[0]*(slot[0]<0?left+1:right+1),slot[1]*(slot[1]>0?top+1:bottom+1),(s.index-1.5)*1.4];
   for(const [i,record]of s.records.entries()){
    const z=1-2*(i+.5)/s.count,radial=Math.sqrt(1-z*z),angle=i*golden,offset=s.count===1?[0,0,0]:[Math.cos(angle)*radial*s.radius,Math.sin(angle)*radial*s.radius,z*s.radius];
    nodes.push({record:{...record,universeCategoryId:g.id,universeCategoryLabel:g.label,color:g.color},groupId:g.id,local:offset.map((v,k)=>v+s.local[k])});
   }
  }
  const localNodes=nodes.filter(n=>n.groupId===g.id),low=[0,1,2].map(k=>Math.min(...localNodes.map(n=>n.local[k]))),high=[0,1,2].map(k=>Math.max(...localNodes.map(n=>n.local[k]))),middle=low.map((v,k)=>(v+high[k])/2);
  for(const n of localNodes)n.local=n.local.map((v,k)=>v-middle[k]);for(const s of g.sources)s.local=s.local.map((v,k)=>v-middle[k]);
  // Occupied volume is proportional to observation count; source pockets stay nested.
  const extent=Math.max(...localNodes.map(n=>Math.hypot(...n.local)),.1);g.radius=3.6*Math.cbrt(g.count);const scale=(g.radius-1.3)/extent;
  for(const n of localNodes)n.local=n.local.map(v=>v*scale);for(const s of g.sources){s.local=s.local.map(v=>v*scale);s.radius*=scale;}
  const angle=gi/groups.length*Math.PI*2+Math.PI*.88;g.center=[Math.cos(angle)*19,Math.sin(angle)*19,gi%2?-3:2];
 }
 // Category territories do not overlap. All points derive from actual records.
 for(let iteration=0;iteration<100;iteration++)for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
  const a=groups[i],b=groups[j],dx=a.center[0]-b.center[0],dy=a.center[1]-b.center[1],d=Math.hypot(dx,dy),min=a.radius+b.radius+5;
  if(d<min&&d>.001){const f=(min-d)/d*.35;a.center[0]+=dx*f;a.center[1]+=dy*f;b.center[0]-=dx*f;b.center[1]-=dy*f;}
 }
 const low=[0,1,2].map(k=>Math.min(...groups.map(g=>g.center[k]-g.radius))),high=[0,1,2].map(k=>Math.max(...groups.map(g=>g.center[k]+g.radius))),center=low.map((v,k)=>(v+high[k])/2);
 for(const g of groups){g.center=g.center.map((v,k)=>v-center[k]);for(const s of g.sources)s.center=s.local.map((v,k)=>v+g.center[k]);}
 for(const n of nodes){const g=groups.find(g=>g.id===n.groupId);n.position=n.local.map((v,k)=>v+g.center[k]);}
 const index=new Map(records.map((r,i)=>[r.canonicalId,i]));nodes.sort((a,b)=>index.get(a.record.canonicalId)-index.get(b.record.canonicalId));
 return {version:2,groups,nodes,bounds:{width:high[0]-low[0],height:high[1]-low[1],depth:high[2]-low[2]},count:records.length,sources:4};
}
