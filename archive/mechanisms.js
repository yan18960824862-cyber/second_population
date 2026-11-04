/* Animated engineering cutaways. All cycles are illustrative, never telemetry.
   Fixed hardware is cached; only rotors, pistons and flow markers move. */
(function(){
  'use strict';
  const TAU=Math.PI*2,states=new WeakMap(),ink='#A8D3E0';
  const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function kindFor(obj){
    if(obj.category==='person')return 'energy';
    if(obj.category==='infrastructure')return 'lighting';
    const st=window.ArchiveCatalog?.subtype(obj)||window.ModelEngine.detectSubtype(obj.category,obj.labelEn);
    return st==='truck'?'drive':'thermal';
  }
  function title(obj){return {energy:'ENERGY MODULE / FLOW STUDY',lighting:'LED ARRAY / CURRENT STUDY',drive:'DRIVE ASSEMBLY / CYCLE STUDY',thermal:'COOLING LOOP / FLOW STUDY'}[kindFor(obj)];}
  function setup(canvas){
    const r=canvas.getBoundingClientRect(),w=Math.max(1,canvas.clientWidth||r.width),h=Math.max(1,canvas.clientHeight||r.height),dpr=Math.min(devicePixelRatio||1,1.5);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,w,h};
  }
  function path(ctx,pts,color='rgba(168,211,224,.65)',width=.7,close=false){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(close)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function fill(ctx,pts,color='#000'){ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=color;ctx.fill();}
  function arc(ctx,x,y,r,start=0,end=TAU,color='rgba(168,211,224,.65)',width=.7){ctx.beginPath();ctx.arc(x,y,r,start,end);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function project(w,h){return (u,v,z=0)=>[w*(.13+u*.69+z*.16),h*(.17+v*.66-z*.14)];}
  function plate(ctx,P,x,y,w,h,d=.16,grid=0){
    const A=P(x,y),B=P(x+w,y),C=P(x+w,y+h),D=P(x,y+h),E=P(x,y,d),F=P(x+w,y,d),G=P(x+w,y+h,d),H=P(x,y+h,d);
    for(const pts of [[A,B,F,E],[B,C,G,F],[E,F,G,H]]){fill(ctx,pts);path(ctx,pts,'rgba(168,211,224,.76)',.8,true);}
    if(grid){for(let i=1;i<grid;i++)path(ctx,[P(x+w*i/grid,y,d),P(x+w*i/grid,y+h,d)],'rgba(168,211,224,.28)',.5);
      for(let j=1;j<Math.ceil(grid*.6);j++)path(ctx,[P(x,y+h*j/Math.ceil(grid*.6),d),P(x+w,y+h*j/Math.ceil(grid*.6),d)],'rgba(168,211,224,.23)',.5);}
  }
  function pipe(ctx,pts){path(ctx,pts,'rgba(168,211,224,.26)',4);path(ctx,pts,'rgba(168,211,224,.8)',.8);}
  function pointOn(pts,u){const lengths=pts.slice(1).map((p,i)=>Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1])),total=lengths.reduce((s,v)=>s+v,0);let d=(u%1)*total;
    for(let i=0;i<lengths.length;i++){if(d<=lengths[i]){const t=d/(lengths[i]||1);return pts[i].map((v,k)=>v+(pts[i+1][k]-v)*t);}d-=lengths[i];}return pts.at(-1);}
  function markers(ctx,pts,time,count=3,rate=.000095){for(let j=0;j<count;j++){const p=pointOn(pts,time*rate+j/count);ctx.fillStyle=ink;ctx.shadowColor=ink;ctx.shadowBlur=4;ctx.fillRect(p[0]-1.5,p[1]-1.2,3,2.4);}ctx.shadowBlur=0;}
  function rotor(ctx,x,y,r,angle){
    // Fine rotor ribs stay inside their own housing; no added opaque fan leaves.
    for(let i=0;i<9;i++){const a=angle+i/9*TAU;const pts=Array.from({length:7},(_,j)=>{const t=j/6,q=a+t*.38,rr=r*(.34+t*.53);return[x+Math.cos(q)*rr,y+Math.sin(q)*rr];});path(ctx,pts,'rgba(168,211,224,.8)',.8);}
    arc(ctx,x,y,r*.25,0,TAU,ink,.9);arc(ctx,x,y,r*.14);
  }
  function caption(ctx,w,h,text){ctx.fillStyle='rgba(168,211,224,.55)';ctx.font='9px ArchivePixel,monospace';ctx.fillText(text,8,h-7);}
  function thermalBase(ctx,w,h){const P=project(w,h);
    plate(ctx,P,.04,.1,.92,.75,.19,30);
    for(const x of [.005,.935])plate(ctx,P,x,.06,.06,.83,.27,7);
    for(const y of [.12,.23,.34,.45,.56,.67,.78])path(ctx,[P(.045,y,.22),P(.94,y,.22)],'rgba(168,211,224,.33)',.5);
    const fanY=h*.17+(.47*.66-.035)*h,fanR=Math.min(w*.155,h*.22);
    const fans=[P(.28,.47,.25),P(.74,.47,.25)].map(([x,y])=>[x,y,fanR]);
    for(const [x,y,r]of fans){ctx.fillStyle='#000';ctx.beginPath();ctx.arc(x,y,r*1.08,0,TAU);ctx.fill();for(const k of [1.08,1,.94,.32])arc(ctx,x,y,r*k);for(let i=0;i<8;i++){const a=i/8*TAU;path(ctx,[[x+Math.cos(a)*r*.34,y+Math.sin(a)*r*.34],[x+Math.cos(a)*r,y+Math.sin(a)*r]],'rgba(168,211,224,.2)',.5);}}
    const loop=[P(.97,.14,.28),P(1.12,.14,.28),P(1.12,.95,.28),P(-.08,.95,.28),P(-.08,-.01,.28),P(.96,-.01,.28),P(.96,.14,.28)];pipe(ctx,loop);
    for(const x of [.09,.84])for(const y of [.15,.73]){const p=P(x,y,.23);arc(ctx,...p,1.8);}
    caption(ctx,w,h,'COOLANT / ROTOR CYCLE · ILLUSTRATIVE');return {fans,loop};
  }
  function driveBase(ctx,w,h){
    const P=project(w,h);plate(ctx,P,.05,.22,.72,.54,.24,12);plate(ctx,P,.04,.17,.74,.09,.28,10);
    const chambers=[];
    for(let i=0;i<4;i++){const p=P(.13+i*.155,.22,.28),cw=w*.077,ch=h*.255;ctx.fillStyle='#000';ctx.fillRect(p[0],p[1],cw,ch);ctx.strokeStyle='rgba(168,211,224,.75)';ctx.lineWidth=.8;ctx.strokeRect(p[0],p[1],cw,ch);chambers.push({x:p[0]+cw/2,y:p[1],w:cw,h:ch});
      for(let j=0;j<4;j++)path(ctx,[[p[0]-4,p[1]+j*5],[p[0],p[1]+j*5]],'rgba(168,211,224,.45)',.5);
      // Barrel rims, cooling ribs and bolt lands give the fixed cutaway depth.
      for(let j=0;j<9;j++){const yy=p[1]+j*ch/9;path(ctx,[[p[0]-3,yy],[p[0]+cw,yy],[p[0]+cw+6,yy-3]],'rgba(168,211,224,.28)',.5);}
      for(const xx of [p[0]-2,p[0]+cw+2])arc(ctx,xx,p[1]-4,1.3);
      const top=[p[0]+cw/2,p[1]-6];ctx.beginPath();ctx.ellipse(top[0],top[1],cw*.5,3,0,0,TAU);ctx.strokeStyle=ink;ctx.lineWidth=.65;ctx.stroke();
    }
    for(let j=0;j<7;j++)path(ctx,[P(.06,.72+j*.012,.27),P(.73,.72+j*.012,.27)],'rgba(168,211,224,.45)',.6);
    for(const x of [.08,.22,.38,.54,.7]){const p=P(x,.77,.27);arc(ctx,...p,1.7);}
    for(const x of [.1,.7]){plate(ctx,P,x,.76,.11,.08,.32,3);}
    const axleY=h*.65;path(ctx,[[w*.2,axleY],[w*.75,axleY]],ink,1.1);
    const hub=[w*.78,h*.59,Math.min(w*.108,h*.19)];for(const k of [1.13,1,.86,.28])arc(ctx,hub[0],hub[1],hub[2]*k);
    for(let i=0;i<40;i++){const a=i/40*TAU;path(ctx,[[hub[0]+Math.cos(a)*hub[2],hub[1]+Math.sin(a)*hub[2]],[hub[0]+Math.cos(a)*hub[2]*1.1,hub[1]+Math.sin(a)*hub[2]*1.1]],'rgba(168,211,224,.6)',.6);}
    // Fixed side cooling core and return pipe, distinct from moving crank assembly.
    plate(ctx,P,.9,.09,.16,.66,.17,6);
    for(let j=0;j<18;j++)path(ctx,[P(.91,.13+j*.032,.19),P(1.04,.13+j*.032,.19)],'rgba(168,211,224,.35)',.5);
    const loop=[P(.1,.09,.28),P(.83,.09,.28),P(1.04,.16,.28),P(1.04,.84,.28),P(.13,.84,.28),P(.13,.63,.28)];pipe(ctx,loop);
    caption(ctx,w,h,'MECHANISM STUDY / NOT VEHICLE SPECIFICATION');return {chambers,axleY,hub,loop};
  }
  function lightingBase(ctx,w,h){const P=project(w,h);plate(ctx,P,.04,.1,.92,.72,.28,16);const cells=[];
    for(let i=0;i<8;i++)for(let j=0;j<4;j++){const x=.095+i*.105,y=.17+j*.145;plate(ctx,P,x,y,.071,.09,.3,1);cells.push(P(x+.035,y+.044,.31));}
    for(let j=0;j<4;j++)pipe(ctx,[P(.02,.22+j*.145,.33),P(.99,.22+j*.145,.33)]);
    const loop=[P(-.02,.22,.33),P(-.1,.22,.33),P(-.1,.94,.33),P(.99,.94,.33),P(.99,.22,.33)];pipe(ctx,loop);
    caption(ctx,w,h,'LED ARRAY / ILLUSTRATIVE CURRENT');return {cells,loop};
  }
  function render(canvas,obj,time=0){
    const {ctx,w,h}=setup(canvas),kind=kindFor(obj);
    if(kind==='energy')return window.ArchiveScans.detail(canvas,obj,'assembly',{time,motion:true,energy:true,glitch:false});
    let s=states.get(canvas);
    if(!s||s.w!==w||s.h!==h||s.kind!==kind){const base=document.createElement('canvas');base.width=Math.round(w*(Math.min(devicePixelRatio||1,1.5)));base.height=Math.round(h*(Math.min(devicePixelRatio||1,1.5)));const g=base.getContext('2d');g.setTransform(base.width/w,0,0,base.height/h,0,0);
      const parts=kind==='drive'?driveBase(g,w,h):kind==='lighting'?lightingBase(g,w,h):thermalBase(g,w,h);s={base,w,h,kind,...parts};states.set(canvas,s);}
    ctx.clearRect(0,0,w,h);ctx.drawImage(s.base,0,0,w,h);ctx.save();
    const t=reduced()?0:time;
    if(kind==='thermal')for(let i=0;i<s.fans.length;i++){const [x,y,r]=s.fans[i];rotor(ctx,x,y,r,t*.00052*(i?-1:1));}
    if(kind==='drive'){
      s.chambers.forEach((c,i)=>{const a=t*.0011+i*Math.PI*.73,offset=(.5+Math.sin(a)*.5)*c.h*.36,py=c.y+c.h*.16+offset;
        ctx.fillStyle='#000';ctx.fillRect(c.x-c.w*.4,py,c.w*.8,6);ctx.strokeStyle=ink;ctx.lineWidth=.8;ctx.strokeRect(c.x-c.w*.4,py,c.w*.8,6);
        for(const dy of [2,4])path(ctx,[[c.x-c.w*.4,py+dy],[c.x+c.w*.4,py+dy]],'rgba(168,211,224,.45)',.5);
        const pin=[c.x+Math.cos(a)*c.w*.22,s.axleY+Math.sin(a)*4];path(ctx,[[c.x,py+6],pin,[c.x,s.axleY]],ink,.9);arc(ctx,...pin,2);
      });rotor(ctx,...s.hub,t*.0009);
    }
    if(kind==='lighting')s.cells.forEach(([x,y],i)=>{const active=(Math.floor(t/500)+Math.floor(i/4))%8;ctx.fillStyle=active<2?'rgba(168,211,224,.75)':'rgba(168,211,224,.16)';ctx.fillRect(x-1.5,y-1.5,3,3);});
    if(!reduced())markers(ctx,s.loop,time,3);
    ctx.restore();return true;
  }
  function wheel(canvas,obj){const{ctx,w,h}=setup(canvas);
    if(obj.category==='infrastructure'){const P=project(w,h);ctx.clearRect(0,0,w,h);plate(ctx,P,.18,.04,.57,.9,.3,8);for(let j=0;j<12;j++)path(ctx,[P(.2,.1+j*.06,.32),P(.73,.1+j*.06,.32)],'rgba(168,211,224,.6)',.7);caption(ctx,w,h,'HEAT SINK / STRUCTURAL STUDY');return;}
    const subtype=window.ArchiveCatalog?.subtype(obj)||window.ModelEngine.detectSubtype(obj.category,obj.labelEn);
    window.ArchiveEngineering.render(ctx,window.ArchiveEngineering.component(subtype),{w,h,yaw:-.36,pitch:.1,completion:1,opacity:1,glitch:false});
  }
  window.ArchiveMechanisms={render,wheel,title,kindFor};
})();
