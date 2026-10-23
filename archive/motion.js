/* Runtime-only scan glitches and energy-flow animation. No measured telemetry. */
(function(){'use strict';
 const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
 const states=new WeakMap(),reduce=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 function surface(canvas,w,h){let s=states.get(canvas);if(!s||s.w!==w||s.h!==h){const buffer=document.createElement('canvas');buffer.width=Math.max(1,Math.round(w));buffer.height=Math.max(1,Math.round(h));s={buffer,w,h};states.set(canvas,s);}return s;}
 function draw(ctx,image,region,w,h,o={}){
  if(!image.complete||!image.naturalWidth)return false;
  const s=surface(ctx.canvas,w,h),b=s.buffer,g=b.getContext('2d'),[rx,ry,rw,rh]=region;
  const sw=rw*image.naturalWidth,sh=rh*image.naturalHeight,scale=Math.min(w/sw,h/sh)*(o.loading?.9:.98),dw=sw*scale,dh=sh*scale,x=(w-dw)/2,y=(h-dh)/2;
  g.clearRect(0,0,w,h);g.drawImage(image,rx*image.naturalWidth,ry*image.naturalHeight,sw,sh,x,y,dw,dh);
  ctx.clearRect(0,0,w,h);ctx.save();
  if(o.loading){const p=Math.max(0,Math.min(1,o.completion??1));ctx.beginPath();ctx.rect(0,h*(1-p),w,h*p);ctx.clip();}
  ctx.drawImage(b,0,0,w,h);
  if(!reduce()&&o.glitch!==false){
   const t=o.time||0,frame=Math.floor(t/130),active=frame%19<7;
   // Broken acquisition bands move fragments of the actual artwork, not a second object.
   if(active){for(let i=0;i<(o.loading?7:5);i++){const yy=y+dh*(.08+hash(frame*7+i*11)*.83),hh=2+hash(frame+i*3)*Math.min(14,dh*.025),offset=(hash(frame*17+i*5)-.5)*(o.loading?60:44);
    ctx.fillStyle='#000';ctx.fillRect(x,yy,dw,hh);ctx.globalAlpha=.55+hash(frame+i)*.4;ctx.drawImage(b,0,yy,w,hh,offset,yy,w,hh);ctx.globalAlpha=1;
   }}
   // Stable clusters of missing quads, with occasional reconstruction flicker.
   const clusters=o.loading?[[.76,.26],[.29,.72],[.55,.49]]:[[.83,.25],[.27,.74],[.59,.42]];
   clusters.forEach(([u,v],j)=>{for(let k=0;k<12;k++){if(hash(frame*.13+j*5+k)>.86)continue;const xx=x+dw*(u+(hash(j*31+k*5)-.5)*.14),yy=y+dh*(v+(hash(j*13+k*7)-.5)*.1),bw=4+hash(k*17+j)*dw*.052,bh=2+hash(k*11+j)*dh*.016;ctx.fillStyle='#000';ctx.fillRect(xx,yy,bw,bh);
     if(k%3===0){ctx.globalAlpha=.5;ctx.drawImage(b,Math.max(0,xx),Math.max(0,yy),bw,bh,xx+(j%2?1:-1)*(12+k*3),yy-3,bw,bh);ctx.globalAlpha=1;}
   }});
  }
  ctx.restore();return {x,y,w:dw,h:dh};
 }
 function energy(ctx,rect,time){if(reduce()||!rect)return;const{x,y,w,h}=rect,t=time*.00014;ctx.save();
  // Paths follow the controller leads and battery bus bars in the existing view.
  const paths=[[[.22,.37],[.36,.44],[.47,.5],[.59,.58]],[[.67,.3],[.61,.42],[.64,.56],[.79,.67]],[[.28,.7],[.4,.6],[.5,.52],[.56,.36]]];
  for(let j=0;j<paths.length;j++){const p=paths[j],u=((t+j*.31)%1)*3,k=Math.floor(u),v=u-k,a=p[k],b=p[Math.min(3,k+1)],px=x+(a[0]+(b[0]-a[0])*v)*w,py=y+(a[1]+(b[1]-a[1])*v)*h;ctx.strokeStyle='rgba(174,228,245,.22)';ctx.lineWidth=.7;ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(x+q[0]*w,y+q[1]*h):ctx.moveTo(x+q[0]*w,y+q[1]*h));ctx.stroke();ctx.shadowColor='#bceeff';ctx.shadowBlur=5;ctx.fillStyle='#bceeff';ctx.fillRect(px-1.5,py-1,3,2);ctx.shadowBlur=0;}
  // Keep the hardware and its brightness steady; only current markers move.
  ctx.restore();
 }
 let raf=0,target=null,last=0;
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0;target=null;last=0;}
 function start(canvas,obj){stop();if(obj.category!=='person')return;target={canvas,obj};const loop=time=>{if(!target||!canvas.isConnected)return;const container=document.getElementById('oaDossier');if(container.hidden){stop();return;}if(time-last>50){last=time;window.ArchiveScans.detail(canvas,obj,'assembly',{time,motion:true,energy:true,glitch:false});}if(!reduce())raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);}
 window.ArchiveMotion={draw,energy,start,stop};
})();
