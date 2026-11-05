import * as THREE from './vendor/three-r170.module.js';
import {universeModels} from './universe-models.js';
let library,stop;
export function playStudy(dialog,r,intro){
 stop?.();library??=universeModels(THREE);
 const model=library.get(r),canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d'),button=dialog.querySelector('.study-spin');
 const points=model.edges?.attributes.position;if(!points){intro.reveal();canvas.hidden=button.hidden=true;return;}
 let angle=-.55,frame=0,last=0,spin=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const reduced=!spin,duration=reduced?1200:window.ArchiveSequence.duration;
 let elapsed=0;
 const meter=intro.stage.querySelector('progress'),number=intro.stage.querySelector('output');
 function label(){button.textContent=spin?'暂停旋转 Ⅱ':'继续旋转 ▷';}
 function draw(t){
  if(!dialog.open||!canvas.isConnected)return;
  const delta=last?Math.min(t-last,100):0;last=t;
  if(intro){
   elapsed+=delta;
   const scan=window.ArchiveSequence.frame(elapsed,duration);
   angle=-.55+(reduced?0:scan.yaw);
   meter.value=scan.progress;number.textContent=scan.progress+'%';
   if(scan.done){intro.reveal();intro=null;angle=-.55;}
  }else if(spin)angle+=delta*.00026;
  const w=canvas.clientWidth,h=canvas.clientHeight,d=Math.min(devicePixelRatio,2);
  if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}
  ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);ctx.strokeStyle='#a0d5df';ctx.lineWidth=1;
  ctx.beginPath();const ca=Math.cos(angle),sa=Math.sin(angle);
  for(let i=0;i<points.count;i++){const x=points.getX(i),y=points.getY(i),z=points.getZ(i),depth=x*sa+z*ca,scale=Math.min(w,h)*.33/(1-depth*.07);
   const px=w/2+(x*ca-z*sa)*scale,py=h/2-(y*.94-depth*.34)*scale;
   if(i%2)ctx.lineTo(px,py);else ctx.moveTo(px,py);}
  ctx.stroke();if(spin||intro)frame=requestAnimationFrame(draw);
 }
 button.onclick=()=>{spin=!spin;last=0;cancelAnimationFrame(frame);label();draw(performance.now());};
 canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();angle+=e.key==='ArrowLeft'?-.16:.16;if(!spin)draw(performance.now());}};
 const resize=new ResizeObserver(()=>{if(!spin&&!intro)draw(performance.now());});resize.observe(canvas);
 stop=()=>{cancelAnimationFrame(frame);resize.disconnect();dialog.removeEventListener('close',stop);};dialog.addEventListener('close',stop,{once:true});label();draw(performance.now());
}