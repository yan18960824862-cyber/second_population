/* Shared engineering geometry for acquisition, inspection and component studies.
   Every part belongs to the same 3D mesh. Illustrative families, not identified makes. */
(function () {
  'use strict';
  const E=window.ModelEngine,TAU=Math.PI*2,ink=[60,83,94],dark=[12,22,27],cache=new Map();
  const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,t)=>a.map(v=>v*t);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>mul(a,1/(Math.hypot(...a)||1)),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
  function face(m,p,n,grid=0,c=ink){
    m.face(p,c,n,{lvl:.04});const f=m.faces.at(-1);f.grids=[];
    if(p.length===4&&grid){const nx=Array.isArray(grid)?grid[0]:grid,ny=Array.isArray(grid)?grid[1]:grid;
      for(let i=1;i<nx;i++)f.grids.push([mix(p[0],p[1],i/nx),mix(p[3],p[2],i/nx)]);
      for(let j=1;j<ny;j++)f.grids.push([mix(p[0],p[3],j/ny),mix(p[1],p[2],j/ny)]);
    }
    f.gridLevel=.12+hash(m.faces.length)*.3;return f;
  }
  function line(m,a,b,w=.7,n=null){m.stroke(a,b,w,.08);m.edges.at(-1).normal=n;}
  function path(m,pts,w=.8,n=null){for(let i=1;i<pts.length;i++)line(m,pts[i-1],pts[i],w,n);}
  function box(m,a,b,grid=3,c=ink){
    for(let axis=0;axis<3;axis++){const u=(axis+1)%3,v=(axis+2)%3;
      for(const sign of [-1,1]){const p=(s,t)=>{const q=[];q[axis]=sign>0?b[axis]:a[axis];q[u]=a[u]+(b[u]-a[u])*s;q[v]=a[v]+(b[v]-a[v])*t;return q;},n=[0,0,0];n[axis]=sign;
        face(m,sign>0?[p(0,0),p(1,0),p(1,1),p(0,1)]:[p(0,0),p(0,1),p(1,1),p(1,0)],n,grid,c);
      }
    }
  }
  function tube(m,a,b,r,segments=10,c=ink){const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u);
    const point=(p,t)=>add(p,add(mul(u,Math.cos(t)*r),mul(v,Math.sin(t)*r)));
    for(let i=0;i<segments;i++){const t=i/segments*TAU,t1=(i+1)/segments*TAU;face(m,[point(a,t),point(b,t),point(b,t1),point(a,t1)],add(mul(u,Math.cos((t+t1)/2)),mul(v,Math.sin((t+t1)/2))),[3,1],c);}
    for(const [p,s]of [[a,-1],[b,1]])face(m,Array.from({length:segments},(_,i)=>point(p,i/segments*TAU)),mul(axis,s),0,c);
  }
  function torus(m,x,y,z,R,r,N=40,K=7){for(let i=0;i<N;i++)for(let j=0;j<K;j++){
    const p=(s,t)=>[x+(R+r*Math.cos(t))*Math.cos(s),y+(R+r*Math.cos(t))*Math.sin(s),z+r*Math.sin(t)];
    const a=i/N*TAU,b=(i+1)/N*TAU,c=j/K*TAU,d=(j+1)/K*TAU;
    face(m,[p(a,c),p(b,c),p(b,d),p(a,d)],[Math.cos((a+b)/2)*Math.cos((c+d)/2),Math.sin((a+b)/2)*Math.cos((c+d)/2),Math.sin((c+d)/2)],0);
  }}
  function wheel(m,x,y,z,R=.48,thickness=.16){
    torus(m,x,y,z,R*.81,R*.19,40,7);
    for(const sign of [-1,1]){const zz=z+sign*R*.14,n=[0,0,sign];
      const point=(r,a)=>[x+r*Math.cos(a),y+r*Math.sin(a),zz];
      for(let i=0;i<36;i++){const a=i/36*TAU,b=(i+1)/36*TAU;face(m,[point(R*.68,a),point(R*.68,b),point(R*.25,b),point(R*.25,a)],n,0,dark);}
      for(const r of [.7,.67,.29])path(m,Array.from({length:49},(_,i)=>point(R*r,i/48*TAU)),.72,n);
      for(let i=0;i<10;i++){const a=i/10*TAU;path(m,[point(R*.3,a),point(R*.61,a+.13),point(R*.65,a+.2)],1,n);
        const c=point(R*.21,a);tube(m,[c[0],c[1],zz],[c[0],c[1],zz+sign*.018],R*.035,6);}
      tube(m,[x,y,z],[x,y,zz+sign*.025],R*.17,14);
      for(let i=0;i<40;i++){const a=i/40*TAU;line(m,[x+Math.cos(a)*R*.97,y+Math.sin(a)*R*.97,z-sign*.035],[x+Math.cos(a+.025)*R*.94,y+Math.sin(a+.025)*R*.94,z+sign*.05],.6);}
    }
  }
  function shell(m,sections,grid=4){
    for(let i=1;i<sections.length;i++)for(let j=0;j<sections[i].length;j++){
      const k=(j+1)%sections[i].length,p=[sections[i-1][j],sections[i][j],sections[i][k],sections[i-1][k]],n=unit(cross(sub(p[1],p[0]),sub(p[3],p[0])));
      const center=mul(p.reduce(add,[0,0,0]),.25);if(n[1]*center[1]+n[2]*center[2]<0)n.forEach((v,k)=>n[k]=-v);
      face(m,p,n,grid);
    }
    face(m,sections[0],[-1,0,0]);face(m,sections.at(-1),[1,0,0]);
  }
  function ribbedPanel(m,x0,x1,y0,y1,z,spacing=.2){const n=[0,0,Math.sign(z)];
    for(let x=x0;x<x1;x+=spacing)line(m,[x,y0,z],[x,y1,z],.7,n);
    for(const y of [y0,y1])line(m,[x0,y,z],[x1,y,z],1,n);
  }
  function truck(){const m=new E.Mesh();
    box(m,[-2.95,-.52,-.82],[2.98,-.28,.82],[14,2]);
    for(const z of [-.75,.75])box(m,[-2.8,-.64,z-.055],[2.8,-.44,z+.055],[12,1]);
    box(m,[-2.95,-.12,-1.08],[.67,2.22,1.08],[14,7]);
    box(m,[-3.01,2.18,-1.12],[.73,2.28,1.12],[16,2]);
    for(const s of [-1,1]){const z=s*1.091,n=[0,0,s];
      ribbedPanel(m,-2.87,.59,.02,2.15,z,.14);
      for(const y of [.03,1.15,2.1])box(m,[-2.95,y,z-.025],[.68,y+.035,z+.025],[15,1]);
      for(const x of [-2.89,-1.13,.61]){box(m,[x,-.1,z-.027],[x+.035,2.22,z+.027],[1,12]);
        for(let j=0;j<8;j++)line(m,[x-.025,.12+j*.27,z+s*.035],[x+.065,.12+j*.27,z+s*.035],.9,n);}
      box(m,[-.55,-.72,s*.87-.12],[.27,-.27,s*.87+.12],[5,4]);
      for(let j=0;j<4;j++)line(m,[-1.28,-.7+j*.09,s*.95],[.5,-.7+j*.09,s*.95],.9,n);
      for(const x of [-2.38,-1.5,2.12])wheel(m,x,-.61,s*1.015,.49);
    }
    // Extruded cab silhouette, raked windscreen and doors.
    const profile=[[.84,-.22],[3.02,-.22],[3.02,.93],[2.62,1.68],[1.05,1.68],[.84,1.37]];
    for(const s of [-1,1])face(m,profile.map(([x,y])=>[x,y,s*1.025]),[0,0,s]);
    for(let i=0;i<profile.length;i++){const a=profile[i],b=profile[(i+1)%profile.length];face(m,[[a[0],a[1],-1.025],[b[0],b[1],-1.025],[b[0],b[1],1.025],[a[0],a[1],1.025]],unit([b[1]-a[1],a[0]-b[0],0]),[4,6]);}
    face(m,[[2.665,1.59,-.91],[2.665,1.59,.91],[2.975,1.015,.91],[2.975,1.015,-.91]],unit([.575,.31,0]),[10,4],dark);
    for(const s of [-1,1]){const z=s*1.035,n=[0,0,s];
      face(m,[[1.035,-.1,z+.003*s],[2.72,-.1,z+.003*s],[2.72,.75,z+.003*s],[1.035,.75,z+.003*s]],n,[9,5]);
      face(m,[[1.11,.81,z],[2.74,.81,z],[2.54,1.52,z],[1.11,1.52,z]],n,[5,3],dark);
      path(m,[[1.01,-.13,z],[1.01,1.56,z],[2.54,1.56,z],[2.8,.76,z],[2.8,-.13,z],[1.01,-.13,z]],1,n);
      box(m,[1.28,.57,z-.012],[1.58,.62,z+.012],[3,1]);
      for(const y of [-.18,-.05])box(m,[1.27,y,s*1.09-.12],[2.11,y+.045,s*1.09+.12],[5,2]);
      tube(m,[2.62,1.19,z],[2.47,1.24,s*1.36],.026,8);
      box(m,[2.31,.79,s*1.37-.07],[2.54,1.36,s*1.37+.07],[2,5]);
      const arch=Array.from({length:31},(_,i)=>{const a=i/30*Math.PI;return[2.12+Math.cos(a)*.58,-.61+Math.sin(a)*.58,s*1.08];});path(m,arch,1,n);
      box(m,[3.025,.02,s*.76-.21],[3.09,.25,s*.76+.21],[4,2]);
      for(let j=0;j<3;j++)line(m,[3.095,.07+j*.05,s*.76-.18],[3.095,.07+j*.05,s*.76+.18],.8,[1,0,0]);
    }
    box(m,[3.015,.36,-.77],[3.065,.88,.77],[1,8],dark);
    for(let j=0;j<9;j++)line(m,[3.073,.38+j*.055,-.75],[3.073,.38+j*.055,.75],1,[1,0,0]);
    box(m,[3.01,-.26,-1.09],[3.16,-.11,1.09],[3,12]);box(m,[3.164,-.22,-.23],[3.17,-.12,.23],[4,1]);
    for(const z of [-.58,.58])path(m,[[2.99,1.04,z-.16],[2.85,1.3,z],[2.8,1.34,z+.23]],1,[1,.4,0]);
    // Rear double doors, locking bars and exposed chassis.
    for(const z of [-.51,.51]){box(m,[-3.035,.01,z-.48],[-2.99,2.1,z+.48],[5,9]);tube(m,[-3.065,.13,z],[-3.065,1.97,z],.022,8);
      for(const y of [.3,1.1,1.88])box(m,[-3.08,y,z-.13],[-3.04,y+.055,z+.13],[1,3]);}
    for(const x of [-2.38,-1.5,2.12])tube(m,[x,-.62,-.98],[x,-.62,.98],.07,10);
    return finish(m,'truck');
  }
  function vehicle(st,previous){const m=new E.Mesh(),isSuv=st==='suv',width=isSuv?1.01:.95;
    const xs=[-2.28,-2.14,-1.68,-.9,.22,1.25,1.93,2.2,2.28],widths=[.68,.91,1,1,1,.98,.9,.75,.66],tops=isSuv?[.12,.28,.38,.4,.39,.36,.26,.13,.06]:[.02,.16,.26,.29,.28,.24,.17,.06,0];
    const body=xs.map((x,i)=>{const z=width*widths[i],y=tops[i];return[[x,y,0],[x,y-.012,z*.62],[x,y-.065,z*.9],[x,y-.2,z],[x,-.34,z*.98],[x,-.46,z*.81],[x,-.5,0],[x,-.46,-z*.81],[x,-.34,-z*.98],[x,y-.2,-z],[x,y-.065,-z*.9],[x,y-.012,-z*.62]];});shell(m,body,[3,3]);
    const roof=isSuv?[[-1.72,.45,.88],[-1.43,1.13,.79],[-1.12,1.25,.76],[.24,1.23,.76],[.53,1.08,.8],[.96,.42,.9]]:[[-1.48,.29,.84],[-1.15,.69,.73],[-.88,.98,.67],[.19,.98,.67],[.48,.81,.74],[1.02,.27,.84]];
    shell(m,roof.map(([x,y,z])=>[[x,.25,-width*.93],[x,y-.09,-z],[x,y,-z*.68],[x,y,z*.68],[x,y-.09,z],[x,.25,width*.93]]),[3,4]);
    for(const s of [-1,1]){const n=[0,0,s];for(let k=1;k<roof.length-1;k++){const a=roof[k-1],b=roof[k];if(k===1||k===roof.length-1)continue;
      face(m,[[a[0]+.03,.36,s*width*.94],[b[0]-.025,.36,s*width*.94],[b[0]-.025,b[1]-.13,s*(b[2]+.008)],[a[0]+.03,a[1]-.13,s*(a[2]+.008)]],n,[3,3],dark);}
      tube(m,[.63,.46,s*.86],[.73,.49,s*1.05],.023,8);box(m,[.67,.45,s*1.06-.048],[.92,.56,s*1.06+.048],[4,2]);
    }
    const rear=roof[1],rearTop=roof[2],frontTop=roof.at(-3),front=roof.at(-1);
    face(m,[[frontTop[0],frontTop[1]-.015,-frontTop[2]*.91],[frontTop[0],frontTop[1]-.015,frontTop[2]*.91],[front[0]-.03,front[1]+.02,front[2]*.97],[front[0]-.03,front[1]+.02,-front[2]*.97]],unit([.7,.5,0]),[8,5],dark);
    face(m,[[rear[0],rear[1]-.015,-rear[2]],[rear[0],rear[1]-.015,rear[2]],[rearTop[0],rearTop[1]-.01,rearTop[2]],[rearTop[0],rearTop[1]-.01,-rearTop[2]]],unit([-.6,.4,0]),[7,4],dark);
    for(const s of [-1,1]){box(m,[2.21,-.035,s*.65-.2],[2.29,.085,s*.65+.2],[1,6]);box(m,[-2.3,-.03,s*.65-.18],[-2.26,.11,s*.65+.18],[1,5]);
      path(m,[[.97,.31,s*.62],[.82,.51,s*.31],[.67,.53,s*.54]],.85,[1,1,0]);}
    if(isSuv)for(const z of [-.59,.59])tube(m,[-1.33,1.29,z],[.3,1.27,z],.023,8);
    for(const f of m.faces){f.grids=[];f.gridLevel=.2;if(f.p.length===4){const p=f.p;for(let i=1;i<5;i++)f.grids.push([mix(p[0],p[1],i/5),mix(p[3],p[2],i/5)]);for(let j=1;j<4;j++)f.grids.push([mix(p[0],p[3],j/4),mix(p[1],p[2],j/4)]);}}
    const suv=st==='suv',W=suv?2.02:1.9,R=suv?.45:.41;
    for(const x of [-1.43,1.43])for(const s of [-1,1]){wheel(m,x,-.4,s*(W/2+.04),R);const n=[0,0,s],z=s*(W/2+.075);
      path(m,Array.from({length:29},(_,i)=>{const a=i/28*Math.PI;return[x+Math.cos(a)*(R+.055),-.4+Math.sin(a)*(R+.055),z];}),1,n);}
    for(const s of [-1,1]){const z=s*(W/2+.018),n=[0,0,s];
      path(m,[[-1.91,-.24,z],[-.95,-.25,z],[.74,-.25,z],[1.98,-.21,z]],1,n);
      for(const x of [-.72,.5]){path(m,[[x,-.37,z],[x,.2,z],[x-.02,.28,z*.94]],.9,n);box(m,[x-.12,.1,z-.012],[x+.11,.14,z+.012],[3,1]);}
      for(let j=0;j<6;j++)line(m,[1.54,.02+j*.026,s*.73],[2.22,.015+j*.026,s*.73],.65,[0,1,0]);
    }
    box(m,[2.24,-.36,-.54],[2.29,-.16,.54],[1,9],dark);box(m,[-2.31,-.37,-.48],[-2.27,-.2,.48],[1,8]);
    for(let j=0;j<6;j++)line(m,[2.295,-.34+j*.029,-.52],[2.295,-.34+j*.029,.52],.85,[1,0,0]);
    for(const s of [-1,1])path(m,[[.81,.31,s*.57],[1.37,.255,s*.49],[2.13,.19,s*.39]],.95,[0,1,0]);
    return finish(m,st);
  }
  function bus(coach){const m=new E.Mesh(),L=coach?4.45:4.15,Z=1.15,roof=coach?2.13:1.98;
    const sections=[-L,-L+.18,-L+.5,L-.45,L-.12,L].map((x,i)=>{const width=i===0||i===5?Z*.88:Z;return [[x,-.49,-width*.9],[x,-.49,width*.9],[x,.4,width],[x,roof-.19,width],[x,roof,width*.83],[x,roof,-width*.83],[x,roof-.19,-width],[x,.4,-width]];});shell(m,sections,[5,4]);
    for(const s of [-1,1]){const n=[0,0,s],z=s*(Z+.009);
      for(let j=0;j<8;j++){const a=-L+.4+j*(2*L-.85)/8,b=a+(2*L-.85)/8-.065;
        face(m,[[a,.82,z],[b,.82,z],[b,roof-.25,z],[a,roof-.25,z]],n,[3,3],dark);
        line(m,[a,.98,z+s*.004],[b,1.05,z+s*.004],.6,n);
        // Seat/handrail outlines visible within the illustrative window band.
        for(const xx of [a+.12,b-.13])path(m,[[xx,1.03,z+s*.008],[xx,1.45,z+s*.008],[xx+.09,1.49,z+s*.008]],.65,n);
      }
      for(const x of [L-1.33,-L+1.37])wheel(m,x,-.52,s*1.13,.49);
      if(coach)wheel(m,-L+2.34,-.52,s*1.13,.49);
      const doorXs=coach?[L-1.05]:[L-1.05,-.45];
      if(s===1)for(const x of doorXs){face(m,[[x,-.35,z+s*.017],[x+.76,-.35,z+s*.017],[x+.76,roof-.28,z+s*.017],[x,roof-.28,z+s*.017]],n,[3,7],dark);line(m,[x+.38,-.35,z+s*.025],[x+.38,roof-.28,z+s*.025],1,n);}
      for(let j=0;j<12;j++)line(m,[-L+.22+j*.085,-.28,z+s*.019],[-L+.22+j*.085,.49,z+s*.019],.8,n);
      for(const y of [-.29,.64])line(m,[-L+.17,y,z+s*.02],[L-.18,y,z+s*.02],1,n);
      for(let j=0;j<5;j++)box(m,[-L+.6+j*1.25,-.39,z-.008],[-L+1.75+j*1.25,.56,z+.008],[4,3]);
      for(const x of [-L+.35,L-.38])box(m,[x,.68,z-.012],[x+.13,.73,z+.012],[2,1]);
      tube(m,[L-.15,1.66,z],[L+.12,1.68,s*1.43],.025);box(m,[L-.13,1.13,s*1.43-.07],[L+.08,1.7,s*1.43+.07],[2,5]);
    }
    face(m,[[L+.012,.54,-.99],[L+.012,.54,.99],[L-.015,roof-.26,.99],[L-.015,roof-.26,-.99]],[1,0,0],[8,5],dark);
    box(m,[L+.018,roof-.25,-.95],[L+.04,roof-.06,.95],[1,12]);
    for(const s of [-1,1]){box(m,[L+.022,-.13,s*.78-.16],[L+.07,.2,s*.78+.16],[1,5]);path(m,[[L+.031,.62,s*.7],[L+.035,1.08,s*.27],[L+.035,1.15,s*.46]],1,[1,0,0]);}
    for(let j=0;j<8;j++)line(m,[L+.03,.06+j*.035,-.47],[L+.03,.06+j*.035,.47],.8,[1,0,0]);
    box(m,[-2.4,roof,-.77],[-.5,roof+.19,.77],[10,7]);box(m,[.32,roof,-.69],[2.12,roof+.17,.69],[10,7]);
    for(const x of [-2.08,-1.54,-.99,.64,1.18,1.72])for(let j=0;j<6;j++)line(m,[x,roof+.2,-.59+j*.22],[x+.25,roof+.2,-.59+j*.22],.65,[0,1,0]);
    return finish(m,coach?'coach':'bus');
  }
  function streetlight(){const m=new E.Mesh();box(m,[-.34,-2.45,-.32],[.34,-2.28,.32],[4,4]);box(m,[-.23,-2.28,-.23],[.23,-1.89,.23],[3,4]);tube(m,[0,-2.28,0],[0,2.05,0],.092,16);
    const arm=Array.from({length:17},(_,i)=>{const t=i/16;return[1.55*t,1.91+.53*Math.sin(t*Math.PI*.65),0];});for(let i=1;i<arm.length;i++)tube(m,arm[i-1],arm[i],.065,10);
    box(m,[1.33,2.22,-.25],[2.17,2.34,.25],[10,5]);box(m,[1.41,2.19,-.21],[2.11,2.22,.21],[8,4]);
    for(let i=0;i<7;i++)for(let j=0;j<4;j++)box(m,[1.43+i*.092,2.17,-.177+j*.095],[1.478+i*.092,2.185,-.133+j*.095],1);
    for(let i=0;i<12;i++)line(m,[1.39+i*.061,2.355,-.21],[1.39+i*.061,2.355,.21],.8,[0,1,0]);
    box(m,[-.101,-1.8,.077],[.101,-1.16,.11],[2,6]);
    for(const x of [-.25,.25])for(const z of [-.24,.24])tube(m,[x,-2.31,z],[x,-2.23,z],.032,6);
    for(const y of [-1.85,.7,1.85]){tube(m,[0,y-.025,0],[0,y+.025,0],.112,16);}
    return finish(m,'streetlight');
  }
  function finish(m,kind){
    m.technicalWire=true;m.archiveKind=kind;m.detailKind='vehicle';
    // Subdivide long panels for local depth ordering. This also keeps glazing,
    // latches and doors visible instead of hiding behind one giant side face.
    const refined=[];
    for(const f of m.faces){const p=f.p;if(p.length!==4){refined.push(f);continue;}
      const u=Math.hypot(...sub(p[1],p[0])),v=Math.hypot(...sub(p[3],p[0]));
      if(Math.max(u,v)<1.2){refined.push(f);continue;}
      const nu=Math.min(26,Math.max(1,Math.ceil(u/.36))),nv=Math.min(20,Math.max(1,Math.ceil(v/.36))),point=(a,b)=>mix(mix(p[0],p[1],a),mix(p[3],p[2],a),b);
      for(let i=0;i<nu;i++)for(let j=0;j<nv;j++)refined.push({...f,p:[point(i/nu,j/nv),point((i+1)/nu,j/nv),point((i+1)/nu,(j+1)/nv),point(i/nu,(j+1)/nv)],grids:[],patch:true,boundary:[j===0,i===nu-1,j===nv-1,i===0]});
    }
    m.faces=refined;
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const f of m.faces)for(const p of f.p)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],p[i]);hi[i]=Math.max(hi[i],p[i]);}
    m.center=lo.map((v,i)=>(v+hi[i])/2);m.size={w:hi[0]-lo[0],h:hi[1]-lo[1],d:hi[2]-lo[2]};m.ground=lo[1];return m;
  }
  function render(ctx,m,o={}){
    const w=o.w,h=o.h,yaw=o.yaw??-.62,pitch=o.pitch??.16,dist=Math.max(8.6,m.size.w*1.8),scale=Math.min(w*.84/Math.max(m.size.w,m.size.d),h*.8/m.size.h),rot=p=>Cam.rotate(p,yaw,pitch);
    const points=new Map(),P=p=>{if(points.has(p))return points.get(p);const q=rot(sub(p,m.center)),f=dist/(dist-q[2]),a=[w*.5+q[0]*scale*f,h*.51-q[1]*scale*f,q[2]];points.set(p,a);return a;};
    const completion=o.completion??1,opacity=o.opacity??1;
    ctx.clearRect(0,0,w,h);if(opacity<=0||completion<=0)return;
    const faces=m.faces.map((f,i)=>{const q=f.p.map(P),n=rot(f.n||[0,0,1]);return {f,i,q,n,z:q.reduce((s,p)=>s+p[2],0)/q.length};}).filter(a=>a.n[2]>-.035).sort((a,b)=>a.z-b.z);
    const items=[...faces];
    for(const e of m.edges){if(e.lvl>completion||(e.normal&&rot(e.normal)[2]<0))continue;const q=[P(e.a),P(e.b)];items.push({e,q,z:(q[0][2]+q[1][2])/2+.0001});}
    items.sort((a,b)=>a.z-b.z);
    ctx.save();ctx.globalAlpha=opacity;ctx.lineJoin='round';
    for(const {f,e,q} of items){
      // Detail strokes share the face depth order, so far wheels and hidden
      // chassis members cannot bleed through the cab or cargo body.
      if(e){path2d(q);ctx.strokeStyle='rgba(168,211,224,.7)';ctx.lineWidth=.72;ctx.stroke();continue;}
      ctx.beginPath();q.forEach((p,j)=>j?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle='#000';ctx.fill();
      ctx.strokeStyle=f.patch?'rgba(168,211,224,.32)':'rgba(168,211,224,.68)';ctx.lineWidth=f.patch?.45:.7;ctx.stroke();
      if(f.patch){ctx.beginPath();for(let j=0;j<4;j++)if(f.boundary[j]){ctx.moveTo(q[j][0],q[j][1]);ctx.lineTo(q[(j+1)%4][0],q[(j+1)%4][1]);}ctx.strokeStyle='rgba(168,211,224,.72)';ctx.lineWidth=.7;ctx.stroke();}
      if(completion>f.gridLevel){ctx.strokeStyle='rgba(168,211,224,'+(f.c===dark?.22:.32)+')';ctx.lineWidth=.48;ctx.beginPath();for(const [a,b]of f.grids||[]){const p=P(a),r=P(b);ctx.moveTo(p[0],p[1]);ctx.lineTo(r[0],r[1]);}ctx.stroke();}
    }
    // Localized missing edge fragments; never dim or flash the entire object.
    if(o.glitch!==false&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){const phase=Math.floor((o.time||0)/140);if(phase%31<2){
      for(let i=0;i<4;i++){const a=faces[Math.floor(hash(phase+i*9)*faces.length)];if(!a)continue;const p=a.q[0];ctx.fillStyle='#000';ctx.fillRect(p[0],p[1],7+hash(i)*16,2);ctx.strokeStyle='rgba(168,211,224,.48)';ctx.beginPath();ctx.moveTo(p[0]+9,p[1]-2);ctx.lineTo(p[0]+24,p[1]-2);ctx.stroke();}
    }}ctx.restore();
    function path2d(q){ctx.beginPath();ctx.moveTo(q[0][0],q[0][1]);ctx.lineTo(q[1][0],q[1][1]);}
  }
  const previous=window.ArchiveModels.build,previews=new Map();
  // The monitoring crowd and tiny archive cards retain lightweight meshes.
  // Detailed models are reserved for the opened archive and 3D inspection.
  for(const st of ['truck','bus','coach','sedan','suv','streetlight']){
    const category=st==='streetlight'?'infrastructure':'vehicle',m=E.buildModel(category,st),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const f of m.faces)for(const p of f.p)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
    m.center=lo.map((v,k)=>(v+hi[k])/2);previews.set(category+'/'+st,m);
  }
  window.ArchiveModels.build=(category,subtype)=>{
    if(category!=='vehicle'&&category!=='infrastructure')return previous(category,subtype);
    const key=category+'/'+subtype;if(cache.has(key))return cache.get(key);
    const m=subtype==='truck'?truck():subtype==='bus'||subtype==='coach'?bus(subtype==='coach'):category==='infrastructure'?streetlight():vehicle(subtype,previous);
    if(m)cache.set(key,m);return m;
  };
  const components=new Map();
  function component(kind='sedan'){
    const heavy=['truck','bus','coach'].includes(kind),key=heavy?'axle':'strut';if(components.has(key))return components.get(key);
    const m=new E.Mesh();wheel(m,0,-.32,0,.62);
    box(m,[.25,-.39,.08],[.43,-.1,.22],[3,4]);
    if(heavy){
      tube(m,[0,-.32,-.5],[0,-.32,.2],.095,14);
      for(let k=0;k<7;k++)path(m,Array.from({length:33},(_,j)=>{const x=-.66+j/32*1.32;return[x,.13+k*.022+x*x*.5,.13];}),.75);
      for(const x of [-.5,.5])box(m,[x-.04,.24,.06],[x+.04,.4,.23],[2,3]);
      box(m,[-.71,.64,-.12],[.71,.73,.26],[8,3]);
      for(const x of [-.38,.38])tube(m,[x,.36,.09],[x,.64,.09],.13,16);
      for(const x of [-.38,.38])for(let j=0;j<5;j++)tube(m,[x,.38+j*.044,.09],[x,.397+j*.044,.09],.14,16);
      tube(m,[-.52,.3,.25],[-.29,.72,.25],.035,10);
    }else{
      tube(m,[.02,-.25,.15],[-.23,.98,.15],.06,14);
      box(m,[-.39,.95,.05],[-.08,1.04,.25],[3,2]);
      const coil=[];for(let j=0;j<=180;j++){const t=j/180,c=mix([-.04,.12,.15],[-.2,.85,.15],t);coil.push([c[0]+Math.cos(t*TAU*9)*.13,c[1],c[2]+Math.sin(t*TAU*9)*.13]);}path(m,coil,.8);
      for(const z of [-.18,.26]){tube(m,[.02,-.32,.14],[-.49,-.57,z],.035,10);tube(m,[-.49,-.57,z],[-.58,-.2,z],.035,10);}
    }
    const result=finish(m,'wheel-study');components.set(key,result);return result;
  }
  function previewModel(category,subtype){return previews.get(category+'/'+subtype)||null;}
  function thumbnail(ctx,category,subtype,o){const m=previewModel(category,subtype);if(!m)return false;render(ctx,m,{...o,completion:1,opacity:1,glitch:false});return true;}
  window.ArchiveEngineering={render,component,previewModel,thumbnail};
})();
