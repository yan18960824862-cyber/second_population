(() => {
 const ns='http://www.w3.org/2000/svg';
 const mounted=new WeakMap();
 function mount(panel,id,open){
  mounted.get(panel)?.();
  const record=Census.get(id);if(!record)return;
  const section=document.createElement('section');section.className='population-journey';
  section.innerHTML='<div class="journey-stage"><small>第二人口　/　FIELD ATLAS</small><h2>从个体，到群落</h2><svg viewBox="0 0 640 270" aria-hidden="true"></svg><div class="journey-caption"></div><button type="button">进入工业居民星图 ↗</button></div>';
  const hint=document.createElement('button');hint.type='button';hint.className='journey-hint';hint.textContent='向下滚动 · 从此档案进入星图 ↓';
  hint.onclick=()=>section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
  panel.append(hint,section);const svg=section.querySelector('svg'),dots=[],source=Census.candidateRecords;
  const labels=['交通工具','导向与信息','照明与监测','道路围护与停放','地表基础设施'];
  const bins=new Map(),centers=[[190,125],[355,54],[470,113],[383,204],[229,220]];
  const classify=r=>r.category==='vehicle'?0:/SIGN|BANNER/.test(r.labelEn)?1:/CAMERA|LUMINAIRE/.test(r.labelEn)?2:/FENCE|RACK|BARRIER|GUARDRAIL/.test(r.labelEn)?3:4;
  for(const r of source){const k=classify(r),i=bins.get(k)||0;bins.set(k,i+1);const theta=i*2.4,rad=5+9*Math.sqrt(i),[cx,cy]=centers[k];const dot=document.createElementNS(ns,'circle');dot.setAttribute('r',r.canonicalId===id?5:2.8);svg.append(dot);dots.push({dot,x:cx+Math.cos(theta)*rad,y:cy+Math.sin(theta)*rad*.63,selected:r.canonicalId===id});}
  const names=centers.map(([x,y],k)=>{const t=document.createElementNS(ns,'text');t.setAttribute('x',x);t.setAttribute('y',y+(k===0?62:32));t.textContent=labels[k];svg.append(t);return t;});
  section.querySelector('.journey-caption').textContent=record.cameraId+'　/　'+record.label+'　→　'+source.length+' 条工业物观察';
  let armed=true;
  function enter(){if(!armed||!section.isConnected)return;armed=false;Promise.resolve(open()).catch(()=>{armed=true;});}
  function update(){if(!section.isConnected||!panel.clientHeight)return;const pr=panel.getBoundingClientRect(),top=section.getBoundingClientRect().top-pr.top;
   const progress=Math.min(1,Math.max(0,(panel.clientHeight-top)/(panel.clientHeight*.95)));
   for(const {dot,x,y,selected} of dots){dot.setAttribute('cx',320+(x-320)*progress);dot.setAttribute('cy',125+(y-125)*progress);dot.style.opacity=selected?1:progress*.85;}
   for(const n of names)n.style.opacity=Math.max(0,(progress-.45)/.55);
   if(progress>=.999&&panel.scrollTop>0)enter();
  }
  section.querySelector('button').onclick=enter;panel.addEventListener('scroll',update,{passive:true});update();
  mounted.set(panel,()=>{panel.removeEventListener('scroll',update);section.remove();hint.remove();});
 }
 window.PopulationJourney={mount};
})();