import * as THREE from './vendor/three-r170.module.js';
import {universeModels} from './universe-models.js';
import {organizeUniverse} from './universe-structure.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),mix=(a,b,t)=>a+(b-a)*t;
/* 配色 / 尺寸 token 表：星点色、发光色、雾团色、背景底色全部从这里读。 */
const U=window.UniversePalette,theme=U?.palette;
/* 群落雾团贴图（v5 星云）：柔边径向渐变，只做气氛层。 */
function hazeTexture(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const grad=g.createRadialGradient(64,64,0,64,64,64);
 grad.addColorStop(0,'rgba(255,255,255,.85)');grad.addColorStop(.35,'rgba(255,255,255,.34)');grad.addColorStop(.68,'rgba(255,255,255,.09)');grad.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=grad;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
export function createObjectUniverse(canvas,records,callbacks={}){
 const layout=organizeUniverse(records),groups=layout.groups,groupMap=new Map(groups.map(g=>[g.id,g]));
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1,.05,700),renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 scene.add(new THREE.HemisphereLight('#c8dee5','#142531',1.3));const key=new THREE.DirectionalLight('#e1edf0',2);key.position.set(-8,12,10);scene.add(key);const rim=new THREE.DirectionalLight('#b3d8d1',1.4);rim.position.set(8,2,-9);scene.add(rim);
 const library=universeModels(THREE),abort=new AbortController(),signal=abort.signal,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const nodes=layout.nodes.map((n,index)=>({...n,index,position:new THREE.Vector3(...n.position),model:null,lod:0,screen:{x:0,y:0,r:8},shown:true})),byId=new Map(nodes.map(n=>[n.record.canonicalId,n])),count=nodes.length;
 /* 确定性哈希：装饰碎点只用 Object ID 作种子，刷新不重排。 */
 function hashText(value){let h=2166136261;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
 function rand01(h){return (h>>>0)/4294967296;}
 function tint(hex,factor){const c=new THREE.Color(hex);c.multiplyScalar(factor);return c;}
 /* 方案 C 才有群内深浅变化；A/B 保持原有平色。 */
 function nodeColor(n,index){const scheme=theme?theme.get():null;const base=(scheme&&scheme.groups&&scheme.groups[n.groupId])||(theme?theme.style(n.physClass):n.record.color);const variation=(scheme&&scheme.variation)||0;if(!variation)return new THREE.Color(base);return tint(base,1+(rand01(hashText(n.record.canonicalId+'#tint'))-.5)*2*variation);}
 function groupColor(gid){const scheme=theme?theme.get():null;return new THREE.Color((scheme&&scheme.groups&&scheme.groups[gid])||(theme?theme.style(GROUP_CLASS[gid]||'other'):'#8fa9b6'));}
 const positions=new Float32Array(count*3),colors=new Float32Array(count*3),weights=new Float32Array(count),cloudWeights=new Float32Array(count),seeds=new Float32Array(count),selected=new Float32Array(count),sizes=new Float32Array(count),minSizes=new Float32Array(count);
 /* 个体尺寸独立于群落数量：按真实物理尺度分档（车 > 围护/停放 > 地表设施 > 导视牌 > 灯具小件），
    并带屏幕投影最小可见下限。颜色按类别从 token 表取。 */
 for(const n of nodes){n.position.toArray(positions,n.index*3);
  n.physClass=U?U.physicalClass(n.record):'other';const tier=(U&&U.SIZE_TIERS[n.physClass])||{scale:.7,minPx:2.4};
  sizes[n.index]=tier.scale;minSizes[n.index]=tier.minPx;
  nodeColor(n,n.index).toArray(colors,n.index*3);
  seeds[n.index]=(n.index*.61803398875)%1;weights[n.index]=cloudWeights[n.index]=1;}
 const geometry=new THREE.BufferGeometry();for(const [name,array,size]of [['position',positions,3],['color',colors,3],['weight',weights,1],['seed',seeds,1],['selected',selected,1],['sizeMul',sizes,1],['minSize',minSizes,1]])geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
 const cloudGeo=geometry.clone();cloudGeo.setAttribute('weight',new THREE.BufferAttribute(cloudWeights,1));
 const vertex=`attribute vec3 color;attribute float weight,seed,selected,sizeMul,minSize;varying vec3 c;varying float a,s,h;uniform float height,pixelRatio,cloud,uRefDist;
 void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;c=color;s=seed;h=selected;a=weight;float size=cloud>.5?(12.+seed*5.):(1.+selected*.35)*sizeMul;gl_PointSize=clamp(cloud>.5?size*height*pixelRatio/max(1.,-mv.z):size*uRefDist*pixelRatio/max(1.,-mv.z),cloud>.5?12.:minSize*pixelRatio,cloud>.5?420.*pixelRatio:44.*pixelRatio);}`;
 const uniform=cloud=>({height:{value:300},pixelRatio:{value:renderer.getPixelRatio()},cloud:{value:cloud},uRefDist:{value:80}});
 const starMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:`precision highp float;varying vec3 c;varying float a,s,h;
 void main(){vec2 q=(gl_PointCoord-.5)*2.;float r=length(q);if(r>1.)discard;float core=1.-smoothstep(.22,.62,r);float halo=exp(-r*r*5.)*.18;float edge=(1.-smoothstep(.82,.95,r))*smoothstep(.65,.77,r)*h*.85;vec3 color=mix(c,vec3(.88,.96,1.),.08+h*.3);gl_FragColor=vec4(color,(core+halo+edge)*a);
 #include <colorspace_fragment>
 }`,uniforms:uniform(0),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
 const hazeColorFor=()=>{const h=(theme?theme.get().haze:[64,86,107]);return new THREE.Color(h[0]/255,h[1]/255,h[2]/255);};
 const cloudMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:`precision highp float;varying vec3 c;varying float a,s,h;uniform float haze;uniform vec3 hazeColor;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
 void main(){vec2 p=(gl_PointCoord-.5)*2.;float r=dot(p,p);if(r>1.)discard;vec2 q=p*3.1+vec2(s*27.,s*11.);float f=noise(q)*.65+noise(q*2.1+3.)*.35;float w=exp(-r*4.)*smoothstep(.25,.8,f);gl_FragColor=vec4(hazeColor,w*a*haze*.045);}`,uniforms:{...uniform(1),haze:{value:1},hazeColor:{value:hazeColorFor()}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
 const clouds=new THREE.Points(cloudGeo,cloudMaterial),stars=new THREE.Points(geometry,starMaterial);stars.renderOrder=2;scene.add(clouds,stars);
 /* 群落雾团（v5 星云视觉）：大面积、极低透明、柔边、加色混合，渲染顺序在星点之前，
    比任何记录都暗；只做深蓝黑底上的氛围层，不参与数量统计、不盖住对象。 */
 const GROUP_CLASS={vehicles:'transit','street-equipment':'equipment',ground:'ground',signage:'signage',lighting:'lighting',unknown:'other'};
 const hazeMap=hazeTexture(),nebulas=groups.map(g=>{const material=new THREE.SpriteMaterial({map:hazeMap,color:groupColor(g.id),transparent:true,opacity:.14,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}),sprite=new THREE.Sprite(material);
  sprite.position.set(...g.center);sprite.scale.setScalar(g.radius*3.4);sprite.renderOrder=-1;scene.add(sprite);return {g,sprite,material};});
 /* ── 装饰点（部件碎点）──
    1 条记录 → 一组碎点，数量按类别档位、位置用 Object ID 作种子确定性生成。
    只表现"这个物件内部零件多"的密度感：比主体点更小、更暗、扁平无描边，
    永不参与拾取 / 悬停 / 统计 / tooltip；全部塞进一个 Points，一次 draw call。 */
 const DECO_RANGE={vehicles:[12,24],lighting:[6,10],'street-equipment':[4,8],signage:[3,6],ground:[1,3],unknown:[1,3]};
 const DECO_BASE={vehicles:.82,lighting:.42,'street-equipment':.55,signage:.36,ground:.3,unknown:.3};
 const DECO_CAP=1200;
 const decoPositions=[],decoColors=[],decoSizes=[],decoGroup=[],decoBright=[];
 decoLoop:for(const n of nodes){
  const range=DECO_RANGE[n.groupId]||[1,3],base=DECO_BASE[n.groupId]||.3,color=groupColor(n.groupId);
  let state=hashText(n.record.canonicalId);
  const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const total=range[0]+Math.floor(rnd()*(range[1]-range[0]+1));
  for(let i=0;i<total;i++){
   if(decoSizes.length>=DECO_CAP)break decoLoop;
   const angle=rnd()*Math.PI*2,radius=base*(.9+rnd()*.7),eccentricity=rnd()*.3;
   decoPositions.push(n.position.x+Math.cos(angle)*radius*(1+eccentricity),n.position.y+Math.sin(angle)*radius*(1-eccentricity*.6),n.position.z+(rnd()-.5)*base*.9);
   const bright=.55+rnd()*.35;
   decoGroup.push(n.groupId);decoBright.push(bright);
   decoColors.push(color.r*bright,color.g*bright,color.b*bright);
   decoSizes.push(2+rnd()*2);
  }
 }
 const decoGeometry=new THREE.BufferGeometry();
 decoGeometry.setAttribute('position',new THREE.Float32BufferAttribute(decoPositions,3));
 decoGeometry.setAttribute('color',new THREE.Float32BufferAttribute(decoColors,3));
 decoGeometry.setAttribute('dsize',new THREE.Float32BufferAttribute(decoSizes,1));
 const decoMaterial=new THREE.ShaderMaterial({vertexShader:`attribute vec3 color;attribute float dsize;varying vec3 c;uniform float pixelRatio;
 void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;c=color;gl_PointSize=dsize*pixelRatio;}`,
  fragmentShader:`precision highp float;varying vec3 c;void main(){vec2 q=(gl_PointCoord-.5)*2.;float r=length(q);if(r>1.)discard;float a=1.-smoothstep(.7,1.,r);gl_FragColor=vec4(c,a*.46);
 #include <colorspace_fragment>
 }`,uniforms:{pixelRatio:{value:renderer.getPixelRatio()}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
 const decorations=new THREE.Points(decoGeometry,decoMaterial);decorations.renderOrder=1;scene.add(decorations);
 /* ── 虚线圆外壳 ── 每群一圈，低亮度，随类别色相；始终面向相机，像参考图的裁切圆。 */
 const groupRings=groups.map(g=>{const radius=g.radius*1.04+.35,points=Array.from({length:96},(_,i)=>new THREE.Vector3(Math.cos(i/96*Math.PI*2)*radius,Math.sin(i/96*Math.PI*2)*radius,0)),
  geo=new THREE.BufferGeometry().setFromPoints(points),material=new THREE.LineDashedMaterial({color:groupColor(g.id),dashSize:.34,gapSize:.28,transparent:true,opacity:.34,depthWrite:false}),line=new THREE.LineLoop(geo,material);
  line.computeLineDistances();line.position.set(...g.center);scene.add(line);return {g,line,material};});
 /* ── 能耗层（5.1） ──
    口径切换（一次性制造 / 每日使用）只改主体点直径：对数压缩、归一化、夹在 [4,30] px。
    萤火虫是独立叠加开关：每物件一簇，数量按 n=clamp(round(6+18*log10(1+E/50)),4,24)，
    pending 的物件只给 4 只“未核”萤火虫，不填数。位置、群组、虚线圆与碎点不变。 */
 const energyItems=(callbacks.energy&&callbacks.energy.items)||[],energyMap=new Map(energyItems.map(e=>[e.objectId,e]));
 const energyKnown=item=>item&&item.embodiedStatus!=='pending'&&typeof item.embodiedKwh==='number'&&item.embodiedKwh>0;
 const FF_CAP=1500,FF_BASE={vehicles:1.15,lighting:.6,'street-equipment':.85,signage:.55,ground:.45,unknown:.5},WARM=['#f4ff8a','#c6ff6b','#ffe28a'];
 const ffLogMax=Math.max(1,...nodes.map(n=>{const item=energyMap.get(n.record.canonicalId);return energyKnown(item)?Math.log10(1+item.embodiedKwh/50):0;}));
 const ffPositions=[],ffColors=[],ffSeeds=[],ffSizes=[],ffNodes=[],ffGroups=[],ffBright=[],ffWarm=[];
 ffLoop:for(const n of nodes){
  const item=energyMap.get(n.record.canonicalId),known=energyKnown(item);
  const total=known?clamp(Math.round(6+18*Math.log10(1+item.embodiedKwh/50)),4,24):4;
  const bright=known?clamp(.42+.58*Math.log10(1+item.embodiedKwh/50)/ffLogMax,.42,1):.28;
  let state=hashText(n.record.canonicalId+'#firefly');
  const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const base=FF_BASE[n.groupId]||.5,gi=groups.indexOf(groupMap.get(n.groupId));
  for(let i=0;i<total;i++){
   if(ffSizes.length>=FF_CAP)break ffLoop;
   const angle=rnd()*Math.PI*2,radius=base*(.9+rnd()*.7);
   ffPositions.push(n.position.x+Math.cos(angle)*radius*(1+rnd()*.2),n.position.y+Math.sin(angle)*radius*(1-rnd()*.2)+rnd()*.5,n.position.z+(rnd()-.5)*base);
   ffNodes.push(n.index);ffGroups.push(gi);ffBright.push(bright);
   const warm=rnd()<.22;ffWarm.push(warm?1:0);
   const color=warm?new THREE.Color(WARM[Math.floor(rnd()*WARM.length)]):groupColor(n.groupId);
   ffColors.push(color.r,color.g,color.b);
   ffSeeds.push(rnd());ffSizes.push((.12+rnd()*.2)*(.55+.45*bright));
  }
 }
 const ffGeometry=new THREE.BufferGeometry();
 ffGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ffPositions,3));
 ffGeometry.setAttribute('color',new THREE.Float32BufferAttribute(ffColors,3));
 ffGeometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(ffSeeds,1));
 ffGeometry.setAttribute('aSize',new THREE.Float32BufferAttribute(ffSizes,1));
 ffGeometry.setAttribute('aNode',new THREE.Float32BufferAttribute(ffNodes,1));
 ffGeometry.setAttribute('aGroup',new THREE.Float32BufferAttribute(ffGroups,1));
 ffGeometry.setAttribute('aBright',new THREE.Float32BufferAttribute(ffBright,1));
 const ffMaterial=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uResolution:{value:new THREE.Vector2(1,1)},uMouse:{value:new THREE.Vector2(-999,-999)},uHoverAmt:{value:0},uFocusGroup:{value:-1},uFocusNode:{value:-1},uScale:{value:900},uPixelRatio:{value:renderer.getPixelRatio()}},
  vertexShader:`attribute vec3 color;attribute float aSeed;attribute float aSize;attribute float aNode;attribute float aGroup;attribute float aBright;
 uniform float uTime,uHoverAmt,uFocusGroup,uFocusNode,uScale,uPixelRatio;uniform vec2 uResolution,uMouse;
 varying vec3 vColor;varying float vAlpha;
 void main(){
  float cycle=mod(uTime*.11+aSeed*3.7,1.);
  vec3 p=position;
  p.y+=cycle*1.15;
  p.x+=sin(uTime*.34+aSeed*19.)*.17;
  p.z+=cos(uTime*.29+aSeed*27.)*.12;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(aSize*uScale/max(1.,-mv.z),1.1*uPixelRatio,14.*uPixelRatio);
  vec2 screen=(gl_Position.xy/gl_Position.w*.5+.5)*uResolution;
  float near=1.-smoothstep(24.,120.,distance(screen,uMouse));
  float focus=(uFocusGroup>=0.&&abs(aGroup-uFocusGroup)<.5)?1.:0.;
  float chosen=(uFocusNode>=0.&&abs(aNode-uFocusNode)<.5)?1.:0.;
  float boost=max(max(near*uHoverAmt,focus*.85),chosen*1.3);
  float fade=smoothstep(0.,.14,cycle)*(1.-smoothstep(.82,1.,cycle));
  float tw=.55+.45*sin(uTime*2.4+aSeed*31.)+.25*sin(uTime*6.1+aSeed*57.);
  tw=clamp(tw,.2,1.2);
  float dof=clamp(16./max(1.,-mv.z),.13,1.);
  vColor=color;
  vAlpha=(.18+.82*clamp(boost,0.,1.))*aBright*tw*fade*dof;
 }`,
  fragmentShader:`precision highp float;varying vec3 vColor;varying float vAlpha;
 void main(){vec2 q=(gl_PointCoord-.5)*2.;float d=length(q);if(d>1.)discard;float glow=exp(-d*d*3.4)*(1.-smoothstep(.82,1.,d));gl_FragColor=vec4(vColor,glow*vAlpha);
 #include <colorspace_fragment>
 }`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
 const fireflies=new THREE.Points(ffGeometry,ffMaterial);fireflies.renderOrder=3;scene.add(fireflies);
 /* 主体点直径：d ∝ log10(1+E/E0)，归一化到 [EN_MIN,EN_MAX] px；pending 物件取最小直径。 */
 const EN_MIN=4,EN_MAX=30,E0=50;
 let energyMode='embodied',firefliesOn=true,pointerX=-999,pointerY=-999,pointerInside=false,hoverAmt=0,hoverTarget=0,idleUntil=0;
 function energyValue(item,mode){
  if(!item)return null;
  const status=mode==='daily'?item.dailyStatus:item.embodiedStatus;
  const value=mode==='daily'?item.dailyKwh:item.embodiedKwh;
  if(status==='pending'||typeof value!=='number')return null;
  return value;
 }
 function applyEnergySizes(){
  const logs=[];
  for(const n of nodes){const v=energyValue(energyMap.get(n.record.canonicalId),energyMode);if(v&&v>0)logs.push(Math.log10(1+v/E0));}
  const lo=logs.length?Math.min(...logs):0,hi=logs.length?Math.max(...logs):1,span=(hi-lo)||1;
  for(const n of nodes){
   const v=energyValue(energyMap.get(n.record.canonicalId),energyMode);
   sizes[n.index]=v==null?EN_MIN:v>0?EN_MIN+(EN_MAX-EN_MIN)*(Math.log10(1+v/E0)-lo)/span:EN_MIN;
  }
  geometry.attributes.sizeMul.needsUpdate=true;
 }
 applyEnergySizes();
 function energyState(){return {caliber:energyMode,fireflies:firefliesOn,count:ffSizes.length};}
 function setEnergyCaliber(mode){const next=mode==='daily'?'daily':'embodied';if(next===energyMode)return energyState();energyMode=next;applyEnergySizes();idleUntil=performance.now()+2400;callbacks.onEnergy?.(energyState());wake();return energyState();}
 function setFireflies(on){firefliesOn=!!on;fireflies.visible=firefliesOn;idleUntil=performance.now()+2400;callbacks.onEnergy?.(energyState());wake();return energyState();}
 function applyPalette(){if(!theme)return;
  for(const n of nodes){nodeColor(n,n.index).toArray(colors,n.index*3);}
  geometry.attributes.color.needsUpdate=true;
  for(let i=0;i<decoGroup.length;i++){const c=groupColor(decoGroup[i]).multiplyScalar(decoBright[i]);decoColors[i*3]=c.r;decoColors[i*3+1]=c.g;decoColors[i*3+2]=c.b;}
  decoGeometry.attributes.color.needsUpdate=true;
  for(const {g,material}of groupRings)material.color.copy(groupColor(g.id));
  cloudMaterial.uniforms.hazeColor.value.copy(hazeColorFor());
  for(const {g,material}of nebulas)material.color.copy(groupColor(g.id));
  const scheme=theme.get(),surface=canvas.parentElement;
  if(surface)surface.style.background='radial-gradient(ellipse at 46% 50%,'+scheme.bgEdge+','+scheme.bg+' 78%)';
  wake();}
 if(theme)theme.onChange(applyPalette);
 const sourceRings=[];for(const g of groups)for(const s of g.sources){const points=Array.from({length:64},(_,i)=>new THREE.Vector3(Math.cos(i/64*Math.PI*2)*(s.radius+1),Math.sin(i/64*Math.PI*2)*(s.radius+1),0)),geo=new THREE.BufferGeometry().setFromPoints(points),mat=new THREE.LineBasicMaterial({color:g.color,transparent:true,opacity:0,depthWrite:false}),line=new THREE.LineLoop(geo,mat);line.position.fromArray(s.center);line.visible=false;scene.add(line);sourceRings.push({g,s,line});}
 let width=1,height=1,sceneId='street2',scope='all',visibleIds=new Set(),selection=null,hover=null,focusedCategory=null,hoverCategory=null,alive=true,raf=0,lastDraw=0,frames=0,needsBuild=false,framing='overview';
 const pose={yaw:0,pitch:.08,distance:100,target:new THREE.Vector3()},desired={yaw:pose.yaw,pitch:pose.pitch,distance:pose.distance,target:pose.target.clone()},drawTimes=[];
 const projected=new THREE.Vector3(),relative=new THREE.Vector3(),up=new THREE.Vector3(),axis=new THREE.Vector3(),ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
 function pointPx(n){camera.getWorldDirection(axis);const depth=Math.max(1,relative.copy(n.position).sub(camera.position).dot(axis));return sizes[n.index]*(starMaterial.uniforms.uRefDist.value/depth);}
 const allowed=()=>alive&&!document.hidden&&callbacks.visible?.()!==false;
 function wake(){if(allowed()&&!raf)raf=requestAnimationFrame(draw);}
 function stop(){cancelAnimationFrame(raf);raf=0;}
 function sync(){if(allowed())wake();else stop();}
 // Fit the actual observations and label anchors, with space for readable UI labels.
 function fit(categoryId){const list=categoryId?nodes.filter(n=>n.groupId===categoryId):nodes,visibleGroups=categoryId?[groupMap.get(categoryId)]:groups,points=list.map(n=>n.position.clone());for(const g of visibleGroups)points.push(new THREE.Vector3(g.center[0],g.center[1]+g.radius+2.1,g.center[2]));
  const box=new THREE.Box3().setFromPoints(points),target=box.getCenter(new THREE.Vector3());target.z=0;const tangent=Math.tan(camera.fov*Math.PI/360),xMargin=Math.min(width*.16,width<600?50:100),yMargin=Math.min(height*.13,width<600?36:52),nx=Math.max(.5,1-2*xMargin/width),ny=Math.max(.5,1-2*yMargin/height);let distance=12;
  for(const p of points)distance=Math.max(distance,p.z+Math.abs(p.x-target.x)/(tangent*camera.aspect*nx),p.z+Math.abs(p.y-target.y)/(tangent*ny));return {target,distance};
 }
 const overviewDistance=()=>fit().distance;
 const groupDistance=g=>fit(g.id).distance;
 function frame(categoryId){const next=fit(categoryId);desired.target.copy(next.target);desired.distance=next.distance;desired.yaw=0;desired.pitch=0;}
 function resize(){const r=canvas.parentElement.getBoundingClientRect();if(r.width<2||r.height<2)return;width=r.width;height=r.height;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();if(framing==='overview')frame();else if(framing==='category'&&focusedCategory)frame(focusedCategory);starMaterial.uniforms.height.value=cloudMaterial.uniforms.height.value=height;
  const ref=Math.max(20,overviewDistance());starMaterial.uniforms.uRefDist.value=cloudMaterial.uniforms.uRefDist.value=ref;
  ffMaterial.uniforms.uScale.value=Math.min(width,height)*1.6;ffMaterial.uniforms.uResolution.value.set(width,height);ffMaterial.uniforms.uPixelRatio.value=renderer.getPixelRatio();wake();}
 function makeModel(node){const spec=library.get(node.record);if(!spec.geometry)return null;const material=new THREE.MeshStandardMaterial({vertexColors:true,color:new THREE.Color(node.record.color).lerp(new THREE.Color('#ffffff'),.84),roughness:.5,metalness:.28,side:THREE.DoubleSide,transparent:true,opacity:0,emissive:'#13232a',emissiveIntensity:.12}),edges=new THREE.LineBasicMaterial({color:node.record.color,transparent:true,opacity:0,depthWrite:false}),group=new THREE.Group(),surface=new THREE.Mesh(spec.geometry,material),wire=new THREE.LineSegments(spec.edges,edges);group.add(surface,wire);group.position.copy(node.position);group.rotation.y=-.45;surface.userData.id=node.record.canonicalId;group.visible=false;scene.add(group);node.model={group,surface,wire,material,edges,spec};return node.model;}
 function screenPoint(position){projected.copy(position).project(camera);return {x:(projected.x*.5+.5)*width,y:(-projected.y*.5+.5)*height,visible:projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1.2&&Math.abs(projected.y)<1.2};}
 function updateAppearance(){
  const candidates=[],focal=height/(2*Math.tan(camera.fov*Math.PI/360)),activeCategory=hoverCategory||focusedCategory;needsBuild=false;
  for(const n of nodes){n.shown=scope==='all'||n.record.sceneId===sceneId;const point=screenPoint(n.position),depth=relative.copy(n.position).sub(camera.position).length(),ratio=2.4/(Math.max(1,depth)*2*Math.tan(camera.fov*Math.PI/360));n.screen={...point,r:clamp(1.2*focal/Math.max(1,depth),7,60)};n.pickable=point.visible;n.lod=n.shown&&n.pickable&&!['overview','category'].includes(framing)?clamp((ratio-.16)/.16,0,1):0;if(selection&&selection!==n.record.canonicalId)n.lod*=clamp((pose.distance-9)/9,0,1);if(n.lod>.005)candidates.push({node:n,depth:selection===n.record.canonicalId?0:depth});}
  candidates.sort((a,b)=>a.depth-b.depth);const close=new Set(candidates.slice(0,6).map(p=>p.node));let created=0;
  for(const n of nodes){const id=n.record.canonicalId,isCurrent=n.record.sceneId===sceneId,chosen=selection===id,hov=hover===id,related=!activeCategory||n.groupId===activeCategory;let lod=close.has(n)?n.lod:0;if(lod>0&&!n.model){if(created<2){makeModel(n);created++;}else{needsBuild=true;lod=0;}}if(!n.model)lod=0;
   const dim=!n.shown?0:(isCurrent?(visibleIds.has(id)?1:.96):.68)*(related?1:.4);weights[n.index]=(chosen?1.5:dim)*(1-lod)*(hov?1.35:1);selected[n.index]=chosen||hov?1:0;cloudWeights[n.index]=n.shown?(related?.42:.12)*(1-lod):0;
   if(n.model){const m=n.model;m.group.visible=lod>.005;m.material.opacity=lod*(chosen?.98:dim);m.material.depthWrite=lod>.92;m.edges.opacity=lod*(chosen?.55:.18);}
  }
  geometry.attributes.weight.needsUpdate=true;geometry.attributes.selected.needsUpdate=true;cloudGeo.attributes.weight.needsUpdate=true;cloudMaterial.uniforms.haze.value=mix(.08,1,clamp((pose.distance-8)/70,0,1));
  up.set(0,1,0).applyQuaternion(camera.quaternion);
  const annotations=[];for(const g of groups){const center=new THREE.Vector3(...g.center),depth=center.distanceTo(camera.position);g.screen={...screenPoint(center),r:g.radius*focal/Math.max(1,depth)};const point=screenPoint(center.clone().addScaledVector(up,g.radius+2.1)),pad=width<600?40:80;annotations.push({id:g.id,...point,cx:g.screen.x,cy:g.screen.y,r:g.screen.r,active:!activeCategory||activeCategory===g.id,count:g.count,visibleCount:scope==='all'?g.count:(g.sources.find(s=>s.sceneId===sceneId)?.count||0),visible:point.visible&&point.x>pad&&point.x<width-pad&&point.y>28&&point.y<height-16&&framing!=='object',sources:g.sources.map(s=>({sceneId:s.sceneId,...screenPoint(new THREE.Vector3(...s.center).addScaledVector(up,s.radius+1.3)),current:s.sceneId===sceneId,visible:focusedCategory===g.id&&framing!=='object'}))});}
  for(const {g,s,line}of sourceRings){line.visible=focusedCategory===g.id&&framing!=='object';line.quaternion.copy(camera.quaternion);line.material.opacity=s.sceneId===sceneId?.3:.1;}
  for(const {g,line,material}of groupRings){line.quaternion.copy(camera.quaternion);line.visible=framing!=='object';material.opacity=activeCategory===g.id?.5:.3;}
  const hoverGroup=hover?byId.get(hover)?.groupId:null;
  callbacks.onProject?.(annotations,{activeCategory:hoverCategory||hoverGroup||focusedCategory,selection});
 }
 function draw(now){raf=0;if(!allowed())return;if(lastDraw&&now-lastDraw<1000/30){raf=requestAnimationFrame(draw);return;}const dt=lastDraw?Math.min(.09,(now-lastDraw)/1000):.034;lastDraw=now;const k=reduced?1:1-Math.exp(-dt*9),difference=Math.abs(pose.distance-desired.distance)+Math.abs(pose.yaw-desired.yaw)+Math.abs(pose.pitch-desired.pitch)+pose.target.distanceTo(desired.target);pose.yaw=mix(pose.yaw,desired.yaw,k);pose.pitch=mix(pose.pitch,desired.pitch,k);pose.distance=mix(pose.distance,desired.distance,k);pose.target.lerp(desired.target,k);if(difference<.0004){Object.assign(pose,{yaw:desired.yaw,pitch:desired.pitch,distance:desired.distance});pose.target.copy(desired.target);}camera.position.set(Math.sin(pose.yaw)*Math.cos(pose.pitch)*pose.distance,Math.sin(pose.pitch)*pose.distance,Math.cos(pose.yaw)*Math.cos(pose.pitch)*pose.distance).add(pose.target);camera.lookAt(pose.target);camera.updateMatrixWorld();updateAppearance();
  hoverTarget=0;
  if(firefliesOn&&pointerInside){let best=Infinity;for(const n of nodes){if(!n.shown||!n.pickable)continue;const d=Math.hypot(n.screen.x-pointerX,n.screen.y-pointerY);if(d<best)best=d;}if(best<150)hoverTarget=1;}
  hoverAmt=mix(hoverAmt,hoverTarget,1-Math.exp(-dt*(hoverTarget?3.5:10)));if(hoverAmt<.003)hoverAmt=0;
  if(firefliesOn){const u=ffMaterial.uniforms;u.uTime.value=now*.001;u.uMouse.value.set(pointerX,pointerY);u.uHoverAmt.value=hoverAmt;u.uFocusGroup.value=focusedCategory?groups.indexOf(groupMap.get(focusedCategory)):-1;u.uFocusNode.value=selection&&byId.has(selection)?byId.get(selection).index:-1;}
  renderer.render(scene,camera);frames++;drawTimes.push(now);if(drawTimes.length>64)drawTimes.shift();
  const animating=firefliesOn&&(hoverAmt>.003||now<idleUntil||focusedCategory!==null||selection!==null);
  if(difference>.0004||needsBuild||animating)raf=requestAnimationFrame(draw);else callbacks.onView?.(viewState());}
 function viewState(){return {kind:'object-universe-3d',layoutVersion:2,yaw:desired.yaw,pitch:desired.pitch,distance:desired.distance,target:desired.target.toArray(),scope,framing,categoryId:focusedCategory,selectedObjectId:selection};}
 function inspect(){if(selection){const n=byId.get(selection);callbacks.onSelect?.(n.record,library.spec(n.record));}else{callbacks.onSelect?.(null);const g=groupMap.get(hoverCategory||focusedCategory);callbacks.onCategory?.(g||null,!!hoverCategory);}}
 function restore(saved){if(saved?.layoutVersion!==2){overview();return;}framing=saved.framing||'free';focusedCategory=groupMap.has(saved.categoryId)?saved.categoryId:null;selection=byId.has(saved.selectedObjectId)?saved.selectedObjectId:null;scope=saved.scope||'all';desired.yaw=saved.yaw;desired.pitch=saved.pitch;desired.distance=saved.distance;desired.target.fromArray(saved.target);if(framing==='overview')frame();else if(framing==='category'&&focusedCategory)frame(focusedCategory);pose.yaw=desired.yaw;pose.pitch=desired.pitch;pose.distance=desired.distance;pose.target.copy(desired.target);inspect();wake();}
 function select(id,{focus=true}={}){const n=byId.get(id);if(!n)return false;selection=id;focusedCategory=n.groupId;hoverCategory=null;if(scope==='scene'&&n.record.sceneId!==sceneId)scope='all';if(focus){framing='object';desired.target.copy(n.position);desired.distance=Math.max(4.4,3.4/camera.aspect);desired.pitch=.18;desired.yaw=-.52;}callbacks.onSelect?.(n.record,library.spec(n.record));wake();return true;}
 function stepObject(direction){const choices=nodes.filter(n=>n.shown&&(!focusedCategory||n.groupId===focusedCategory));if(!choices.length)return;const at=choices.findIndex(n=>n.record.canonicalId===selection);select(choices[(at+direction+choices.length)%choices.length].record.canonicalId);}
 function focusCategory(id){const g=groupMap.get(id);if(!g)return false;selection=null;focusedCategory=id;hoverCategory=null;scope='all';framing='category';frame(id);inspect();wake();return true;}
 function setCategoryHover(id){const next=groupMap.has(id)?id:null;if(hoverCategory===next)return;hoverCategory=next;if(!selection)inspect();wake();}
 function overview(){framing='overview';frame();selection=null;focusedCategory=null;hoverCategory=null;inspect();wake();}
 function focusScene(){if(selection){selection=null;inspect();}if(focusedCategory){focusCategory(focusedCategory);return;}overview();}
 function pick(e){const box=canvas.getBoundingClientRect(),x=e.clientX-box.x,y=e.clientY-box.y;pointer.set(x/width*2-1,1-y/height*2);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(nodes.filter(n=>n.model?.group.visible).map(n=>n.model.surface),false)[0];if(hit)return {id:hit.object.userData.id};let best=null,distance=Infinity;for(const n of nodes){if(!n.shown||!n.pickable)continue;const d=Math.hypot(x-n.screen.x,y-n.screen.y),radius=n.model?.group.visible?n.screen.r:18;if(d<radius&&d<distance){distance=d;best=n.record.canonicalId;}}if(best)return {id:best};if(framing!=='object'){const g=groups.filter(g=>g.screen?.visible&&Math.hypot(x-g.screen.x,y-g.screen.y)<g.screen.r).sort((a,b)=>Math.hypot(x-a.screen.x,y-a.screen.y)-Math.hypot(x-b.screen.x,y-b.screen.y))[0];if(g)return {categoryId:g.id};}return {};}
 let dragging=false,startX=0,startY=0,lastX=0,lastY=0,moved=0;
 canvas.addEventListener('pointerdown',e=>{dragging=true;startX=lastX=e.clientX;startY=lastY=e.clientY;moved=0;canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});},{signal});
 canvas.addEventListener('pointermove',e=>{const box=canvas.getBoundingClientRect();pointerX=e.clientX-box.x;pointerY=e.clientY-box.y;pointerInside=true;if(dragging){const dx=e.clientX-lastX,dy=e.clientY-lastY;moved=Math.max(moved,Math.hypot(e.clientX-startX,e.clientY-startY));desired.yaw-=dx*.006;desired.pitch=clamp(desired.pitch+dy*.006,-1.25,1.25);lastX=e.clientX;lastY=e.clientY;wake();}else{const hit=pick(e),id=hit.id||null;if(id!==hover){hover=id;callbacks.onHover?.(id?byId.get(id).record:null);wake();}setCategoryHover(hit.categoryId);canvas.style.cursor=id||hit.categoryId?'pointer':'grab';}},{signal});
 canvas.addEventListener('pointerup',e=>{dragging=false;if(moved<4){const hit=pick(e);if(hit.id)select(hit.id);else if(hit.categoryId)focusCategory(hit.categoryId);}},{signal});canvas.addEventListener('pointercancel',()=>dragging=false,{signal});canvas.addEventListener('pointerleave',()=>{pointerInside=false;pointerX=pointerY=-999;if(!dragging){hover=null;callbacks.onHover?.(null);setCategoryHover(null);wake();}},{signal});
 function zoom(factor){const minimum=selection?3.2:focusedCategory?Math.max(10,groupDistance(groupMap.get(focusedCategory))*.55):overviewDistance()*.65;framing='free';desired.distance=clamp(desired.distance*factor,minimum,overviewDistance()*1.3);wake();}
 canvas.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();zoom(Math.exp(e.deltaY*.0014));},{passive:false,signal});
 canvas.addEventListener('keydown',e=>{if(e.key==='Home'){e.preventDefault();overview();}else if(['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();const choices=nodes.filter(n=>n.shown&&(!focusedCategory||n.groupId===focusedCategory)),at=choices.findIndex(n=>n.record.canonicalId===selection),step=e.key==='ArrowRight'?1:-1;if(!choices.length)return;select(choices[(at+step+choices.length)%choices.length].record.canonicalId);}else if(['+','=','-','_'].includes(e.key)){e.preventDefault();zoom(e.key==='-'||e.key==='_'?1.25:.8);}else if(e.key==='Enter'&&selection){e.preventDefault();callbacks.onArchive?.(selection);}else if(e.key==='p'||e.key==='P'){e.preventDefault();theme&&theme.cycle();}else if(e.key==='e'||e.key==='E'){e.preventDefault();setFireflies(!firefliesOn);}else if(e.key==='c'||e.key==='C'){e.preventDefault();setEnergyCaliber(energyMode==='daily'?'embodied':'daily');}},{signal});
 document.addEventListener('visibilitychange',sync,{signal});window.addEventListener('sp:viewchange',sync,{signal});const observer=new ResizeObserver(()=>{resize();sync();});observer.observe(canvas.parentElement);
 function dispose(){if(!alive)return;alive=false;stop();abort.abort();observer.disconnect();for(const n of nodes)if(n.model){n.model.material.dispose();n.model.edges.dispose();}for(const {material}of nebulas)material.dispose();hazeMap.dispose();for(const {line}of sourceRings){line.geometry.dispose();line.material.dispose();}for(const {line,material}of groupRings){line.geometry.dispose();material.dispose();}ffGeometry.dispose();ffMaterial.dispose();decoGeometry.dispose();decoMaterial.dispose();library.dispose();geometry.dispose();cloudGeo.dispose();starMaterial.dispose();cloudMaterial.dispose();renderer.dispose();renderer.forceContextLoss();}
 resize();sync();return {sync,resize,dispose,select,stepObject,overview,focusScene,focusCategory,setCategoryHover,viewState,restore,zoom,layout,setEnergyCaliber,setFireflies,energyState,
  energySizes:()=>nodes.map(n=>({id:n.record.canonicalId,label:n.record.label,px:pointPx(n),target:sizes[n.index],embodiedKwh:energyMap.get(n.record.canonicalId)?.embodiedKwh??null,dailyKwh:energyMap.get(n.record.canonicalId)?.dailyKwh??null})),
  setScope(value){scope=value==='scene'?'scene':'all';if(scope==='scene'&&selection&&byId.get(selection).record.sceneId!==sceneId){selection=null;inspect();overview();}wake();},
  setScene(key){if(sceneId===key)return;sceneId=key;callbacks.onSource?.(key);wake();},
  setFrame(frame){const next=new Set(frame.visibleIds);if(next.size===visibleIds.size&&[...next].every(id=>visibleIds.has(id)))return;visibleIds=next;wake();},
  setHover(id){if(hover===id)return;hover=id;wake();},
  decorationScreen(limit){const out=[];for(let i=0;i<decoSizes.length&&i<(limit||40);i++){const p=screenPoint(new THREE.Vector3(decoPositions[i*3],decoPositions[i*3+1],decoPositions[i*3+2]));out.push({i,x:p.x,y:p.y,visible:p.visible});}return out;},
  get palette(){return theme?theme.name:'default';},
  setPalette(name){if(!theme)return theme;theme.set(name);applyPalette();return theme.name;},
  snapshot:()=>({layoutVersion:2,recordCount:count,palette:theme?theme.name:'default',ids:nodes.map(n=>n.record.canonicalId),positions:nodes.map(n=>({id:n.record.canonicalId,xyz:n.position.toArray()})),groups:groups.map(g=>({id:g.id,label:g.label,color:g.color,count:g.count,center:g.center,radius:g.radius,screen:g.screen,sources:g.sources.map(s=>({cameraId:s.cameraId,sceneId:s.sceneId,count:s.count,center:s.center,radius:s.radius}))})),sceneId,scope,frames,running:!!raf,drawTimes:[...drawTimes],focusedCategory,hoverCategory,selected:selection,selectedSpec:selection?library.spec(byId.get(selection).record):null,selectedModelReady:!!byId.get(selection)?.model,selectedTriangles:byId.get(selection)?.model?.spec.triangles||0,visibleModels:nodes.filter(n=>n.model?.group.visible).length,modelFamilies:library.size,view:viewState(),renderCalls:renderer.info.render.calls,decorativePoints:decoSizes.length,decorativeChecksum:(()=>{let h=0;for(let i=0;i<decoPositions.length;i++)h=(h+Math.round(decoPositions[i]*100)*(i%97+1))%2147483647;return h;})(),dashedRings:groupRings.length,energyCaliber:energyMode,fireflies:firefliesOn,fireflyCount:ffSizes.length,hoverAmt:+hoverAmt.toFixed(3),energyPointSizes:nodes.map(n=>({id:n.record.canonicalId,label:n.record.label,px:+pointPx(n).toFixed(2),target:+sizes[n.index].toFixed(2)})),points:nodes.map(n=>({id:n.record.canonicalId,categoryId:n.groupId,cameraId:n.record.cameraId,color:n.record.color,weight:weights[n.index],x:n.screen.x,y:n.screen.y,pickable:n.pickable,shown:n.shown,model:n.model?.spec.kind||null,lod:n.lod})),memory:{...renderer.info.memory}})
 };
}


