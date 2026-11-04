/* 叙事七章：贴在穿梭轴线上的章节平面，文案逐字使用 V2.0，逐句随滚动浮现。
   同一 progress → 同一画面；文字/图片只做位移与透明度；模型只在对应章可见。
   数据来自 data/census.json，图像来自 entry-frames 与 thumbs，模型来自 universe-models（结构示意）。 */
import * as THREE from './vendor/three-r170.module.js';
import {universeModels} from './universe-models.js';
import {universeCategory} from './universe-structure.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const ease=x=>{x=clamp(x);return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hash01=text=>{let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,2246822507);h^=h>>>13;h=Math.imul(h,3266489909);h^=h>>>16;return(h>>>0)/4294967296;};

/* 章节权重按段落数分配：02 最多、03 次之、01/06 较短。 */
const WEIGHTS=[['observation',4],['census',7.4],['growth',6.6],['crowd',5],['origin',5],['evidence',4]];
const Z={observation:-44,census:-60,growth:-76,crowd:-92,origin:-108,evidence:-124,handoff:-140};
const CONTENT_A=.28,CONTENT_B=.86,GAP=.015;

export const CHAPTER_TIMELINE=(()=>{
 const total=WEIGHTS.reduce((n,[,w])=>n+w,0);
 const length=(CONTENT_B-CONTENT_A)-GAP*(WEIGHTS.length-1);
 const out=[];let p=CONTENT_A;
 for(const [key,w]of WEIGHTS){const len=length*w/total;out.push({key,a:+p.toFixed(4),b:+(p+len).toFixed(4),z:Z[key]});p+=len+GAP;}
 out.push({key:'handoff',a:.86,b:.94,z:Z.handoff});
 return out;
})();
export const GLIDE_GAPS=CHAPTER_TIMELINE.slice(0,-1).map((s,i)=>[s.b,CHAPTER_TIMELINE[i+1].a]).filter(g=>g[1]>g[0]);

const ALIAS={street1:'站前交叉口',street2:'夜间主路 · 车流',street3:'南段慢行道',street4:'辅道停靠带'};

export function createNarrative(host,scene){
 const layer=document.createElement('section');
 layer.className='entry-story';
 layer.setAttribute('aria-hidden','true');
 layer.innerHTML='<div class="story-credit">模型为结构示意 / 图像为真实证据</div>'+
  '<div class="story-open"><p>如果监控不再只盯着人呢？</p><p>那我们还能看到些什么？</p></div>'+
  '<div class="story-final"><small>THE SECOND POPULATION</small><b>第二人口</b><p>继续观察。</p></div>';
 host.append(layer);

 let built=false,dead=false,ready=false;
 let els=[],records=[],catDefs=[];
 let modelRoot=null,modelGroups=new Map(),modelMaterials=[];
 let lastActive=-1,openEls=null,finalEl=null;

 const vec=new THREE.Vector3();

 /* 文案 V2.0：逐字照用；lines 按顺序逐句浮现。 */
 const COPY={
  observation:{kicker:'01 / OBSERVATION',lines:[
   ['镜头里，除了人还有什么？','is-lead'],
   ['车、路灯、护栏、指示牌……',''],
   ['好像到处都是这些东西。',''],
   ['但平时我们很少专门去看它们。','is-concl']],beats:[.04,.32,.58,.84],figure:null},
  census:{kicker:'02 / CENSUS',lines:[
   ['如果我们也对它们进行一次人口普查呢？','is-lead'],
   ['（还是物口普查？）',''],
   ['但是都算第二人口了，就叫人口普查吧。',''],
   ['它是什么？',''],
   ['在哪里看到的？',''],
   ['又是什么时候出现的？',''],
   ['好，先记下一个。','is-concl']],beats:[.04,.15,.26,.38,.50,.62,.76],figure:null},
  growth:{kicker:'03 / ONE TO MANY',lines:[
   ['不过，肯定不止这一个吧？','is-lead'],
   ['那其他镜头里呢？',''],
   ['一条、两条、三条……',''],
   ['目前，我们整理出了63条候选观测记录。',''],
   ['我们把它们放在一起。',''],
   ['这就是我们说的：',''],
   ['第二人口。','is-concl']],beats:[.04,.14,.26,.60,.72,.84,.92],figure:{value:'63',unit:'条候选观测记录',at:.60}},
  crowd:{kicker:'04 / WHO IS INSIDE',lines:[
   ['等等，好像车特别多。','is-lead'],
   ['确实，目前记录里最多的是交通工具。',''],
   ['不过也不全是车。',''],
   ['还有路灯、护栏、指示牌，以及各种地表设施。',''],
   ['原来这些平时各干各的东西，放在一起还能分出这么多类。','is-concl']],beats:[.04,.18,.40,.56,.82],figure:{value:'40 / 4 / 4 / 5 / 10',unit:'五类 · 共 63 条',at:.82}},
  origin:{kicker:'05 / WHERE FROM',lines:[
   ['但是，这些东西原本也不在同一个地方啊。','is-lead'],
   ['有的来自这个路口。',''],
   ['有的来自另一条街。',''],
   ['还有的出现在其他监控画面里。',''],
   ['所以，我们也记下了它们分别是从哪里被看到的。','is-concl']],beats:[.04,.16,.28,.40,.78],figure:{value:'4',unit:'路来源 · 19 / 18 / 9 / 17',at:.78}},
  evidence:{kicker:'06 / ONE RECORD',lines:[
   ['那如果我想再找到刚才那个呢？','is-lead'],
   ['点开它。',''],
   ['这里有它的编号、类别，还有对应的监控画面。',''],
   ['找到了，它当时就在这里。','is-concl']],beats:[.04,.26,.52,.84],figure:null},
  handoff:{kicker:'07 / OVER TO YOU',lines:[
   ['其实我们只是换了一种方式来看这些街道。','is-lead'],
   ['原本散落在不同画面里的工业物，现在被放进了同一份调查里。',''],
   ['那你还能在镜头里找到些什么？','is-concl']],beats:[.04,.24,.58],figure:null}
 };

 function chapterEl(key){
  const c=COPY[key],el=document.createElement('article');
  el.className='story-ch';el.dataset.ch=key;
  let lines='';
  c.lines.forEach(([text,cls],i)=>lines+='<p class="story-line '+cls+'" data-i="'+i+'">'+esc(text)+'</p>');
  el.innerHTML='<div class="story-copy"><span class="story-kicker">'+c.kicker+'</span>'+lines+
   '<div class="story-figure"><b></b><small></small></div></div><div class="story-media"></div>';
  return el;
 }

 function addImg(media,src,{x,y,w,o=1,r=0,alt='',cls=''}={}){
  const img=new Image();img.decoding='async';img.loading='eager';img.src=src;img.alt=alt;
  img.className='story-img '+(cls||'');
  img.style.left=x+'%';img.style.top=y+'%';img.style.width=w+'%';
  media.append(img);
  return {el:img,o,rot:r};
 }
 function addCap(media,text,x,y,cls){
  const s=document.createElement('span');s.className='story-cap '+(cls||'');s.textContent=text;
  s.style.left=x+'%';s.style.top=y+'%';media.append(s);
  return s;
 }
 function addRow(media,label,value,x,y){
  const s=document.createElement('span');s.className='story-row';
  s.style.left=x+'%';s.style.top=y+'%';
  s.innerHTML='<i>'+esc(label)+'</i><b>'+esc(value)+'</b>';
  media.append(s);return s;
 }
 function addBracket(media,x,y,w,h){
  const d=document.createElement('span');d.className='story-bracket';
  d.style.left=x+'%';d.style.top=y+'%';d.style.width=w+'%';d.style.height=h+'%';
  d.innerHTML='<span></span><span></span><span></span><span></span>';
  media.append(d);return d;
 }
 function thumbOf(r){return r.thumb||'';}

 function line(item,i,t0){item.lines.push({el:item.lineEls[i],t0,t1:t0+.032});}
 function piece(item,el,t0,t1,{dx=0,dy=16,s0=.97,depth=.35,cls=''}={}){
  item.pieces.push({el,t0,t1,dx,dy,s0,depth,cls,phase:hash01(item.spec.key+':'+item.pieces.length)});
  return el;
 }

 async function build(){
  const C=window.Census;
  if(!C)return false;
  await C.ready;
  records=C.candidateRecords.slice().sort((a,b)=>String(a.canonicalId).localeCompare(String(b.canonicalId)));
  if(!records.length)return false;
  catDefs=['vehicles','signage','lighting','street-equipment','ground'].map(id=>{
   const recs=records.filter(r=>universeCategory(r).id===id);
   const cat=universeCategory(recs[0]||records[0]);
   return {id,label:cat.label,color:cat.color,records:recs,count:recs.length};
  }).filter(g=>g.count);

  const byScene={};for(const r of records)byScene[r.sceneId]=(byScene[r.sceneId]||0)+1;
  const hero=records.find(r=>r.thumb)||records[0];

  for(const spec of CHAPTER_TIMELINE){
   const el=chapterEl(spec.key);
   const item={spec,el,media:el.querySelector('.story-media'),copy:el.querySelector('.story-copy'),
    lines:[],pieces:[],lineEls:[...el.querySelectorAll('.story-line')],
    numberEl:el.querySelector('.story-figure b'),unitEl:el.querySelector('.story-figure small'),
    figEl:el.querySelector('.story-figure'),dyn:null,zoom:null,count:0,fade:0};
   const m=item.media;
   const c=COPY[spec.key];

   c.beats.forEach((t,i)=>line(item,i,t));
   if(c.figure){
    item.figEl.classList.add('is-shown');
    piece(item,item.figEl,c.figure.at,c.figure.at+.05,{dy:12,s0:1});
    item.numberEl.textContent=c.figure.value;
    item.unitEl.textContent=c.figure.unit;
   }

   if(spec.key==='observation'){
    const img=addImg(m,'integration/entry-frames/CAM01-02.jpg',{x:40,y:6,w:58,alt:'站前交叉口的真实监控取帧'});
    piece(item,img.el,.10,.30,{dx:20,dy:26,s0:.92,depth:.3});
    addCap(m,'CAM01 · 站前交叉口 · '+(byScene.street1||0)+' 条',41,4.6);
    piece(item,m.lastChild,.13,.33,{dy:8,s0:1,depth:.1});
    const ih=hero;
    const thumb=addImg(m,thumbOf(ih),{x:60,y:44,w:19,o:.95,cls:'is-evidence',alt:ih.label+'的原始取证帧'});
    piece(item,thumb.el,.34,.52,{dx:0,dy:18,s0:.9,depth:.4});
    const br=addBracket(m,57.5,41,24,22);
    piece(item,br,.36,.50,{dy:0,s0:1,depth:.2});
    const cap=addCap(m,ih.canonicalId+' · '+ih.label,58.5,73.6);
    piece(item,cap,.40,.54,{dy:8,s0:1,depth:.1});
    piece(item,addImg(m,'integration/entry-frames/CAM03-02.jpg',{x:38,y:64,w:26,alt:'慢行道的真实监控取帧'}).el,.56,.74,{dx:-12,dy:24,s0:.92,depth:.2});
    addCap(m,'CAM03 · 南段慢行道',39,62);
    piece(item,m.lastChild,.58,.76,{dy:8,s0:1,depth:.1});
   }

   if(spec.key==='census'){
    const img=addImg(m,'integration/entry-frames/CAM03-03.jpg',{x:44,y:2,w:44,alt:'慢行道的真实监控取帧'});
    piece(item,img.el,.08,.26,{dx:14,dy:22,s0:.94,depth:.3});
    addCap(m,'CAM03 · 南段慢行道',45,.6);
    piece(item,m.lastChild,.10,.28,{dy:8,s0:1,depth:.1});
    const thumb=addImg(m,thumbOf(hero),{x:47,y:47,w:14,o:.95,cls:'is-evidence',alt:hero.label+'的原始取证帧'});
    piece(item,thumb.el,.28,.42,{dx:0,dy:26,s0:.86,depth:.4});
    const br=addBracket(m,45.4,44.4,17.2,16);
    piece(item,br,.30,.40,{dy:0,s0:1,depth:.2});
    const rows=[
     ['编号',hero.canonicalId,64,50],
     ['类别',hero.label,64,58],
     ['来源',hero.cameraId+' · '+ALIAS[hero.sceneId],64,66],
     ['时段',fmtTime(hero.timeRange),64,74]
    ];
    rows.forEach(([k,v,x,y],i)=>{
     const r=addRow(m,k,v,x,y);
     piece(item,r,.34+i*.10,.34+i*.10+.05,{dx:16,dy:10,s0:1,depth:.1});
    });
    addCap(m,'来自 '+hero.source.sourceFile,64,82);
    piece(item,m.lastChild,.72,.84,{dy:6,s0:1,depth:.1});
   }

   if(spec.key==='growth'){
    const picks=records.filter(r=>r.thumb);
    picks.forEach((r,i)=>{
     const x=45+hash01(r.canonicalId+'x')*48,y=4+hash01(r.canonicalId+'y')*64;
     const img=addImg(m,thumbOf(r),{x,y,w:5.2+hash01(r.canonicalId+'w')*3.6,r:(hash01(r.canonicalId+'r')-.5)*6,o:.6,alt:r.label+'的原始取证帧'});
     const t0=.08+(i/picks.length)*.50;
     piece(item,img.el,t0,t0+.07,{dx:(hash01(r.canonicalId+'dx')-.5)*24,dy:20,s0:.7,depth:.15+hash01(r.canonicalId+'d')*.6});
    });
    addCap(m,'63 条候选观测记录 · 按记录编号依次出现',45,93);
    piece(item,m.lastChild,.66,.76,{dy:6,s0:1,depth:.1});
    item.dyn=r=>{item.numberEl.textContent=String(item.count);};
    item.zoom=r=>1.08-.30*smooth(clamp((r-.42)/.24));
   }

   if(spec.key==='crowd'){
    const labels=[['vehicles',57,31],['signage',86,17],['lighting',86,37],['street-equipment',84,60],['ground',60,88]];
    labels.forEach(([id,x,y],i)=>{
     const g=catDefs.find(v=>v.id===id);if(!g)return;
     const s=document.createElement('span');s.className='story-cat';s.dataset.cat=id;
     s.innerHTML='<b>'+g.count+'</b> '+esc(g.label);
     s.style.left=x+'%';s.style.top=y+'%';m.append(s);
     const t0=i===0?.22:.48+(i-1)*.07;
     piece(item,s,t0,t0+.05,{dy:12,s0:.96,depth:.2});
    });
    addCap(m,'模型按记录逐件建模 · 数量按 census.json 计算',45,94,'is-note');
    piece(item,m.lastChild,.58,.66,{dy:6,s0:1,depth:.1});
   }

   if(spec.key==='origin'){
    const srcs=[['street1','CAM01',44,3,-1],['street2','CAM02',55,16,.6],['street3','CAM03',66,29,-.8],['street4','CAM04',77,42,.7]];
    srcs.forEach(([scene,cam,x,y,r],i)=>{
     const img=addImg(m,`integration/entry-frames/${cam}-0${i%3+2}.jpg`,{x,y,w:20,r,alt:ALIAS[scene]+'的真实监控取帧'});
     piece(item,img.el,.12+i*.06,.28+i*.06,{dx:-14,dy:22,s0:.92,depth:i*.15});
     const cap=addCap(m,cam+' · '+(records.filter(v=>v.sceneId===scene).length)+' 条',x,y+22.4);
     piece(item,cap,.14+i*.06,.30+i*.06,{dy:8,s0:1,depth:.1});
    });
    const ns='http://www.w3.org/2000/svg';
    const s=document.createElementNS(ns,'svg');s.setAttribute('viewBox','0 0 1200 676');
    s.setAttribute('class','story-lines');
    const ends=[[44*12+120,3*6.76+135],[55*12+120,16*6.76+135],[66*12+120,29*6.76+135],[77*12+120,42*6.76+135]];
    const paths=[];
    ends.forEach(([x,y])=>{
     const path=document.createElementNS(ns,'path');
     path.setAttribute('d','M '+x+' '+y+' C '+((x+780)/2)+' '+(y+20)+' '+((x+780)/2)+' '+(507-24)+' 780 507');
     s.append(path);paths.push(path);
    });
    m.insertBefore(s,m.firstChild);
    try{paths.forEach(p=>{const len=p.getTotalLength();p.dataset.len=String(len);p.style.strokeDasharray=String(len);p.style.strokeDashoffset=String(len);});}catch(error){}
    paths.forEach((path,i)=>{
     item.pieces.push({el:path,path:true,len:+path.dataset.len||600,t0:.42+i*.04,t1:.60+i*.04,dx:0,dy:0,s0:1,depth:0,phase:0,cls:'line'});
    });
    const thumb=addImg(m,thumbOf(hero),{x:52,y:62,w:26,r:.6,o:.95,cls:'is-evidence',alt:hero.label+'的原始取证帧'});
    piece(item,thumb.el,.44,.62,{dx:0,dy:26,s0:.88,depth:.5});
    addCap(m,hero.canonicalId+' · 原始取证帧 · '+ALIAS[hero.sceneId],54,92);
    piece(item,m.lastChild,.56,.68,{dy:8,s0:1,depth:.1});
   }

   if(spec.key==='evidence'){
    const thumb=addImg(m,thumbOf(hero),{x:44,y:10,w:30,r:-.4,o:.96,cls:'is-evidence',alt:hero.label+'的原始取证帧'});
    piece(item,thumb.el,.16,.34,{dx:0,dy:44,s0:.88,depth:.55});
    const br=addBracket(m,41.6,6,35.2,35);
    piece(item,br,.18,.30,{dy:0,s0:1,depth:.2});
    addCap(m,hero.canonicalId+'  ·  '+hero.label+'  ·  '+hero.cameraId,44,47.5,'is-big');
    piece(item,m.lastChild,.30,.42,{dy:10,s0:1,depth:.2});
    addCap(m,'原始监控 · '+fmtTime(hero.timeRange)+' · 该对象出现的时段',44,51.5);
    piece(item,m.lastChild,.36,.48,{dy:8,s0:1,depth:.1});
    const others=records.filter(r=>r.thumb&&r.canonicalId!==hero.canonicalId).filter((_,i)=>i%6===0).slice(0,4);
    others.forEach((r,i)=>{
     const img=addImg(m,thumbOf(r),{x:66+i*7,y:60+i*3,w:9,o:.7,alt:r.label+'取证帧'});
     piece(item,img.el,.52+i*.04,.66+i*.04,{dx:10,dy:20,s0:.85,depth:.1+i*.1});
    });
    addCap(m,'同一批记录中其余 '+(records.length-1)+' 条',66,78);
    piece(item,m.lastChild,.56,.68,{dy:6,s0:1,depth:.1});
   }

   if(spec.key==='handoff'){
    const thumb=addImg(m,thumbOf(hero),{x:47,y:26,w:17,r:-.4,o:.92,cls:'is-evidence',alt:hero.label+'的原始取证帧'});
    piece(item,thumb.el,.06,.22,{dx:0,dy:26,s0:.9,depth:.4});
    addCap(m,hero.canonicalId+' · 个体证据',48,50);
    piece(item,m.lastChild,.08,.24,{dy:6,s0:1,depth:.1});
    const picks=records.filter(r=>r.thumb).filter((_,i)=>i%7===0).slice(0,9);
    picks.forEach((r,i)=>{
     const img=addImg(m,thumbOf(r),{x:55+(i%5)*9,y:30+Math.floor(i/5)*16,w:8,o:.62,alt:r.label+'取证帧'});
     piece(item,img.el,.24+i*.02,.38+i*.02,{dx:6,dy:18,s0:.8,depth:.1+hash01(r.canonicalId+'d')*.5});
    });
    ['CAM01','CAM02','CAM03','CAM04'].forEach((cam,i)=>{
     const img=addImg(m,`integration/entry-frames/${cam}-03.jpg`,{x:44+i*13,y:62,w:12,o:.9,alt:cam+'的真实监控取帧'});
     piece(item,img.el,.52+i*.04,.64+i*.04,{dx:0,dy:20,s0:.9,depth:.2});
     addCap(m,cam,44+i*13,75);
     piece(item,m.lastChild,.56+i*.04,.68+i*.04,{dy:6,s0:1,depth:.1});
    });
    addCap(m,'四路监控 · 交还给你',44,84);
    piece(item,m.lastChild,.72,.86,{dy:6,s0:1,depth:.1});
   }

   layer.append(el);
   els.push(item);
  }

  try{await Promise.all([...layer.querySelectorAll('img')].map(i=>i.decode().catch(()=>{})));}catch(error){}
  try{buildModels();}catch(error){console.warn('[STORY] 3D models unavailable:',error.message);}
  openEls=[...layer.querySelectorAll('.story-open p')];
  finalEl=layer.querySelector('.story-final');
  ready=true;built=true;
  return true;
 }

 function fmtTime(tr){
  if(!tr)return '';
  const a=Number(tr.start||0).toFixed(1),b=Number(tr.end||0).toFixed(1);
  return a+'–'+b+'s';
 }

 /* ── 三维群像：真实模型（结构示意），逐件出现 / 逐群聚合 ────────── */
 function buildModels(){
  const models=universeModels(THREE);
  modelRoot=new THREE.Group();modelRoot.visible=false;scene.add(modelRoot);
  const baseColor=new THREE.Color('#8a979d');
  function meshFor(record,color){
   const m=models.get(record);if(!m.geometry)return null;
   const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(color).lerp(baseColor,.85).multiplyScalar(.58),vertexColors:true,transparent:true,opacity:0,fog:true});
   modelMaterials.push(mat);
   return {m,mesh:new THREE.Mesh(m.geometry,mat)};
  }
  function edgeFor(){
   const mat=new THREE.LineBasicMaterial({color:new THREE.Color('#9fb6c0'),transparent:true,opacity:0});
   modelMaterials.push(mat);return mat;
  }
  function addModel(group,record,pos,scale,yaw,color,user){
   const built=meshFor(record,color);if(!built)return;
   const mesh=built.mesh;
   mesh.position.set(...pos);mesh.scale.setScalar(scale);mesh.rotation.set(.08,yaw,-.04);
   if(built.m.edges)mesh.add(new THREE.LineSegments(built.m.edges,edgeFor()));
   mesh.userData=Object.assign({base:new THREE.Vector3(...pos),scale},user||{});
   group.add(mesh);
   return mesh;
  }
  function fib(i,n){
   const y=1-(i+.5)/n*2,r=Math.sqrt(Math.max(0,1-y*y)),a=i*2.399963229728653;
   return [Math.cos(a)*r,y,Math.sin(a)*r];
  }

  const colorOf={};
  catDefs.forEach(g=>g.records.forEach(r=>{colorOf[r.canonicalId]=g.color;}));

  /* 03：63 条记录，按编号顺序，一件一件落到右侧的一团。 */
  const c3=new THREE.Group();c3.name='growth';c3.position.z=-76;
  records.forEach((r,i)=>{
   const u=fib(i,records.length);
   addModel(c3,r,[2.55+u[0]*2.15,.15+u[1]*1.75,.95+u[2]*.85],.33,Math.PI+hash01(r.canonicalId)*.8,
    colorOf[r.canonicalId]||catDefs[0].color,{order:i,total:records.length});
  });
  modelGroups.set('growth',c3);modelRoot.add(c3);

  /* 04：五团，从散点聚拢；每团件数 = 该类真实记录数。 */
  const c4=new THREE.Group();c4.name='crowd';c4.position.z=-92;
  const centers={vehicles:[3.4,-.95],signage:[6.3,1.55],lighting:[6.3,-.1],'street-equipment':[6.0,-2.1],ground:[3.7,-3.0]};
  const spreads={vehicles:[2.6,1.5],signage:[.32,.32],lighting:[.32,.32],'street-equipment':[.5,.46],ground:[2.2,.38]};
  catDefs.forEach((g,k)=>{
   const c=centers[g.id]||[3,0],s=spreads[g.id]||[.8,.6];
   const n=g.count;
   g.records.forEach((r,i)=>{
    const u=fib(i,n);
    const flat=(g.id==='ground')?.3:1;
    const final=[c[0]+u[0]*s[0],c[1]+u[1]*s[1]*flat,1.05+u[2]*.75];
    const sx=(hash01(r.canonicalId+'sx')-.5)*3.4,sy=(hash01(r.canonicalId+'sy')-.5)*3.2;
    addModel(c4,r,final,g.id==='ground'?.32:.38,hash01(r.canonicalId)*2.4,g.color,
     {tag:g.id,catIndex:k,catOrder:i,catTotal:n,final:new THREE.Vector3(...final),scatter:new THREE.Vector3(final[0]+sx,final[1]+sy,final[2]-.4)});
   });
  });
  modelGroups.set('crowd',c4);modelRoot.add(c4);
 }

 function updateModels(key,r,fade){
  if(!modelRoot)return;
  modelRoot.visible=false;
  modelGroups.forEach((g,k)=>{g.visible=(k===key&&fade>.012);});
  const g=modelGroups.get(key);
  if(!g||!g.visible)return;
  modelRoot.visible=true;
  if(key==='growth'){
   const T=ease(clamp((r-.08)/.52));
   let shown=0;
   g.children.forEach(mesh=>{
    const u=mesh.userData;
    const e=clamp(T*u.total-u.order,0,1);
    if(e<=.004){mesh.visible=false;return;}
    shown++;
    mesh.visible=true;
    const drift=Math.sin(r*13+u.order*2.3)*.03;
    mesh.position.set(u.base.x,u.base.y+drift,u.base.z-(1-e)*.8);
    mesh.scale.setScalar(u.scale*(.6+.4*e));
    const op=e*fade*.94;
    mesh.material.opacity=op;
    const ln=mesh.children[0];if(ln&&ln.material)ln.material.opacity=op*.26;
   });
   const it=els.find(v=>v.spec.key==='growth');if(it)it.count=shown;
  }else if(key==='crowd'){
   g.children.forEach(mesh=>{
    const u=mesh.userData;
    const appear=smooth(clamp((r-.10)/.10));
    const w0=.14+u.catIndex*.055+(u.catOrder/Math.max(1,u.catTotal))*.1;
    const e=smooth(clamp((r-w0)/.19));
    if(appear<=.004){mesh.visible=false;return;}
    mesh.visible=true;
    const drift=Math.sin(r*11+u.catOrder*2.7+u.catIndex)*.025;
    mesh.scale.setScalar(u.scale*(.7+.3*e));
    mesh.position.x=u.scatter.x+(u.final.x-u.scatter.x)*e;
    mesh.position.y=u.scatter.y+(u.final.y-u.scatter.y)*e+drift;
    mesh.position.z=u.scatter.z+(u.final.z-u.scatter.z)*e;
    /* 04：先突出交通工具，其余保持可见但压暗；随后逐类提亮。 */
    let dim=1;
    if(r<.42)dim=(u.tag==='vehicles')?1:.34;
    else{const order=['vehicles','signage','lighting','street-equipment','ground'].indexOf(u.tag);
     const lit=smooth(clamp((r-.44-order*.07)/.14));dim=.34+.66*lit;}
    const op=appear*(.3+.7*e)*fade*dim;
    mesh.material.opacity=op;
    const ln=mesh.children[0];if(ln&&ln.material)ln.material.opacity=op*.26;
   });
  }
 }

 /* ── 每帧：章节平面按真实相机投影；文字与图像按 beat 生长 ───────── */
 function update(p,camera,width,height){
  if(!built||dead)return false;
  camera.updateMatrixWorld();
  const fov=camera.fov*Math.PI/360;
  const ppx=height/(2*Math.tan(fov));
  let activeAny=false;
  for(const item of els){
   const spec=item.spec;
   const ahead=camera.position.z-spec.z;
   let o=0;
   /* 章节平面在坠落后才出现，避免与 00 开场的两句问句叠在一起。 */
   if(p>=.272&&ahead>3.4&&ahead<22){
    o=smooth((22-ahead)/2.2);
    if(ahead<8)o*=smooth((ahead-3.4)/4.6);
    o*=0.94;
   }
   item.fade=o;
   if(o<=.012){item.el.style.visibility='hidden';continue;}
   item.el.style.visibility='visible';
   const d=Math.max(1,ahead);
   const zoom=item.zoom?item.zoom(clamp((p-spec.a)/(spec.b-spec.a))):1;
   const scale=Math.min(1.2,(16*(ppx/d))/1200*zoom);
   vec.set(0,0,spec.z).project(camera);
   const sx=(vec.x*.5+.5)*width,sy=(-.5*vec.y+.5)*height;
   const ry=Math.atan2(camera.position.x,d)*57.2958*.35;
   item.el.style.opacity=String(o);
   item.el.style.transform='translate3d('+sx.toFixed(1)+'px,'+sy.toFixed(1)+'px,0) translate(-50%,-50%) scale('+scale.toFixed(3)+') rotateY('+ry.toFixed(2)+'deg)';
   const r=clamp((p-spec.a)/(spec.b-spec.a));
   if(modelGroups.has(spec.key)){activeAny=true;updateModels(spec.key,r,o);}
   updateChapter(item,r);
  }
  if(!activeAny)updateModels('',0,0);

  /* 00 开场：两句问句在坠落途中分两次出现。 */
  const o1=smooth(clamp((p-.055)/.035))*(1-smooth(clamp((p-.20)/.03)));
  const o2=smooth(clamp((p-.20)/.035))*(1-smooth(clamp((p-.275)/.012)));
  openEls.forEach((el,i)=>{el.style.opacity=String((i?o2:o1)*.86);el.style.transform='translateY('+((1-(i?o2:o1))*10).toFixed(2)+'px)';});
  layer.classList.toggle('is-open',o1>.02||o2>.02);

  /* 最终卡：0.94–1.00 */
  const fo=smooth(clamp((p-.94)/.022))*(1-smooth(clamp((p-.988)/.01)));
  finalEl.style.opacity=String(fo*.92);
  finalEl.style.transform='translateY('+((1-fo)*14).toFixed(2)+'px)';
  layer.classList.toggle('is-final',fo>.02);

  const active=CHAPTER_TIMELINE.findIndex(s=>p>=s.a&&p<=s.b);
  if(active!==lastActive){lastActive=active;layer.dataset.chapter=active>=0?CHAPTER_TIMELINE[active].key:'';}
  layer.classList.toggle('is-story',active>=0&&p<.94);
  return active>=0&&p<.94;
 }

 function updateChapter(item,r){
  for(const l of item.lines){
   const e=smooth(clamp((r-l.t0)/(l.t1-l.t0)));
   l.el.style.opacity=String(e*.97);
   l.el.style.transform='translateY('+((1-e)*10).toFixed(2)+'px)';
  }
  for(const pc of item.pieces){
   const e=smooth(clamp((r-pc.t0)/(pc.t1-pc.t0)));
   if(pc.path){
    pc.el.style.opacity=String(e*.5);
    pc.el.style.strokeDashoffset=String(pc.len*(1-e));
    continue;
   }
   const drift=Math.sin(r*19+pc.phase*6.283)*2.2;
   const par=pc.depth*(r-.5)*14;
   pc.el.style.opacity=String(e*(pc.o??1));
   pc.el.style.transform='translate('+(pc.dx*(1-e)+par).toFixed(2)+'px,'+(pc.dy*(1-e)+drift).toFixed(2)+'px) scale('+(pc.s0+(1-pc.s0)*e).toFixed(3)+') rotate('+(pc.rot||0)+'deg)';
   if(pc.cls==='line')pc.el.style.opacity=String(e*.5);
  }
  if(item.dyn)item.dyn(r);
 }

 function dispose(){
  dead=true;ready=false;
  layer.remove();
  modelRoot?.removeFromParent();
  modelMaterials.forEach(m=>m.dispose());
  modelGroups.clear();
 }

 function debug(view,w,h){
  const out={meshes:modelRoot?modelRoot.children.reduce((n,g)=>n+g.children.length,0):0,rootVisible:!!modelRoot?.visible,groups:[]};
  for(const [key,g]of modelGroups){
   const vis=g.children.filter(m=>m.visible).length;
   out.groups.push({key,visible:g.visible,meshes:g.children.length,visibleMeshes:vis,count:els.find(v=>v.spec.key===key)?.count??null});
  }
  out.categories=catDefs.map(g=>({id:g.id,count:g.count}));
  if(view){
   const c4=modelGroups.get('crowd');out.bounds=[];
   if(c4)for(const g of catDefs){
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,n=0;
    for(const c of c4.children){if(c.userData.tag!==g.id)continue;
     const v=new THREE.Vector3();c.getWorldPosition(v);v.project(view);
     const px=(v.x*.5+.5)*(w||1),py=(-.5*v.y+.5)*(h||1);
     x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);n++;
    }
    if(n)out.bounds.push({id:g.id,n,pct:[+(x0/(w||1)*100).toFixed(1),+(y0/(h||1)*100).toFixed(1),+(x1/(w||1)*100).toFixed(1),+(y1/(h||1)*100).toFixed(1)]});
   }
  }
  out.chapters=els.map(v=>({key:v.spec.key,count:v.count,revealed:v.pieces.filter(pc=>pc.el.style.opacity&&+pc.el.style.opacity>0).length}));
  return out;
 }
 return {build,update,dispose,debug,get ready(){return ready;},get count(){return records.length;},catDefs:()=>catDefs,get activeChapter(){return lastActive;}};
}
