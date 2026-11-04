/* Archive geometry where mapped; evidence-labelled class studies elsewhere.
   This viewer never changes the authoritative archive/modelStatus fields. */
export function universeModels(THREE){
 const cache=new Map(),P=window.ModelEngine.primitives;
 const body=new THREE.MeshStandardMaterial({color:'#72878c',roughness:.62,metalness:.22}),dark=new THREE.MeshStandardMaterial({color:'#111b20',roughness:.5}),metal=new THREE.MeshStandardMaterial({color:'#9badb0',metalness:.65,roughness:.4});
 const ink=new THREE.MeshStandardMaterial({color:'#3a535d',roughness:.65}),glass=new THREE.MeshStandardMaterial({color:'#0d2129',metalness:.4,roughness:.25}),marking=new THREE.MeshStandardMaterial({color:'#b2c1bc',roughness:.8});
 function spec(r){
  const s=r.labelEn.toUpperCase();
  if(r.category==='vehicle'){
   if(/MPV/.test(s))return {kind:'mpv',study:true};
   if(/VAN/.test(s)&&!/BOX TRUCK/.test(s))return {kind:'van',study:true};
   const kind=window.ArchiveCatalog.subtype(r.annotation);
   if(['sedan','suv','truck','bus','coach'].includes(kind))return {kind,archiveCategory:'vehicle',study:false};
  }
  if(/LUMINAIRE|STREETLIGHT/.test(s))return {kind:'streetlight',archiveCategory:'infrastructure',study:false};
  const kinds={'METRO SIGN':'metro-sign','GANTRY SIGN':'gantry','CAMERA POLE':'camera-pole','BARRIER':'barrier','GUARDRAIL':'guardrail','KERB':'kerb','ARROW':'arrow','MANHOLE':'manhole','FENCE':'fence','SIGN':'sign','LANE MARK':'lane-mark','BANNER':'banner','BIKE RACK':'bike-rack'};
  return {kind:kinds[s]||'evidence',study:true};
 }
 function box(g,w,h,d,x=0,y=0,z=0,mat=body){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);return m;}
 function cylinder(g,r,h,x,y,z,mat=metal,segments=20){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat);m.position.set(x,y,z);g.add(m);return m;}
 function rod(g,a,b,r=.035,mat=metal){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,A.distanceTo(B),12),mat);m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.sub(A).normalize());g.add(m);return m;}
 function procedural(kind){
  const g=new THREE.Group();
  if(kind==='van'||kind==='mpv'){
   box(g,3.9,.8,1.65,0,-.15);box(g,kind==='van'?3.25:2.9,.94,1.59,-.22,.7);box(g,.7,.14,1.51,1.65,.35);
   for(const z of [-.806,.806]){box(g,2.7,.60,.018,-.18,.77,z,glass);for(const x of [-1.05,-.15,.65])box(g,.07,.64,.022,x,.77,z,body);}
   box(g,.018,.62,1.35,kind==='van'?1.41:1.23,.75,0,glass);box(g,.05,.13,1.66,1.96,-.28,0,metal);
   for(const x of [-1.29,1.29])for(const z of [-.86,.86]){const wheel=cylinder(g,.38,.24,x,-.49,z,dark,28);wheel.rotation.x=Math.PI/2;const hub=cylinder(g,.21,.245,x,-.49,z,metal,20);hub.rotation.x=Math.PI/2;}
  }else if(['metro-sign','sign','banner','gantry'].includes(kind)){
   if(kind==='gantry'){for(const x of [-1.6,1.6])cylinder(g,.065,3.3,x,0,0);rod(g,[-1.6,1.55,0],[1.6,1.55,0],.075);box(g,2.8,1.0,.14,0,.95,0,ink);}
   else{cylinder(g,.065,2.8,0,0,0);box(g,kind==='banner'?.65:1.45,kind==='banner'?1.7:1,.12,kind==='banner'?.3:0,.65,0,ink);}
   if(kind==='metro-sign'){box(g,.7,.14,.03,0,.7,.07,marking);box(g,.14,.5,.03,-.3,.8,.08,marking);box(g,.14,.5,.03,.3,.8,.08,marking);}
   else for(const y of [.65,.85,1.05])box(g,kind==='gantry'?1.7:.48,.025,.02,0,y,.083,metal);
  }else if(kind==='camera-pole'){
   cylinder(g,.075,3.3,0,0,0);rod(g,[0,1.5,0],[.75,1.5,0],.05);box(g,.6,.35,.45,.72,1.48,0);const lens=cylinder(g,.12,.05,.72,1.48,.25,dark);lens.rotation.x=Math.PI/2;
  }else if(kind==='barrier'){
   cylinder(g,.48,1.12,0,0,0,body,28);cylinder(g,.5,.12,0,.57,0,metal);for(let i=0;i<8;i++){const angle=i/8*Math.PI*2;const stripe=box(g,.14,.9,.016,Math.cos(angle)*.484,0,Math.sin(angle)*.484,dark);stripe.rotation.y=Math.PI/2-angle;}
  }else if(kind==='guardrail'||kind==='fence'||kind==='bike-rack'){
   if(kind==='bike-rack'){for(let i=0;i<5;i++){const x=-1.4+i*.7;rod(g,[x,-.5,-.4],[x,.5,-.4]);rod(g,[x,.5,-.4],[x,.5,.4]);rod(g,[x,.5,.4],[x,-.5,.4]);}rod(g,[-1.65,-.48,-.4],[1.65,-.48,-.4]);rod(g,[-1.65,-.48,.4],[1.65,-.48,.4]);}
   else{for(const x of [-1.6,0,1.6]){box(g,.1,1.45,.12,x,0,0,metal);box(g,.3,.12,.35,x,-.76,0,dark);}for(const y of [-.23,.48])box(g,3.5,kind==='fence'?.055:.19,.09,0,y,0,body);if(kind==='fence')for(let i=0;i<14;i++)box(g,.035,.71,.04,-1.5+i*.23,.13,0,metal);}
  }else if(kind==='kerb'){
   for(let i=0;i<4;i++){box(g,.84,.35,.48,-1.35+i*.9,0,0,i%2?body:marking);}
  }else if(kind==='manhole'){
   cylinder(g,.9,.085,0,0,0,dark,48);const torus=new THREE.Mesh(new THREE.TorusGeometry(.82,.035,8,48),metal);torus.rotation.x=Math.PI/2;torus.position.y=.05;g.add(torus);for(let i=-3;i<=3;i++)box(g,1.25,.025,.025,0,.059,i*.18,metal);
  }else if(kind==='lane-mark'||kind==='arrow'){
   box(g,3.3,.045,1.7,0,-.06,0,dark);
   if(kind==='lane-mark')for(let i=0;i<3;i++)box(g,.66,.012,.12,-1.15+i*1.15,-.028,0,marking);
   else{box(g,1.55,.012,.17,-.28,-.028,0,marking);for(const sign of [-1,1]){const line=box(g,.9,.012,.17,.61,-.028,sign*.24,marking);line.rotation.y=sign*Math.PI/4;}}
  }
  return g;
 }
 function fromArchive(s){
  const mesh=window.ModelEngine.buildModel(s.archiveCategory,s.kind),positions=[],normals=[],colors=[];
  for(const face of mesh.faces){for(let i=1;i<face.p.length-1;i++)for(const p of [face.p[0],face.p[i],face.p[i+1]]){
   positions.push(...p);normals.push(...(face.n||[0,1,0]));const c=face.c||[55,75,85];colors.push(...c.map(v=>Math.min(.82,.055+v/255*1.5)));
  }}
  const lines=[];for(const e of mesh.edges)lines.push(...e.a,...e.b);
  return normalize(positions,normals,colors,lines,s);
 }
 function normalize(positions,normals,colors,lines,s){
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeBoundingBox();
  const center=new THREE.Vector3(),size=new THREE.Vector3();geo.boundingBox.getCenter(center);geo.boundingBox.getSize(size);const scale=2.4/Math.max(size.x,size.y,size.z);
  geo.translate(-center.x,-center.y,-center.z);geo.scale(scale,scale,scale);geo.computeBoundingSphere();
  const edgeGeo=new THREE.BufferGeometry(),edges=[];for(let i=0;i<lines.length;i+=3)edges.push((lines[i]-center.x)*scale,(lines[i+1]-center.y)*scale,(lines[i+2]-center.z)*scale);edgeGeo.setAttribute('position',new THREE.Float32BufferAttribute(edges,3));
  return {...s,geometry:geo,edges:edgeGeo,triangles:positions.length/9};
 }
 function fromStudy(s){
  const group=procedural(s.kind),positions=[],normals=[],colors=[],lines=[],v=new THREE.Vector3(),n=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
  group.updateMatrixWorld(true);
  group.traverse(m=>{if(!m.isMesh)return;const geo=m.geometry,index=geo.index,p=geo.attributes.position,normal=geo.attributes.normal,color=m.material.color;normalMatrix.getNormalMatrix(m.matrixWorld);
   const count=index?index.count:p.count;
   for(let i=0;i<count;i++){const k=index?index.getX(i):i;v.fromBufferAttribute(p,k).applyMatrix4(m.matrixWorld);n.fromBufferAttribute(normal,k).applyMatrix3(normalMatrix).normalize();positions.push(v.x,v.y,v.z);normals.push(n.x,n.y,n.z);colors.push(color.r,color.g,color.b);}
   const edge=new THREE.EdgesGeometry(geo,24),attribute=edge.attributes.position;for(let i=0;i<attribute.count;i++){v.fromBufferAttribute(attribute,i).applyMatrix4(m.matrixWorld);lines.push(v.x,v.y,v.z);}edge.dispose();geo.dispose();
  });
  if(!positions.length)return {...s,geometry:null,edges:null};
  return normalize(positions,normals,colors,lines,s);
 }
 function get(record){const s=spec(record),key=(s.archiveCategory||'study')+'/'+s.kind;if(!cache.has(key))cache.set(key,s.archiveCategory?fromArchive(s):fromStudy(s));return cache.get(key);}
 return {get,spec,dispose(){for(const s of cache.values()){s.geometry?.dispose();s.edges?.dispose();}for(const m of [body,dark,metal,ink,glass,marking])m.dispose();cache.clear();},get size(){return cache.size;}};
}
