/* Fine wire model following the user's selected detailed loading reference.
   Uses the existing curved geometry and the shared AC acquisition timeline. */
(function(){'use strict';
 const E=window.ModelEngine,TAU=2*Math.PI,C=[0,0,0];let cached;
 const add=(a,b)=>a.map((x,i)=>x+b[i]),mul=(a,t)=>a.map(x=>x*t),sub=(a,b)=>a.map((x,i)=>x-b[i]);
 const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const unit=a=>mul(a,1/(Math.hypot(...a)||1));
 function spline(points,t){const x=Math.max(0,Math.min(.999999,t))*(points.length-1),i=Math.floor(x),f=x-i,a=points[Math.max(0,i-1)],b=points[i],c=points[Math.min(points.length-1,i+1)],d=points[Math.min(points.length-1,i+2)];return b.map((_,k)=>.5*((2*b[k])+(-a[k]+c[k])*f+(2*a[k]-5*b[k]+4*c[k]-d[k])*f*f+(-a[k]+3*b[k]-3*c[k]+d[k])*f*f*f));}
 function stroke(m,points,w=.9,level=.05){for(let i=1;i<points.length;i++)m.stroke(points[i-1],points[i],w,level);}
 function panel(m,p,n,name='detail'){m.face(p,C,n,{lvl:0});const f=m.faces.at(-1);f.part=name;f.wires=p.map((_,i)=>[i,(i+1)%p.length]);f.gridLevel=.1;return f;}
 function roundedRect(u,rx,rz,r=.03){const q=Math.PI*r/2,parts=[q,2*(rx-r),q,2*(rz-r),q,2*(rx-r),q,2*(rz-r)],total=parts.reduce((a,b)=>a+b,0);let d=(u%1)*total,k=0;while(k<7&&d>parts[k])d-=parts[k++];const t=d/parts[k];if(k===0)return[rx-r+r*Math.cos(t*Math.PI/2),rz-r+r*Math.sin(t*Math.PI/2)];if(k===1)return[(rx-r)*(1-2*t),rz];if(k===2)return[-rx+r+r*Math.cos((1+t)*Math.PI/2),rz-r+r*Math.sin((1+t)*Math.PI/2)];if(k===3)return[-rx,(rz-r)*(1-2*t)];if(k===4)return[-rx+r+r*Math.cos((2+t)*Math.PI/2),-rz+r+r*Math.sin((2+t)*Math.PI/2)];if(k===5)return[(rx-r)*(-1+2*t),-rz];if(k===6)return[rx-r+r*Math.cos((3+t)*Math.PI/2),-rz+r+r*Math.sin((3+t)*Math.PI/2)];return[rx,(rz-r)*(-1+2*t)];}
 function surface(m,point,U,V,center,{wrap=true,gridU=true,gridV=true,caps=false,name='surface'}={}){
  const smooth=3,nu=U*smooth,nv=V*smooth,rows=[],wireStep=['helmet','jacket','sleeve','trousers','cargo','front-panel','side-panel'].includes(name)?1:2;
  for(let j=0;j<=nv;j++)rows.push(Array.from({length:nu+1},(_,i)=>point(i/nu,j/nv)));
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
   const p=[rows[j][i],rows[j+1][i],rows[j+1][i+1],rows[j][i+1]],mid=mul(p.reduce((s,q)=>add(s,q),[0,0,0]),.25),out=sub(mid,center((j+.5)/nv)),n=unit(cross(sub(p[1],p[0]),sub(p[3],p[0])));
   if(dot(n,out)<0)n.forEach((x,k)=>n[k]=-x);
   const wires=[];
   if((gridU&&i%wireStep===0)||(!wrap&&i===0))wires.push([0,1]);
   if((gridV&&j%wireStep===0)||j===0)wires.push([0,3]);
   if(!wrap&&i===nu-1)wires.push([3,2]);if(j===nv-1)wires.push([1,2]);
   m.face(p,C,n,{lvl:0});const f=m.faces.at(-1);f.wires=wires;f.part=name;f.gridLevel=.08+((Math.floor(i/smooth)+Math.floor(j/smooth))%4)*.055;
  }
  if(caps)for(const k of [0,nv]){const p=rows[k].slice(0,nu);m.face(p,C,k===0?[0,-1,0]:[0,1,0],{lvl:0});m.faces.at(-1).wires=[];m.faces.at(-1).part=name;}
  return rows;
 }
 function loft(m,sections,U=12,V=6,name='shell'){
  const at=t=>spline(sections,t),center=t=>{const s=at(t);return[s[0],s[1],s[4]||0];};
  return surface(m,(u,t)=>{const s=at(t),a=u*TAU,power=s[5]||1,cs=Math.cos(a),sn=Math.sin(a);if(name==='cargo'||name==='cargo-lid'){const p=roundedRect(u,s[2],s[3]);return[s[0]+p[0],s[1],(s[4]||0)+p[1]];}const cloth=name==='jacket'?1+(.035*Math.sin(a*3+s[1]*21)+.025*Math.cos(a*5-s[1]*32))*Math.sin(Math.PI*t):1;return[s[0]+s[2]*Math.sign(cs)*Math.pow(Math.abs(cs),power)*cloth,s[1],(s[4]||0)+s[3]*Math.sign(sn)*Math.pow(Math.abs(sn),power)*cloth];},U,V,center,{caps:true,name});
 }
 function ellipsoid(m,c,r,U=12,V=7,name='rounded'){
  return surface(m,(u,v)=>{const a=u*TAU,b=.001+v*(Math.PI-.002);return[c[0]+r[0]*Math.sin(b)*Math.cos(a),c[1]+r[1]*Math.cos(b),c[2]+r[2]*Math.sin(b)*Math.sin(a)];},U,V,()=>c,{name});
 }
 function sweep(m,points,U=8,V=7,name='limb'){
  const at=t=>spline(points,t),center=t=>at(t).slice(0,3);
  const rows=surface(m,(u,t)=>{const c=at(t),d=unit(sub(center(Math.min(1,t+.005)),center(Math.max(0,t-.005)))),a=unit(cross(d,Math.abs(d[2])<.85?[0,0,1]:[0,1,0])),b=cross(d,a),q=u*TAU,cloth=['sleeve','trousers'].includes(name)?1+(.075*Math.sin(t*TAU*3+q*2)+.035*Math.sin(t*TAU*6-q))*Math.sin(t*Math.PI):1;return add(c.slice(0,3),mul(add(mul(a,Math.cos(q)),mul(b,Math.sin(q))),c[3]*cloth));},U,V,center,{name});
  for(const [row,t,sign]of [[rows[0],0,-1],[rows.at(-1),1,1]]){const n=mul(unit(sub(center(Math.min(1,t+.01)),center(Math.max(0,t-.01)))),sign);m.face(row.slice(0,-1),C,n,{lvl:0});m.faces.at(-1).wires=[];m.faces.at(-1).part=name;}
 }
 function tube(m,a,b,r=.02){sweep(m,[[...a,r],[...b,r]],6,2,'tube');}
 function ring(m,x,y,z,r,w=.8){const start=m.edges.length;stroke(m,Array.from({length:73},(_,i)=>{const a=i/72*TAU;return[x+r*Math.cos(a),y+r*Math.sin(a),z];}),w);for(let i=start;i<m.edges.length;i++)m.edges[i].normal=[0,0,Math.sign(z)||1];}
 function wheel(m,x){const c=[x,-.59,0];
  surface(m,(u,v)=>{const a=u*TAU,b=v*TAU;return[x+(.27+.067*Math.cos(b))*Math.cos(a),-.59+(.27+.067*Math.cos(b))*Math.sin(a),.073*Math.sin(b)];},20,4,()=>c,{name:'tire'});
  for(const s of [-1,1]){ring(m,x,-.59,s*.073,.215);ring(m,x,-.59,s*.079,.055,.9);for(let i=0;i<6;i++){const a=i/6*TAU,b=a+.075,points=[[x+Math.cos(a)*.055,-.59+Math.sin(a)*.055,s*.08],[x+Math.cos(b)*.214,-.59+Math.sin(b)*.214,s*.075],[x+Math.cos(b+.07)*.214,-.59+Math.sin(b+.07)*.214,s*.075],[x+Math.cos(a+.14)*.055,-.59+Math.sin(a+.14)*.055,s*.08]];m.face(points,C,[0,0,s]);m.faces.at(-1).wires=[[0,1],[1,2],[2,3],[3,0]];m.faces.at(-1).gridLevel=.12;m.faces.at(-1).part='spoke';}}
 }
 function coil(m,a,b){const d=unit(sub(b,a)),u=unit(cross(d,[0,0,1])),v=cross(d,u),points=[];for(let i=0;i<=96;i++){const t=i/96,c=add(a,mul(sub(b,a),t)),q=t*TAU*4;points.push(add(c,add(mul(u,.035*Math.cos(q)),mul(v,.035*Math.sin(q)))));}stroke(m,points,.8,.16);}
 function build(){const m=new E.Mesh();m.cleanWire=true;m.approvedWire=true;
  wheel(m,-.76);wheel(m,.76);
  // Rounded step-through body, floor, saddle and front apron.
  loft(m,[[-.1,-.415,.56,.17,0,.35],[-.1,-.39,.59,.195,0,.35],[-.1,-.35,.57,.19,0,.35]],12,2,'floor');
  loft(m,[[-.43,-.35,.25,.16,0,.5],[-.43,-.23,.3,.19,0,.55],[-.4,-.06,.3,.19,0,.6],[-.34,.08,.26,.16,0,.65]],12,5,'side-panel');
  loft(m,[[.56,-.35,.12,.15,0,.6],[.65,-.2,.115,.18,0,.7],[.69,.03,.11,.19,0,.7],[.62,.23,.12,.19,0,.7],[.53,.35,.08,.16,0,.7]],12,6,'front-panel');
  loft(m,[[-.3,.08,.31,.16,0,.5],[-.3,.12,.34,.18,0,.65],[-.3,.17,.31,.165,0,.8]],12,2,'seat');
  // Plain integrated headlight; dark interior and one border only.
  const frontAt=(y,z)=>{const sections=[[-.35,.56,.12,.15],[-.2,.65,.115,.18],[.03,.69,.11,.19],[.23,.62,.12,.19],[.35,.53,.08,.16]];let k=0;while(k<sections.length-2&&sections[k+1][0]<y)k++;const a=sections[k],b=sections[k+1],t=(y-a[0])/(b[0]-a[0]),v=a.map((n,i)=>n+(b[i]-n)*t);return[v[1]+v[2]*Math.pow(Math.max(0,1-Math.pow(Math.abs(z/v[3]),2/.7)),.7/2)+.006,y,z];};
  const lamp=[[.16,-.095],[.17,-.115],[.255,-.11],[.27,-.09],[.27,.09],[.255,.11],[.17,.115],[.16,.095]].map(([y,z])=>frontAt(y,z));panel(m,lamp,[1,.4,0],'headlight');stroke(m,[...lamp,lamp[0]],1.1);
  for(const z of [-.05,.05])stroke(m,Array.from({length:41},(_,i)=>{const a=i/40*TAU;return frontAt(.215+.031*Math.cos(a),z+.031*Math.sin(a));}),.7);
  for(const x of [-.76,.76])surface(m,(u,v)=>{const a=.12+u*(Math.PI-.24),z=(v-.5)*.22,r=.359+.012*(1-(z/.11)**2);return[x+r*Math.cos(a),-.59+r*Math.sin(a),z];},12,3,()=>[x,-.59,0],{wrap:false,name:'fender'});
  for(const s of [-1,1]){tube(m,[.76,-.59,s*.1],[.56,.26,s*.1],.025);coil(m,[.74,-.46,s*.1],[.68,-.19,s*.1]);tube(m,[.49,.35,s*.12],[.46,.43,s*.27],.025);tube(m,[.46,.43,s*.24],[.4,.43,s*.32],.028);
   tube(m,[.49,.43,s*.23],[.51,.63,s*.31],.009);ellipsoid(m,[.52,.66,s*.32],[.075,.045,.025],6,3,'mirror');
   coil(m,[-.76,-.52,s*.13],[-.56,-.08,s*.17]);
   const fender=Array.from({length:40},(_,i)=>{const a=.18+i/39*(Math.PI-.36);return[.76+.36*Math.cos(a),-.59+.36*Math.sin(a),s*.097];});stroke(m,fender,.9);
   loft(m,[[-.63,-.61,.22,.035,s*.14,.5],[-.63,-.5,.24,.042,s*.14,.65],[-.63,-.44,.2,.035,s*.14,.8]],8,2,'motor-cover');
  }
  // Human anatomy: broad curves and connected bent limbs, minimal garment detail.
  ellipsoid(m,[-.24,.235,0],[.205,.11,.19],10,4,'hip');
  loft(m,[[-.2,.22,.18,.16,0,.9],[-.19,.35,.18,.18,0,1],[-.15,.5,.175,.205,0,1],[-.09,.68,.165,.22,0,1],[-.045,.77,.12,.17,0,1],[-.035,.82,.075,.09,0,1]],12,6,'jacket');
  tube(m,[-.025,.79,0],[.015,.89,0],.067);
  // Sculpted full-face helmet: extended chin, cheek shell, crown and wrap visor.
  const hc=[.035,1.06,0],helmetSections=[[.04,.865,.08,.095,0,.8],[.075,.905,.14,.14,0,.85],[.075,.955,.165,.155,0,.9],[.045,1.04,.185,.17,0,1],[.013,1.125,.175,.162,0,1],[-.012,1.2,.13,.13,0,1],[-.02,1.245,.045,.05,0,1],[-.02,1.25,.004,.004,0,1]];
  loft(m,helmetSections,18,10,'helmet');
  const atY=y=>{let k=0;while(k<helmetSections.length-2&&helmetSections[k+1][1]<y)k++;const a=helmetSections[k],b=helmetSections[k+1],t=(y-a[1])/(b[1]-a[1]);return a.map((v,i)=>v+(b[i]-v)*t);};
  const visor=(u,v)=>{const a=-1.26+u*2.52,y=1.135-v*.16,s=atY(y);return[s[0]+(s[2]+.009)*Math.cos(a),y,(s[3]+.009)*Math.sin(a)];};
  surface(m,visor,6,3,()=>hc,{wrap:false,gridU:false,gridV:false,name:'visor'});
  for(const v of [0,1])stroke(m,Array.from({length:49},(_,i)=>visor(i/48,v)),1.1);for(const u of [0,1])stroke(m,Array.from({length:19},(_,i)=>visor(u,i/18)),.95);
  loft(m,[[-.025,.805,.082,.09,0,.8],[0,.84,.077,.088,0,.9],[.02,.875,.065,.075,0,1]],12,3,'collar');
  for(const z of [-.045,-.015,.015,.045])stroke(m,[[.237,.925,z],[.247,.943,z],[.245,.953,z]],.7);
  for(const s of [-1,1])stroke(m,[[.02,1.239,s*.04],[.073,1.222,s*.05],[.128,1.18,s*.06]],.85);
  for(const s of [-1,1]){
   sweep(m,[[0,.72,s*.175,.085],[.11,.62,s*.22,.082],[.24,.48,s*.25,.073],[.43,.43,s*.27,.052]],8,7,'sleeve');
   ellipsoid(m,[.46,.43,s*.275],[.067,.043,.043],6,4,'glove');
   for(let i=0;i<4;i++){const z=s*(.25+i*.016);sweep(m,[[.47,.455,z,.011],[.508,.446,z,.012],[.518,.421,z,.01],[.498,.404,z,.008]],5,3,'finger');}
   sweep(m,[[.454,.445,s*.245,.015],[.487,.421,s*.23,.014],[.506,.421,s*.244,.01]],5,3,'thumb');
   sweep(m,[[-.22,.24,s*.11,.115],[-.02,.18,s*.2,.115],[.21,-.015,s*.225,.101],[.2,-.12,s*.225,.08],[.115,-.29,s*.225,.063]],8,8,'trousers');
   loft(m,[[.19,-.396,.142,.07,s*.225,.6],[.195,-.374,.158,.077,s*.225,.6],[.19,-.331,.153,.078,s*.225,.7],[.13,-.274,.09,.068,s*.225,.85],[.112,-.215,.07,.065,s*.225,.9]],12,6,'boot');
   loft(m,[[.19,-.401,.145,.071,s*.225,.6],[.193,-.39,.16,.079,s*.225,.6]],12,1,'sole');
  }
  stroke(m,[[.036,.785,-.065],[.08,.73,0],[.036,.785,.065]],.9);stroke(m,[[.08,.73,0],[.07,.65,0],[.025,.53,0],[-.005,.4,0],[-.012,.29,0]],.8);
  // Legible structural details from the selected reference: helmet hinges,
  // chest flaps, jacket seams, straps, glove fingers and boot soles.
  for(const s of [-1,1]){
   ring(m,.03,1.045,s*.171,.024,.85);
   stroke(m,[[.045,.76,s*.085],[.04,.69,s*.115],[.012,.6,s*.145],[-.018,.51,s*.16]],.85);
   stroke(m,[[.045,.76,s*.108],[.04,.69,s*.138],[.012,.6,s*.168],[-.018,.51,s*.183]],.7);
   stroke(m,[[.055,.66,s*.055],[.028,.66,s*.13],[.004,.58,s*.14],[.04,.58,s*.06],[.055,.66,s*.055]],.8);
   panel(m,[[.085,.657,s*.057],[.057,.657,s*.132],[.037,.594,s*.14],[.069,.594,s*.06]],[1,0,s*.2],'chest-pocket');
   stroke(m,[[.086,.64,s*.06],[.061,.64,s*.13]],.8);
   ellipsoid(m,[.205,.5,s*.326],[.058,.064,.017],8,4,'elbow-patch');
   stroke(m,[[.05,.635,s*.06],[.022,.635,s*.133]],.7);
   stroke(m,[[-.015,.33,s*.08],[-.07,.35,s*.16],[-.16,.32,s*.175]],.7);
   for(let i=0;i<4;i++){const z=s*(.249+i*.016);stroke(m,[[.455,.463,z],[.487,.457,z],[.508,.433,z]],.6);}
   stroke(m,Array.from({length:41},(_,i)=>{const a=i/40*TAU;return[.18+.153*Math.cos(a),-.372,s*.225+.071*Math.sin(a)];}),.8);
   for(let i=0;i<4;i++)stroke(m,[[.15+i*.02,-.28,s*.19],[.15+i*.02,-.276,s*.26]],.6);
  }
  // Cargo: four broad panels per face and a single lid seam, no tiny ornaments.
  loft(m,[[-.76,.23,.2,.235,0,.3],[-.76,.28,.23,.265,0,.3],[-.76,.75,.23,.265,0,.3],[-.76,.82,.205,.24,0,.3]],16,5,'cargo');
  loft(m,[[-.76,.778,.235,.27,0,.3],[-.76,.812,.234,.27,0,.3],[-.76,.83,.21,.246,0,.3]],16,2,'cargo-lid');
  const cargoRim=Array.from({length:97},(_,i)=>{const a=i/96*TAU;return[-.76+.233*Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.3,.77,.268*Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.3];});stroke(m,cargoRim,.9);
  for(const s of [-1,1])for(const x of [-.92,-.62])stroke(m,[[x,.68,s*.271],[x,.75,s*.271],[x+.023,.75,s*.271],[x+.023,.68,s*.271],[x,.68,s*.271]],.7);
  for(const s of [-1,1])for(const x of [-.92,-.62]){ellipsoid(m,[x+.011,.71,s*.279],[.019,.044,.009],6,3,'cargo-latch');for(const y of [.285,.755])ring(m,x+.01,y,s*.274,.009,.65);}
  for(const s of [-1,1]){stroke(m,[[-.63,-.605,s*.185],[-.82,-.605,s*.185],[-.865,-.55,s*.185],[-.82,-.465,s*.185],[-.48,-.465,s*.185]],.8);for(let i=0;i<6;i++)stroke(m,[[-.77+i*.044,-.585,s*.188],[-.77+i*.044,-.49,s*.188]],.55);}
  // Front brake rotor and holes are real geometry in the wheel plane.
  for(const s of [-1,1]){surface(m,(u,v)=>{const a=u*TAU,r=.095+v*.08;return[.76+r*Math.cos(a),-.59+r*Math.sin(a),s*.084];},24,2,()=>[.76,-.59,0],{name:'brake-disc'});for(let i=0;i<18;i++){const a=i/18*TAU;ring(m,.76+.151*Math.cos(a),-.59+.151*Math.sin(a),s*.088,.008,.55);}ellipsoid(m,[.635,-.49,s*.104],[.035,.066,.021],8,4,'brake-caliper');}
  // Cache adjacent normals for a continuous smooth silhouette without fine mesh.
  const edges=new Map(),key=p=>p.map(v=>Math.round(v*1e5)).join(',');
  m.faces.forEach((f,index)=>{f.links=[];for(let i=0;i<f.p.length;i++){const a=f.p[i],b=f.p[(i+1)%f.p.length],ka=key(a),kb=key(b),k=ka<kb?ka+'|'+kb:kb+'|'+ka;let e=edges.get(k);if(!e){e={faces:[]};edges.set(k,e);}e.faces.push(index);f.links.push(e);}});
  m.size={w:2.25,h:2.25,d:.78};m.ground=-.94;m.detailKind='rider';m.archiveKind='rider';return m;
 }
 function render(ctx,m,o){
  if(!m.approvedWire)return previous.render(ctx,m,o);
  if(window.RiderGPU&&window.RiderGPU.draw(ctx,m,o))return;
  const w=o.w,h=o.h,yaw=(o.yaw||0)+2.6,pitch=.14,dist=8.6,scale=Math.min(w*.71/2.25,h*.78/2.25),cx=w/2,cy=h*.5,completion=o.completion??1,opacity=o.opacity??1;
  ctx.clearRect(0,0,w,h);if(opacity<=0)return;
  const cyaw=Math.cos(yaw),syaw=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),rot=p=>{const x=p[0]*cyaw+p[2]*syaw,z=-p[0]*syaw+p[2]*cyaw;return[x,p[1]*cp-z*sp,p[1]*sp+z*cp];},points=new Map();
  const P=p=>{let q=points.get(p);if(q)return q;const a=rot(p),f=dist/(dist-a[2]);q=[cx+a[0]*scale*f,cy-(a[1]-.1)*scale*f,a[2]];points.set(p,q);return q;};
  const normals=m.faces.map(f=>rot(f.n||[0,0,1])),faces=m.faces.map((f,i)=>{const q=f.p.map(P);return{f,i,q,z:q.reduce((s,p)=>s+p[2],0)/q.length};}).sort((a,b)=>a.z-b.z);
  ctx.save();ctx.globalAlpha=opacity;ctx.lineJoin='round';
  for(const a of faces){if(normals[a.i][2]<-.03)continue;const {f,q}=a;
   ctx.beginPath();q.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle='#000';ctx.fill();
   // Surface grids appear in bands; black occluding surfaces remain complete.
   ctx.strokeStyle='rgba(168,211,224,.8)';ctx.lineWidth=.7;ctx.beginPath();if(completion>=(f.gridLevel??.1))for(const [i,j]of f.wires||[]){ctx.moveTo(q[i][0],q[i][1]);ctx.lineTo(q[j][0],q[j][1]);}ctx.stroke();
   if(completion>.015){ctx.beginPath();for(let i=0;i<f.p.length;i++){const e=f.links[i],silhouette=e.faces.length===1||e.faces.some(j=>normals[j][2]<0);if(!silhouette)continue;const p=q[i],r=q[(i+1)%q.length];ctx.moveTo(p[0],p[1]);ctx.lineTo(r[0],r[1]);}ctx.strokeStyle='rgba(186,226,239,.95)';ctx.lineWidth=1;ctx.stroke();}
  }
  ctx.beginPath();for(const e of m.edges){if(e.lvl>completion||(e.normal&&rot(e.normal)[2]<.05))continue;const mid=rot(mul(add(e.a,e.b),.5));if(mid[2]<-.12)continue;const a=P(e.a),b=P(e.b);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}ctx.lineWidth=.85;ctx.strokeStyle='rgba(191,232,245,.85)';ctx.stroke();ctx.restore();
 }
 const previous=window.RiderGeometry,provider=window.ArchiveModels.build;
 window.ArchiveModels.build=(category,subtype)=>category==='person'?(cached||(cached=build())):provider(category,subtype);
 window.RiderGeometry={...previous,build,render};
})();
