/* A continuous, rotatable engineering mesh. Illustrative geometry, not a scan.
   All details share the same camera and projection; no screen-space overlays. */
(function(){'use strict';
 const E=window.ModelEngine,TAU=Math.PI*2,C=[40,58,65],cache={};
 const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const unit=a=>{const d=Math.hypot(...a)||1;return a.map(x=>x/d);};
 function quad(m,p,level=.12){const n=unit(cross(p[1].map((v,i)=>v-p[0][i]),p[3].map((v,i)=>v-p[0][i])));m.face(p,C,n,{lvl:level+(m.faces.length%13)/13*.26});}
 function rings(m,rows,level=.12){for(let j=1;j<rows.length;j++)for(let i=0;i<rows[j].length;i++){const k=(i+1)%rows[j].length;quad(m,[rows[j-1][i],rows[j][i],rows[j][k],rows[j-1][k]],level);}return rows;}
 function tube(m,a,b,r1,r2=r1,segments=16,steps=8,cloth=0){const n=unit(b.map((v,i)=>v-a[i])),u=unit(cross(n,Math.abs(n[1])<.9?[0,1,0]:[1,0,0])),v=cross(n,u),rows=[];for(let j=0;j<=steps;j++){const t=j/steps,c=mix(a,b,t),r=(r1+(r2-r1)*t)*(1+cloth*Math.sin(t*Math.PI*6));rows.push(Array.from({length:segments},(_,i)=>{const q=i/segments*TAU;return c.map((x,k)=>x+r*(Math.cos(q)*u[k]+Math.sin(q)*v[k]));}));}rings(m,rows);return rows;}
 function loft(m,sections,N=24,cloth=0){const rows=sections.map((s,j)=>Array.from({length:N},(_,i)=>{const a=i/N*TAU,cs=Math.cos(a),sn=Math.sin(a),power=s[5]||1,fold=1+cloth*(Math.sin(a*3+j*1.8)+.35*Math.sin(a*5-j*.9));return[s[0]+s[2]*Math.sign(cs)*Math.pow(Math.abs(cs),power)*fold,s[1],s[4]+s[3]*Math.sign(sn)*Math.pow(Math.abs(sn),power)*fold];}));return rings(m,rows);}
 function line(m,a,b,w=1){m.stroke(a,b,w,.05);}
 function seam(m,points,w=.8){for(let i=1;i<points.length;i++)line(m,points[i-1],points[i],w);}
 function box(m,a,b,div=8){for(let axis=0;axis<3;axis++){const u=(axis+1)%3,v=(axis+2)%3;for(const s of [0,1]){const p=(x,y)=>{const q=[];q[axis]=s?b[axis]:a[axis];q[u]=a[u]+(b[u]-a[u])*x;q[v]=a[v]+(b[v]-a[v])*y;return q;};for(let i=0;i<div;i++)for(let j=0;j<div;j++)quad(m,s?[p(i/div,j/div),p((i+1)/div,j/div),p((i+1)/div,(j+1)/div),p(i/div,(j+1)/div)]:[p(i/div,j/div),p(i/div,(j+1)/div),p((i+1)/div,(j+1)/div),p((i+1)/div,j/div)]);for(const z of [0,1]){line(m,p(0,z),p(1,z));line(m,p(z,0),p(z,1));}}}}
 function torus(m,x,y,z,R,r,N=56,K=10,arc=TAU){const rows=[];for(let i=0;i<=N;i++){const a=i/N*arc;rows.push(Array.from({length:K},(_,j)=>{const b=j/K*TAU;return[x+(R+r*Math.cos(b))*Math.cos(a),y+(R+r*Math.cos(b))*Math.sin(a),z+r*Math.sin(b)];}));}rings(m,rows,.1);}
 function wheel(m,x){const y=-.59;
  torus(m,x,y,0,.273,.073,64,12);
  for(const s of [-1,1]){torus(m,x,y,s*.065,.223,.012,48,6);torus(m,x,y,s*.078,.155,.009,48,5);torus(m,x,y,s*.083,.052,.014,32,6);
   for(let i=0;i<12;i++){const a=i/12*TAU;tube(m,[x+Math.cos(a)*.054,y+Math.sin(a)*.054,s*.075],[x+Math.cos(a+.1)*.216,y+Math.sin(a+.1)*.216,s*.069],.012,.016,5,2);}
   for(let i=0;i<36;i++){const a=i/36*TAU;line(m,[x+Math.cos(a)*.163,y+Math.sin(a)*.163,s*.086],[x+Math.cos(a+.016)*.184,y+Math.sin(a+.016)*.184,s*.086],.55);}
  }
  for(let i=0;i<60;i++){const a=i/60*TAU;for(const s of [-1,1])line(m,[x+Math.cos(a)*.34,y+Math.sin(a)*.34,s*.035],[x+Math.cos(a+.024)*.331,y+Math.sin(a+.024)*.331,s*.06],.7);}
  tube(m,[x,y,-.11],[x,y,.11],.045,.045,12,3);
 }
 function spring(m,a,b){tube(m,a,b,.021,.021,10,5);const rows=[];for(let i=0;i<=150;i++){const t=i/150,c=mix(a,b,t),q=t*TAU*9;const p=[c[0]+Math.cos(q)*.045,c[1],c[2]+Math.sin(q)*.045];if(i)line(m,rows.at(-1),p,.8);rows.push(p);}}
 function build(){const m=new E.Mesh();m.cleanWire=true;
  wheel(m,-.76);wheel(m,.76);
  // Chassis, step-through floor, fairings and integrated front apron.
  box(m,[-.68,-.41,-.19],[.47,-.33,.19],10);
  loft(m,[[-.4,-.34,.23,.19,0,.55],[-.43,-.23,.28,.2,0,.6],[-.43,-.1,.3,.195,0,.6],[-.43,.02,.28,.18,0,.6],[-.38,.12,.21,.16,0,.65]],28);
  loft(m,[[.58,-.39,.11,.16,0,.5],[.67,-.2,.12,.17,0,.5],[.69,.02,.105,.19,0,.6],[.6,.21,.115,.21,0,.6],[.52,.35,.09,.19,0,.65],[.49,.4,.065,.16,0,.7]],28);
  for(const s of [-1,1]){tube(m,[.76,-.59,s*.1],[.55,.3,s*.1],.026,.035,12,12);spring(m,[-.74,-.54,s*.14],[-.55,-.02,s*.17]);tube(m,[-.72,-.55,s*.14],[-.3,-.25,s*.13],.025,.025,8,6);
   tube(m,[.52,.34,s*.14],[.48,.44,s*.25],.023,.023,12,4);tube(m,[.48,.44,s*.24],[.42,.44,s*.34],.029,.029,12,6);
   tube(m,[.5,.41,s*.22],[.52,.64,s*.31],.009,.009,6,6);loft(m,[[.53,.6,.07,.04,s*.32,.65],[.53,.66,.09,.045,s*.32,.65],[.53,.71,.06,.035,s*.32,.65]],20);
   line(m,[.47,.45,s*.32],[.4,.46,s*.31]);line(m,[.4,.46,s*.31],[.43,.4,s*.22]);
   // Wheel guard follows the actual wheel plane.
   const pts=Array.from({length:41},(_,i)=>{const a=.12+i/40*(Math.PI-.24);return[.76+Math.cos(a)*.365,-.59+Math.sin(a)*.365,s*.105];});for(let i=1;i<pts.length;i++)line(m,pts[i-1],pts[i]);
   box(m,[.63,-.62,s*.10],[.73,-.48,s*.10+.028],4);
  }
  box(m,[.58,.13,-.13],[.706,.215,.13],8);box(m,[.565,.125,-.14],[.716,.222,.14],4);
  // Upholstered seat and clothing-shaped torso, with shoulders and collar.
  loft(m,[[-.31,.06,.32,.16,0,.55],[-.31,.11,.35,.17,0,.55],[-.31,.16,.31,.15,0,.65]],28);
  loft(m,[[-.2,.2,.18,.16,0,.65],[-.2,.29,.18,.17,0,.7],[-.19,.38,.175,.17,0,.75],[-.17,.48,.18,.18,0,.7],[-.13,.59,.175,.2,0,.7],[-.09,.68,.16,.22,0,.65],[-.065,.74,.14,.205,0,.7],[-.06,.79,.1,.135,0,.75]],32,.035);
  loft(m,[[.01,.78,.065,.085,0,.7],[.02,.85,.067,.085,0,.8]],20);
  // Helmet: closed lower chin shell, visor opening, crown and vent ribs.
  loft(m,[[.065,.84,.125,.13,0,.6],[.085,.89,.16,.155,0,.7],[.075,.96,.175,.16,0,.8],[.055,1.04,.17,.16,0,.9],[.02,1.12,.14,.14,0,1],[0,1.17,.08,.09,0,1],[0,1.19,.015,.018,0,1]],32);
  for(const s of [-1,1]){for(const y of [.94,1.035])line(m,[.19,y,s*.05],[.11,y,s*.15]);for(let i=0;i<4;i++)line(m,[-.03+i*.022,1.16,-.065],[-.01+i*.022,1.175,.065],.8);torus(m,.065,.965,s*.16,.024,.004,20,4);}
  // Curved visor projects from the helmet shell, with a continuous sealing rim.
  const visor=[];for(let j=0;j<=4;j++){const t=j/4,y=.94+t*.115;visor.push(Array.from({length:17},(_,i)=>{const a=-1.1+i/16*2.2;return[.072+(.178-t*.011)*Math.cos(a)+.006,y,(.161-t*.003)*Math.sin(a)];}));}
  for(let j=1;j<visor.length;j++)for(let i=1;i<visor[j].length;i++)quad(m,[visor[j-1][i-1],visor[j][i-1],visor[j][i],visor[j-1][i]],.15);
  seam(m,visor[0],1.15);seam(m,visor.at(-1),1.15);seam(m,visor.map(r=>r[0]),1);seam(m,visor.map(r=>r.at(-1)),1);
  for(const s of [-1,1]){seam(m,[[.19,.89,s*.06],[.207,.91,s*.04],[.21,.93,s*.03]],.8);for(let k=0;k<3;k++)seam(m,[[.11+k*.016,1.1,s*.045],[.09+k*.016,1.13,s*.05]],.75);}
  // Bent sleeves and trousers, individually tapered with cuffs, folds and boots.
  for(const s of [-1,1]){const shoulder=[-.05,.7,s*.17],elbow=[.19,.47,s*.25],hand=[.43,.44,s*.285];tube(m,shoulder,elbow,.1,.075,18,12,.06);tube(m,elbow,hand,.075,.052,18,10,.05);tube(m,[.37,.445,s*.28],hand,.057,.057,18,2);tube(m,hand,[.47,.425,s*.29],.047,.043,12,4);
   for(let i=0;i<4;i++)tube(m,[.46,.43,s*(.26+i*.015)],[.49,.4,s*(.26+i*.015)],.008,.007,6,3);
   tube(m,[-.24,.22,s*.11],[.2,-.02,s*.22],.125,.105,18,13,.045);tube(m,[.2,-.02,s*.22],[.1,-.3,s*.22],.105,.067,18,13,.05);
   loft(m,[[.17,-.36,.16,.073,s*.22,.55],[.17,-.32,.17,.077,s*.22,.6],[.12,-.27,.09,.069,s*.22,.7]],22);
   for(let i=0;i<5;i++)line(m,[.13+i*.018,-.278,s*.22-.045],[.13+i*.018,-.278,s*.22+.045],.6);
   // Jacket seams and reflective strip, kept on its surface.
   line(m,[-.02,.67,s*.206],[-.02,.53,s*.19]);line(m,[-.02,.53,s*.19],[-.13,.45,s*.18]);
   for(const y of [.53,.55])line(m,[-.24,y,s*.166],[-.04,y,s*.19],.85);
  }
  line(m,[.105,.74,0],[.005,.3,0],1.1);
  // Clothing construction: collar, pocket flaps, zipper, waist and broad folds.
  seam(m,[[.025,.79,-.085],[.07,.75,-.045],[.083,.72,0],[.07,.75,.045],[.025,.79,.085]],1.1);
  seam(m,[[.083,.72,0],[.074,.65,0],[.045,.58,0],[.018,.48,0],[-.004,.37,0],[-.012,.27,0]],.85);
  for(const s of [-1,1]){seam(m,[[.025,.65,s*.07],[.007,.645,s*.145],[-.005,.58,s*.15],[.029,.585,s*.072],[.025,.65,s*.07]],.85);seam(m,[[.024,.625,s*.073],[.004,.62,s*.147]],.75);
   seam(m,[[-.008,.32,s*.075],[-.065,.345,s*.16],[-.16,.32,s*.178]],.8);
   seam(m,[[.16,-.015,s*.317],[.235,-.04,s*.295],[.212,-.12,s*.295]],.8);
   for(let k=0;k<3;k++)seam(m,[[.105,-.19-k*.028,s*.28],[.16,-.2-k*.028,s*.27],[.18,-.21-k*.028,s*.24]],.55);
   spring(m,[.735,-.45,s*.105],[.665,-.15,s*.105]);
   // Fairing seam follows the front apron, plus a cable and a rear motor cover.
   seam(m,[[.61,.32,s*.15],[.68,.19,s*.18],[.79,.02,s*.15],[.775,-.17,s*.13],[.67,-.35,s*.14]],.8);
   seam(m,[[.46,.43,s*.24],[.5,.24,s*.23],[.69,.06,s*.21],[.73,-.13,s*.15]],.65);
   box(m,[-.81,-.63,s*.11],[-.46,-.44,s*.11+.035],4);
   for(let k=0;k<6;k++)line(m,[-.76+k*.045,-.465,s*.157],[-.76+k*.045,-.6,s*.157],.55);
  }
  // Rear insulated cargo box, lid gasket, frame, straps and latch hardware.
  box(m,[-.99,.23,-.26],[-.56,.81,.26],10);box(m,[-1.005,.78,-.273],[-.545,.83,.273],5);
  for(const s of [-1,1]){for(const x of [-.93,-.63]){box(m,[x,.24,s*.268],[x+.022,.78,s*.268+.008],2);box(m,[x-.008,.49,s*.28],[x+.04,.55,s*.28+.015],2);}tube(m,[-.95,.2,s*.21],[-.55,.2,s*.21],.015,.015,6,6);}
  for(let i=0;i<7;i++){const x=-1.025-(i%3)*.026,y=.77+(i%4)*.025,z=.22+(i%2)*.03;line(m,[x,y,z],[x-.014,y+.009,z+.006],.7);}
  m.size={w:2.25,h:2.2,d:.8};m.ground=-.94;m.detailKind='rider';m.archiveKind='rider';return m;
 }
 const original=window.ArchiveModels.build;
 window.ArchiveModels.build=function(category,subtype){if(category!=='person')return original(category,subtype);return cache.rider||(cache.rider=build());};
 // Painter order hides rear wires instead of drawing a transparent cage.
 function render(ctx,m,o){const w=o.w,h=o.h,dist=8.6,yaw=(o.yaw||0)+2.6,pitch=.14,scale=Math.min(w*.66/2.25,h*.72/2.2),cx=w*.5,cy=h*.49,completion=o.completion??1;
  const cyaw=Math.cos(yaw),syaw=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),rotated=new Map(),projected=new Map();
  const rotate=p=>{let q=rotated.get(p);if(q)return q;const x=p[0]*cyaw+p[2]*syaw,z=-p[0]*syaw+p[2]*cyaw;q=[x,p[1]*cp-z*sp,p[1]*sp+z*cp];rotated.set(p,q);return q;},project=q=>{let p=projected.get(q);if(p)return p;p=[cx+q[0]*scale*dist/(dist-q[2]),cy-(q[1]-.08)*scale*dist/(dist-q[2])];projected.set(q,p);return p;};
  ctx.clearRect(0,0,w,h);if((o.opacity??1)<=0)return;ctx.save();ctx.globalAlpha=o.opacity??1;ctx.lineJoin='round';
  const faces=m.faces.map((f,i)=>{const q=f.p.map(rotate);return{f,i,q,z:q.reduce((s,p)=>s+p[2],0)/q.length};}).sort((a,b)=>a.z-b.z);
  for(const a of faces){if(a.f.lvl>completion)continue;const q=a.q.map(project),n=rotate(a.f.n);if(n[2]<-.12)continue;
   // Coherent small missing patches, stable in object space throughout rotation.
   const p=a.f.p[0],damage=(p[0]<-.8&&p[1]>.65&&p[2]>.16)||(p[0]>.64&&p[1]>-.04&&p[1]<.055&&p[2]>.1)||(p[0]<-.19&&p[0]>-.27&&p[1]>.38&&p[1]<.43&&p[2]>.1);
   if(o.damage&&damage&&a.i%5!==0)continue;
   ctx.beginPath();q.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle='#000';ctx.fill();ctx.strokeStyle=n[2]>.5?'rgba(168,211,224,.66)':'rgba(168,211,224,.34)';ctx.lineWidth=.52;ctx.stroke();
  }
  for(const bold of [false,true]){ctx.strokeStyle=bold?'rgba(191,232,245,.9)':'rgba(168,211,224,.5)';ctx.lineWidth=bold?.9:.55;ctx.beginPath();for(const e of m.edges){if(e.lvl>completion||(e.w>=.8)!==bold)continue;const mid=rotate(mix(e.a,e.b,.5));if(mid[2]<-.18)continue;const a=project(rotate(e.a)),b=project(rotate(e.b));ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();}ctx.restore();
 }
 // Tiny cards use a compact mesh without bitmap, scan noise or glitch passes.
 function thumbnail(ctx,o){
  const m=cache.compact||(cache.compact=original('person','delivery'));
  if(!m.contours){const map=new Map(),key=p=>p.map(x=>Math.round(x*10000)).join(',');for(const f of m.faces)for(let i=0;i<f.p.length;i++){const a=f.p[i],b=f.p[(i+1)%f.p.length],ka=key(a),kb=key(b),k=ka<kb?ka+'|'+kb:kb+'|'+ka;let e=map.get(k);if(!e){e={a,b,n:[]};map.set(k,e);}e.n.push(f.n||[0,0,1]);}m.contours=[...map.values()];}
  const w=o.w,h=o.h,scale=Math.min(w*.9/2.05,h*.9/2.2),yaw=-.45,pitch=.14,rot=p=>window.Cam.rotate(p,yaw,pitch),P=p=>{const q=rot(p),f=8.6/(8.6-q[2]);return[w*.5+q[0]*scale*f,h*.55-q[1]*scale*f];};
  ctx.clearRect(0,0,w,h);ctx.save();ctx.lineWidth=.65;ctx.strokeStyle='rgba(168,211,224,.85)';ctx.beginPath();
  for(const e of m.contours){const facing=e.n.map(n=>rot(n)[2]>.015),crease=e.n.length>1&&e.n[0].reduce((s,v,i)=>s+v*e.n[1][i],0)<.65;if(!(facing.some(Boolean)&&(e.n.length===1||facing.some(v=>!v)||crease)))continue;const a=P(e.a),b=P(e.b);ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();
  ctx.lineWidth=.5;ctx.strokeStyle='rgba(168,211,224,.5)';ctx.beginPath();for(const e of m.edges){if(e.w<.65)continue;const a=P(e.a),b=P(e.b);ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();ctx.restore();
 }
 window.RiderGeometry={render,build,thumbnail};
})();
