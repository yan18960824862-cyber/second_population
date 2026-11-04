import * as THREE from './vendor/three-r170.module.js';
import {buildCamera} from './entry-camera.js';
import {buildMonitorRoom} from './retro-terminals.js';
import {createNarrative,CHAPTER_TIMELINE,GLIDE_GAPS} from './entry-narrative.js';

const clamp=x=>Math.max(0,Math.min(1,x)),mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const range=(p,a,b)=>smooth((p-a)/(b-a));

export async function mountMonitorEntry(host,api,complete,{roomOnly=false}={}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const settings={scrollDistance:17500,rings:36,panelsPerRing:10,maxFps:30};
 const listeners=new AbortController(),signal=listeners.signal;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#020807');scene.fog=new THREE.FogExp2('#020807',.027);
 const view=new THREE.PerspectiveCamera(51,innerWidth/innerHeight,.045,230);
 let renderer;
 try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}
 catch(error){listeners.abort();throw error;}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
 renderer.domElement.setAttribute('aria-label','三维摄像头穿过黑白影像漩涡，落到四台复古监视器前');
 host.querySelector('.entry-stage').append(renderer.domElement);
 const handoff=host.querySelector('.entry-handoff'),g=handoff.getContext('2d',{alpha:true});
 const video=document.getElementById('cam'),title=host.querySelector('.entry-title'),progressInput=host.querySelector('#entryProgress');
 const phase=host.querySelector('#entryPhase'),hint=host.querySelector('#entryHint'),percent=host.querySelector('#entryPercent'),overlays=host.querySelectorAll('.entry-signal');
 const skip=host.querySelector('#entrySkip'),access=host.querySelector('.terminal-access');
 /* ────────── 叙事六章：同一个 progress 驱动，贴在穿梭轴线上 ────────── */
 const story=createNarrative(host,scene);
 story.build().catch(error=>console.warn('[STORY] narrative assets unavailable:',error.message));
 /* 时间结构（可复现）：0–.04 静场 / .04–.28 坠落三段脉冲 / .28–.86 六章与 1.5% 滑行 /
    .86–.94 07 交还 / .94–1 穿光门落地。 */
 function fallZ(p){
  const t=clamp((p-.04)/.24);
  const a=clamp(t/.34),pause=t>.34&&t<.44?(t-.34)/.10:0,b=clamp((t-.44)/.42);
  const f=.56*(a*a*a)+.025*pause+.44*(b*b*b);
  return mix(7,-30,clamp(f));
 }
 function travelZ(p){
  if(p<=.04)return 7-.12*(p/.04);
  if(p<.28)return fallZ(p);
  for(const s of CHAPTER_TIMELINE)if(p>=s.a&&p<=s.b){const t=(p-s.a)/(s.b-s.a);return mix(s.z+19,s.z+9.5,t);}
  for(let i=0;i<GLIDE_GAPS.length;i++){const [a,b]=GLIDE_GAPS[i];if(p>=a&&p<=b){const prev=CHAPTER_TIMELINE[i],next=CHAPTER_TIMELINE[i+1];return mix(prev.z+9.5,next.z+19,(p-a)/(b-a));}}
  if(p<.97)return mix(-130.5,-148,range(p,.94,.97));
  return mix(-148,-162.5,range(p,.97,1));
 }

 let target=0,progress=0,raf=0,last=0,dead=false,ready=false;
 let width=innerWidth,height=innerHeight,frame=0,compact=width/height<1.1;
 let room=null,hovered=-1,selecting=false,zoomStart=0,videoReady=false,roomPlaying=false,selectedKey=null,lastHandoffRect=null;
 const resources={geometries:new Set(),materials:new Set(),textures:new Set(),bitmaps:new Set()},previews=[];
 const zoom={from:new THREE.Vector3(),to:new THREE.Vector3(),fromQ:new THREE.Quaternion(),toQ:new THREE.Quaternion()};
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),world=new THREE.Vector3(),normal=new THREE.Vector3(),rotation=new THREE.Quaternion(),lookMatrix=new THREE.Matrix4();
 function dispose(){
  if(dead)return;dead=true;listeners.abort();cancelAnimationFrame(raf);raf=0;api.running=false;
  try{story.dispose();}catch(error){};
  previews.forEach(v=>{v.pause();v.removeAttribute('src');v.load();});
  scene.traverse(o=>{if(o.geometry)resources.geometries.add(o.geometry);for(const material of [].concat(o.material||[])){resources.materials.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.textures.add(value);}if(o.isInstancedMesh)o.dispose();});
  resources.geometries.forEach(r=>r.dispose());resources.materials.forEach(r=>r.dispose());resources.textures.forEach(r=>r.dispose());resources.bitmaps.forEach(r=>r.close());
  renderer.dispose();api.resourcesAfterDispose={...renderer.info.memory,previewVideosPlaying:previews.filter(v=>!v.paused).length};renderer.forceContextLoss();api.disposed=true;
 }
 api.cancelLoading=dispose;
 function invalidate(){if(dead||document.hidden||!ready||raf)return;api.running=true;raf=requestAnimationFrame(tick);}
 function setProgress(value){if(selecting)return;target=clamp(value);last=0;invalidate();}
 function toRoom(){if(dead||selecting)return;progress=target=1;last=0;invalidate();}
 const model=buildCamera(THREE);scene.add(model);
 scene.add(new THREE.HemisphereLight('#cdd6cd','#191d1a',2.35));
 const key=new THREE.DirectionalLight('#ece5d8',2.9),rim=new THREE.PointLight('#a6b4a8',27,30);scene.add(key,rim);
 const roomLight=new THREE.PointLight('#d5cfb9',110,28,2);roomLight.position.set(-2,-4,-169);scene.add(roomLight);
 const tunnel=new THREE.Group(),tunnelMaterials=[];scene.add(tunnel);
 let manifest,proxyManifest,textures;
 try{
  const [frameResponse,proxyResponse]=await Promise.all([fetch('integration/entry-frames/manifest.json',{signal}),fetch('integration/entry-frames/proxies.json',{signal})]);
  if(!frameResponse.ok||!proxyResponse.ok)throw Error('监控影像清单无法加载');
  [manifest,proxyManifest]=await Promise.all([frameResponse.json(),proxyResponse.json()]);
  textures=await Promise.all(manifest.frames.map(async f=>{
   const response=await fetch('integration/entry-frames/'+f.file,{signal});if(!response.ok)throw Error('取帧加载失败 '+f.file);
   const bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});
   if(dead){bitmap.close();throw new DOMException('Entry closed','AbortError');}
   resources.bitmaps.add(bitmap);const texture=new THREE.Texture(bitmap);texture.needsUpdate=true;resources.textures.add(texture);return texture;
  }));
  const clips=proxyManifest.clips.map(clip=>{
   const v=document.createElement('video');v.src='integration/entry-frames/'+clip.file;v.muted=true;v.playsInline=true;v.loop=true;v.preload='none';previews.push(v);
   const texture=new THREE.VideoTexture(v);texture.colorSpace=THREE.SRGBColorSpace;resources.textures.add(texture);return {...clip,texture,video:v};
  });
  room=buildMonitorRoom(THREE,clips);scene.add(room.root,room.furniture,room.floor);room.textures.forEach(t=>resources.textures.add(t));
 }catch(error){dispose();throw error;}
 if(api.disposed){dispose();return {dispose,setProgress,toRoom,selectStation:()=>{},snapshot:()=>({})};}
 const plane=new THREE.PlaneGeometry(1,1),dummy=new THREE.Object3D(),buckets=Array.from({length:textures.length},()=>[]);
 for(let r=0;r<settings.rings;r++)for(let j=0;j<settings.panelsPerRing;j++)buckets[(r*3+j*5)%textures.length].push({r,j});
 textures.forEach((texture,index)=>{
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,color:'#d2ded6',toneMapped:false,transparent:true});tunnelMaterials.push(material);
  const mesh=new THREE.InstancedMesh(plane,material,buckets[index].length);
  buckets[index].forEach(({r,j},i)=>{
   const angle=j*Math.PI*2/settings.panelsPerRing+r*.175,rad=6.8+.32*Math.sin(r*1.8+j*.73),z=-12-r*4.05+Math.sin(j*2.4+r)*.45;
   dummy.position.set(Math.cos(angle)*rad,Math.sin(angle)*rad,z);dummy.lookAt(0,0,z+4.3);
   dummy.rotateZ(Math.sin(r*.8+j)*.065);dummy.scale.set(4.65,3.03,1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();tunnel.add(mesh);
 });
 /* ── 速度线：静态世界坐标，相机掠过时自然成为拖尾；只改透明度，不逐帧创建对象 ── */
 const streakPositions=[];
 let seed=2166136261;
 const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return((seed>>>0)/4294967295);};
 for(let i=0;i<260;i++){
  const angle=rnd()*Math.PI*2,radius=1.4+rnd()*7.6,z=-14-rnd()*142,y=(rnd()-.5)*10;
  const len=2.4+rnd()*5.2;
  streakPositions.push(Math.cos(angle)*radius,y+Math.sin(angle)*radius*.4,z,Math.cos(angle)*radius,y+Math.sin(angle)*radius*.4,z-len);
 }
 const streakGeo=new THREE.BufferGeometry();streakGeo.setAttribute('position',new THREE.Float32BufferAttribute(streakPositions,3));
 const streakMat=new THREE.LineBasicMaterial({color:'#a9cfd8',transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
 const streaks=new THREE.LineSegments(streakGeo,streakMat);streaks.frustumCulled=false;scene.add(streaks);
 /* ── 收口光门：一张柔边径向贴图，随 progress 放大，不新增渲染循环 ── */
 const gateCanvas=document.createElement('canvas');gateCanvas.width=gateCanvas.height=256;
 const gateCtx=gateCanvas.getContext('2d');
 const grad=gateCtx.createRadialGradient(128,128,4,128,128,126);
 grad.addColorStop(0,'rgba(228,242,236,1)');grad.addColorStop(.32,'rgba(174,208,204,.55)');grad.addColorStop(.62,'rgba(120,164,164,.14)');grad.addColorStop(1,'rgba(0,0,0,0)');
 gateCtx.fillStyle=grad;gateCtx.fillRect(0,0,256,256);
 const gateTexture=new THREE.CanvasTexture(gateCanvas);gateTexture.colorSpace=THREE.SRGBColorSpace;resources.textures.add(gateTexture);
 const gateMat=new THREE.SpriteMaterial({map:gateTexture,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
 const gate=new THREE.Sprite(gateMat);gate.position.set(0,0,-144);gate.scale.setScalar(1);scene.add(gate);
 const euler=new THREE.Euler(),q=new THREE.Quaternion(),landed=new THREE.Quaternion().setFromEuler(new THREE.Euler(.08,.25,-.1));
 function playback(on){
  if(roomPlaying===on)return;roomPlaying=on;
  previews.forEach(v=>{if(on&&!document.hidden)v.play().catch(()=>{});else v.pause();});
 }
 function setHover(index){
  if(hovered===index)return;hovered=index;room.setHover(index);host.style.cursor=index>=0?'pointer':'default';
  invalidate();
 }
 function hit(e){
  pointer.set(e.clientX/width*2-1,1-e.clientY/height*2);ray.setFromCamera(pointer,view);
  return ray.intersectObjects(room.targets,false)[0]?.object.userData.index??-1;
 }
 function waitMedia(){
  if(dead||signal.aborted)return Promise.reject(new DOMException('Closed','AbortError'));
  if(video.readyState>=2)return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{cleanup();reject(Error('现场视频载入超时'));},12000);
   const cleanup=()=>{clearTimeout(timeout);video.removeEventListener('loadeddata',done);video.removeEventListener('error',fail);signal.removeEventListener('abort',abort);};
   const done=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(Error('现场视频载入失败'));},abort=()=>{cleanup();reject(new DOMException('Closed','AbortError'));};
   video.addEventListener('loadeddata',done,{once:true});video.addEventListener('error',fail,{once:true});signal.addEventListener('abort',abort,{once:true});
  });
 }
 async function selectStation(keyOrIndex){
  if(dead||selecting||progress<.985)return;
  const index=typeof keyOrIndex==='number'?keyOrIndex:room.stations.findIndex(s=>s.clip.sceneId===keyOrIndex);
  const station=room.stations[index];if(!station)return;
  selecting=true;selectedKey=station.clip.sceneId;setHover(index);phase.textContent='正在接入 '+station.clip.cameraId;hint.textContent='镜头将进入你选择的监视器';
  try{
   const sourceTime=Math.max(0,station.clip.sourceStart+station.clip.video.currentTime);
   playback(false);
   await window.__switchScene(station.clip.sceneId);if(dead)return;await waitMedia();if(dead)return;
   video.pause();video.currentTime=Math.min(sourceTime,video.duration-.05);
   if(video.seeking)await new Promise((resolve,reject)=>{video.addEventListener('seeked',resolve,{once:true});signal.addEventListener('abort',()=>reject(new DOMException('Closed','AbortError')),{once:true});});
   if(dead)return;
   // The new spatial entry owns the arrival. Finish only A's old one-time entrance fades
   // while they are covered, so the target viewport is already painted at the handover.
   document.querySelectorAll('body > .topbar,.sidebar,.viewport,.transport,body > .tickerbar').forEach(element=>{
    element.getAnimations().filter(animation=>['riseTop','riseLeft','riseBottom','fadeIn'].includes(animation.animationName)).forEach(animation=>animation.finish());
   });
   // Replace the low-resolution preview with the exact main-video frame before crossing the glass.
   const fullTexture=new THREE.VideoTexture(video);fullTexture.colorSpace=THREE.SRGBColorSpace;resources.textures.add(fullTexture);station.material.uniforms.map.value=fullTexture;
   station.screen.getWorldPosition(world);station.screen.getWorldQuaternion(rotation);normal.set(0,0,1).applyQuaternion(rotation);
   const halfHeight=.94,halfWidth=1.32,distance=Math.min(halfHeight/Math.tan(view.fov*Math.PI/360),halfWidth/(Math.tan(view.fov*Math.PI/360)*view.aspect))*.92;
   zoom.from.copy(view.position);zoom.fromQ.copy(view.quaternion);zoom.to.copy(world).addScaledVector(normal,distance);
   lookMatrix.lookAt(zoom.to,world,new THREE.Vector3(0,1,0));zoom.toQ.setFromRotationMatrix(lookMatrix);
   videoReady=true;zoomStart=performance.now();last=0;invalidate();
  }catch(error){if(dead)return;selecting=false;selectedKey=null;videoReady=false;zoomStart=0;phase.textContent='现场暂未接通，请选择另一台监视器';hint.textContent=error.message;playback(true);invalidate();}
 }
 function resize(){
  if(dead)return;width=innerWidth;height=innerHeight;compact=width/height<1.1;view.aspect=width/height;view.updateProjectionMatrix();
  room.setCompact(compact);renderer.setSize(width,height);handoff.width=width;handoff.height=height;invalidate();
 }
 function drawHandoff(amount){
  const blend=range(amount,.57,.83),fit=range(amount,.84,1);
  handoff.style.opacity=String(blend);renderer.domElement.style.opacity=String(1-range(amount,.72,.86));
  host.style.backgroundColor='rgba(2,8,7,'+(1-fit)+')';
  const interference=Math.sin(range(amount,.55,.89)*Math.PI)*.13;
  overlays.forEach(el=>{el.style.opacity=String(interference);el.style.display=interference>.001?'block':'none';});
  if(!blend)return;g.clearRect(0,0,width,height);if(video.readyState<2)return;
  const rect=video.getBoundingClientRect(),contain=Math.min(rect.width/video.videoWidth,rect.height/video.videoHeight);
  const targetWidth=video.videoWidth*contain,targetHeight=video.videoHeight*contain;
  const x=mix(0,rect.x+(rect.width-targetWidth)/2,fit),y=mix(0,rect.y+(rect.height-targetHeight)/2,fit),w=mix(width,targetWidth,fit),h=mix(height,targetHeight,fit);
  lastHandoffRect={x,y,w,h};
  const s=Math.max(w/video.videoWidth,h/video.videoHeight),vw=video.videoWidth*s,vh=video.videoHeight*s;
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.filter='grayscale('+(1-fit)+') '+getComputedStyle(video).filter;g.drawImage(video,x+(w-vw)/2,y+(h-vh)/2,vw,vh);g.filter='none';
  if(interference>.005){g.fillStyle='rgba(2,12,8,'+interference+')';for(let row=0;row<h;row+=4)g.fillRect(x,y+row,w,1);for(let i=0;i<3;i++){const yy=y+h*((i*.28+frame*.011)%1),hh=2+i*2,offset=Math.sin(frame*.74+i)*interference*18;g.drawImage(video,0,video.videoHeight*(yy-y)/h,video.videoWidth,Math.max(1,hh*video.videoHeight/h),x+offset,yy,w,hh);}}
  g.restore();
 }
 function draw(p,now){
  const fall=clamp((p-.04)/.24),land=range(p,.93,1);
  const z=travelZ(p),delta=travelZ(p)-travelZ(Math.max(0,p-.004)),speed=delta/.004;
  const shake=(reduced?0:.055)*Math.sin(fall*47.3)*(p<.9?1:0);
  const side=Math.sin(fall*5.1)*.34*(1-land);
  view.fov=mix(51,44,land);view.updateProjectionMatrix();
  const finalDistance=Math.max(12.5,(compact?4.1:5.4)/(Math.tan(view.fov*Math.PI/360)*view.aspect)*1.1);
  view.position.set(mix(side+shake*.6,compact?1:3.6,land),mix(-.15-fall*.5+shake*.4,compact?-9:-6.5,land),mix(z,-175+finalDistance,land));
  view.lookAt(side*.3,mix(-.2,compact?-10.7:-10.55,land),mix(z-20,-175,land));
  view.rotateZ((reduced?.2:1)*Math.sin(fall*Math.PI)*Math.sin(fall*3.6)*.115*(1-land)+shake*.12);
  const tunnelFade=1-range(p,.88,.955);
  const storyPhase=(p>=.26&&p<=.96)?smooth((p-.26)/.03)*(1-smooth((p-.935)/.02)):0;
  tunnelMaterials.forEach(m=>{m.opacity=tunnelFade*(1-.88*storyPhase);});
  tunnel.rotation.z=.12+p*.85;tunnel.position.y=range(p,.86,.96)*7;tunnel.visible=tunnelFade>.001;
  room.root.visible=room.furniture.visible=room.floor.visible=p>.945;
  scene.fog.density=mix(.027,.018,land);
  streakMat.opacity=clamp(Math.pow(Math.abs(speed)/900,.58)*.32,0,.34);
  const gateIn=range(p,.90,.955);
  gate.visible=p>.885&&p<.996;
  if(gate.visible){gate.scale.setScalar(mix(2.5,21,gateIn));gateMat.opacity=gateIn*(1-range(p,.96,1))*.9;}
  const drift=Math.sin(fall*7.1)*.75,drop=mix(1.7,-.65,smooth(fall));
  model.visible=p<.27;
  model.position.set(mix(side+drift+(1-range(p,0,.17))*1.1,0,land),mix(-.15-fall*.5+drop-(1-land)*.55,compact?-13.15:-12.56,land),mix(z-6.8,-171.3,land));
  model.scale.setScalar(mix(mix(1.3,1,range(p,0,.25))*(compact?.58:1),.47,land));
  euler.set(.13+fall*(reduced?.5:3.4),-.48+fall*(reduced?.45:2.6),-.12+fall*(reduced?.5:3.8));q.setFromEuler(euler);model.quaternion.copy(q).slerp(landed,land);
  key.position.set(-4,7,mix(z+3,-164,land));rim.position.set(3,1,mix(z-1,-168,land));roomLight.intensity=110*land;
  playback(p>.96&&!selecting);
  const roomMode=p>.985;access.inert=!roomMode;host.classList.toggle('in-monitor-room',roomMode);
  title.style.opacity=String(1-range(p,.02,.062));title.style.transform='translateY('+(-range(p,0,.2)*22)+'px)';
  const inStory=story.update(p,view,width,height);
  host.classList.toggle('in-story',inStory);
  phase.textContent=selecting?'正在接入 '+(room.stations.find(s=>s.clip.sceneId===selectedKey)?.clip.cameraId||'现场'):roomMode?(hovered>=0?room.stations[hovered].clip.cameraId+' / '+room.stations[hovered].clip.alias:'四路观察台'):inStory?'叙事 / '+(CHAPTER_TIMELINE[story.activeChapter]?.key||'').toUpperCase():p<.28?'坠入监控影像':p<.94?'穿过光门':'抵达观察台';
  hint.textContent=selecting?'从这块屏幕进入对应的监控现场':roomMode?'点击一块实体屏幕，接入对应监控':inStory?'向下滚动继续 · 向上滚动回看':p>.94?'即将落到四台监视器前':'向下滚动进入 · 向上滚动回看';
  progressInput.value=String(Math.round(p*1000));percent.value=String(Math.round(p*100)).padStart(2,'0')+'%';
  skip.hidden=roomMode&&!roomOnly;
  let zoomAmount=0;
  if(selecting&&videoReady){zoomAmount=clamp((now-zoomStart)/(reduced?220:1250));const t=smooth(zoomAmount);view.position.lerpVectors(zoom.from,zoom.to,t);view.quaternion.copy(zoom.fromQ).slerp(zoom.toQ,t);}
  host.querySelector('.entry-header').style.opacity=host.querySelector('.entry-footer').style.opacity=String((inStory?0:1)*(1-range(zoomAmount,.45,.85)));
  renderer.render(scene,view);drawHandoff(zoomAmount);api.progress=p;api.frames++;frame++;
  if(zoomAmount>=1)complete('screen');
 }
 function tick(now){
  raf=0;if(dead||document.hidden){api.running=false;return;}
  if(last&&now-last<1000/settings.maxFps){invalidate();return;}
  const dt=last?Math.min(90,now-last):34;last=now;
  progress=reduced?target:mix(progress,target,1-Math.exp(-dt/92));if(Math.abs(progress-target)<.00018)progress=target;
  draw(progress,now);if(dead)return;
  if(Math.abs(progress-target)>.00001||roomPlaying||selecting)invalidate();else api.running=false;
 }
 host.addEventListener('wheel',e=>{if(selecting)return;e.preventDefault();const delta=(Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX)*(e.deltaMode===1?18:e.deltaMode===2?height:1);setProgress(target+delta/settings.scrollDistance);},{passive:false,signal});
 host.addEventListener('pointermove',e=>{if(progress>.985&&!selecting)setHover(hit(e));},{signal});
 host.addEventListener('pointerleave',()=>{if(!selecting)setHover(-1);},{signal});
 host.addEventListener('click',e=>{if(e.target.closest('button,input,label')||selecting||progress<.985)return;const index=hit(e);if(index>=0)selectStation(index);},{signal});
 host.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.target.matches('button,input'))return;
  if(progress>.985&&['ArrowLeft','ArrowRight','Enter'].includes(e.key)){
   e.preventDefault();e.stopPropagation();if(e.key==='Enter')selectStation(hovered>=0?hovered:1);else setHover(hovered<0?0:(hovered+(e.key==='ArrowRight'?1:3))%4);return;
  }
  const step=['ArrowDown','ArrowRight'].includes(e.key)?.045:['ArrowUp','ArrowLeft'].includes(e.key)?-.045:e.key==='PageDown'||e.code==='Space'?.15:e.key==='PageUp'?-.15:0;
  if(e.key==='Home'||e.key==='End'||step){e.preventDefault();e.stopPropagation();setProgress(e.key==='Home'?0:e.key==='End'?1:target+step);}
 },{capture:true,signal});
 let touchY=null;host.addEventListener('touchstart',e=>{if(!e.target.matches('button,input'))touchY=e.touches[0].clientY;},{passive:true,signal});
 host.addEventListener('touchmove',e=>{if(touchY===null)return;e.preventDefault();const next=e.touches[0].clientY;setProgress(target+(touchY-next)*2/settings.scrollDistance);touchY=next;},{passive:false,signal});
 host.addEventListener('touchend',()=>{touchY=null;},{signal});
 progressInput.addEventListener('input',()=>setProgress(progressInput.value/1000),{signal});
 proxyManifest.clips.forEach((clip,index)=>{const button=document.createElement('button');button.type='button';button.textContent=clip.cameraId+' '+clip.alias;button.onclick=()=>selectStation(index);button.onfocus=()=>setHover(index);access.append(button);});
 window.addEventListener('resize',resize,{signal});
 document.addEventListener('visibilitychange',()=>{cancelAnimationFrame(raf);raf=0;api.running=false;if(document.hidden)previews.forEach(v=>v.pause());else{last=0;if(roomPlaying)previews.forEach(v=>v.play().catch(()=>{}));invalidate();}},{signal});
 renderer.domElement.addEventListener('webglcontextlost',event=>{if(dead)return;event.preventDefault();dispose();host.classList.add('entry-fallback');phase.textContent='三维信号中断，可直接进入监控';api.failed='WebGL context lost';skip.hidden=false;skip.textContent='直接进入监控 ↗';},{signal});
 ready=true;resize();invalidate();
 return {dispose,setProgress,toRoom,selectStation,snapshot:()=>({target,progress,z:travelZ(progress),scrollDistance:settings.scrollDistance,scrollSteps:Math.round(settings.scrollDistance/120),panels:settings.rings*settings.panelsPerRing,sourceFrames:manifest.frames.length,sourceCameras:proxyManifest.clips.map(f=>f.cameraId),threeRevision:THREE.REVISION,renderCalls:renderer.info.render.calls,maxFps:settings.maxFps,reducedMotion:reduced,mode:selecting?'entering-screen':progress>.985?'monitor-room':progress>=CHAPTER_TIMELINE[0].a&&progress<=CHAPTER_TIMELINE.at(-1).b?'story':progress<.28?'falling':'landing',chapter:story.activeChapter,storyReady:story.ready,storyDebug:story.debug(view,width,height),triangles:renderer.info.render.triangles,storyChapters:CHAPTER_TIMELINE.map(s=>({key:s.key,a:s.a,b:s.b,z:s.z})),glideGaps:GLIDE_GAPS.map(g=>[g[0],g[1]]),activeStoryElements:[...host.querySelectorAll('.story-ch')].filter(el=>el.style.visibility==='visible'&&Number(el.style.opacity)>.01).map(el=>el.dataset.ch),streakOpacity:streakMat.opacity,gateOpacity:gateMat.opacity,selectedKey,hovered,lastHandoffRect,contextLost:renderer.getContext().isContextLost(),stations:room.stations.map(s=>{s.screen.getWorldPosition(world);world.project(view);return {sceneId:s.clip.sceneId,cameraId:s.clip.cameraId,x:(world.x*.5+.5)*width,y:(-.5*world.y+.5)*height,previewTime:s.clip.video.currentTime,previewPlaying:!s.clip.video.paused,previewDecoded:s.clip.video.readyState>=2};})})};
}
