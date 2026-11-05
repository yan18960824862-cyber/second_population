/* Road-observation camera: a folded aluminium weather housing and recessed optics.
   Forward is +Z. Dimensions preserve the existing opening's rig and fall path.
   This is an authored camera prop, separate from census-object geometry. */
export function buildCamera(THREE){
 const model=new THREE.Group();
 model.name='road-observation-camera';
 const geometry=new Map();
 const cache=(key,make)=>{if(!geometry.has(key))geometry.set(key,make());return geometry.get(key);};
 const paintGrain=(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d'),data=ctx.createImageData(128,128);let seed=94161;
  for(let i=0;i<data.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=205+(seed>>>27);data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255;}
  ctx.putImageData(data,0,0);const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,3);return texture;
 })();
 // A small, deterministic reflection environment belongs to this prop's materials
 // only. It never changes the tunnel's lights or scene environment.
 const reflectionEnvironment=(()=>{
  const faces=Array.from({length:6},(_,i)=>{
   const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');
   const ambient=x.createLinearGradient(0,0,0,96);ambient.addColorStop(0,i===2?'#39464f':'#202b32');ambient.addColorStop(1,'#070d11');x.fillStyle=ambient;x.fillRect(0,0,96,96);
   if([0,2,4].includes(i)){
    const softbox=x.createLinearGradient(5,0,44,0);softbox.addColorStop(0,'rgba(183,200,210,0)');softbox.addColorStop(.24,'rgba(183,200,210,.44)');softbox.addColorStop(.60,'rgba(183,200,210,.57)');softbox.addColorStop(1,'rgba(183,200,210,0)');
    x.fillStyle=softbox;x.fillRect(5,i===2?16:8,39,i===2?53:63);
   }
   return c;
  });
  const t=new THREE.CubeTexture(faces);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
 })();
 const paint=new THREE.MeshStandardMaterial({color:'#9ba5a8',roughness:.53,metalness:.30,envMap:reflectionEnvironment,envMapIntensity:.25,roughnessMap:paintGrain,bumpMap:paintGrain,bumpScale:.00065});
 const hoodPaint=new THREE.MeshStandardMaterial({color:'#b5bec0',roughness:.44,metalness:.36,envMap:reflectionEnvironment,envMapIntensity:.31,roughnessMap:paintGrain,bumpMap:paintGrain,bumpScale:.00045});
 const castPaint=new THREE.MeshStandardMaterial({color:'#758187',roughness:.65,metalness:.30,envMap:reflectionEnvironment,envMapIntensity:.18,roughnessMap:paintGrain});
 const fold=new THREE.MeshStandardMaterial({color:'#59686e',roughness:.51,metalness:.57,envMap:reflectionEnvironment,envMapIntensity:.29});
 const rubber=new THREE.MeshStandardMaterial({color:'#171d1d',roughness:.87,metalness:.01});
 const opticalBlack=new THREE.MeshStandardMaterial({color:'#11181a',roughness:.54,metalness:.24});
 const lensBarrel=new THREE.MeshStandardMaterial({color:'#26343a',roughness:.29,metalness:.53,envMap:reflectionEnvironment,envMapIntensity:.24});
 const steel=new THREE.MeshStandardMaterial({color:'#879598',roughness:.30,metalness:.80,envMap:reflectionEnvironment,envMapIntensity:.42});
 const aperture=new THREE.MeshStandardMaterial({color:'#03090b',roughness:.42,metalness:.06});
 const innerGlass=new THREE.MeshPhysicalMaterial({color:'#263b46',roughness:.065,metalness:.04,envMap:reflectionEnvironment,envMapIntensity:.47,ior:1.52,clearcoat:1,clearcoatRoughness:.06,transparent:true,opacity:.72,depthWrite:false});
 const glassReflection=(()=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  const base=ctx.createLinearGradient(0,0,128,128);base.addColorStop(0,'#28343b');base.addColorStop(.44,'#111b22');base.addColorStop(1,'#091115');ctx.fillStyle=base;ctx.fillRect(0,0,128,128);
  const reflection=ctx.createLinearGradient(0,0,100,110);reflection.addColorStop(0,'rgba(156,175,182,.17)');reflection.addColorStop(.35,'rgba(156,175,182,.07)');reflection.addColorStop(.49,'rgba(156,175,182,0)');reflection.addColorStop(1,'rgba(156,175,182,0)');
  ctx.fillStyle=reflection;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(115,0);ctx.lineTo(57,128);ctx.lineTo(0,128);ctx.fill();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
 })();
 const windowGlass=new THREE.MeshPhysicalMaterial({color:'#8d9ea4',map:glassReflection,roughness:.15,metalness:.07,envMap:reflectionEnvironment,envMapIntensity:.36,ior:1.50,clearcoat:1,clearcoatRoughness:.075,transparent:true,opacity:.36,depthWrite:false,side:THREE.DoubleSide});
 function mesh(geo,mat,pos=[0,0,0],rot,parent=model){const item=new THREE.Mesh(geo,mat);item.position.set(...pos);if(rot)item.rotation.set(...rot);parent.add(item);return item;}
 function roundedShape(w,h,r){
  const shape=new THREE.Shape(),x=-w/2,y=-h/2;r=Math.min(r,w/2,h/2);
  shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);
  shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);
  shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);return shape;
 }
 function box(w,h,d,mat,pos=[0,0,0],r=.025,bevel=.008,rot){
  const key='box/'+[w,h,d,r,bevel].join('/'),geo=cache(key,()=>{
   const g=new THREE.ExtrudeGeometry(roundedShape(w,h,r),{depth:d,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:4,steps:1});g.translate(0,0,-d/2);return g;
  });return mesh(geo,mat,pos,rot);
 }
 function cylinder(radius,depth,mat,pos,axis='z',segments=32){
  const geo=cache('cyl/'+[radius,depth,segments].join('/'),()=>new THREE.CylinderGeometry(radius,radius,depth,segments));
  return mesh(geo,mat,pos,axis==='x'?[0,0,Math.PI/2]:axis==='z'?[Math.PI/2,0,0]:null);
 }
 function ring(radius,tube,mat,pos,axis='z'){
  return mesh(cache('ring/'+radius+'/'+tube,()=>new THREE.TorusGeometry(radius,tube,8,48)),mat,pos,axis==='x'?[0,Math.PI/2,0]:axis==='y'?[Math.PI/2,0,0]:null);
 }

 // Long waterproof enclosure. A separate rear cap leaves a real, fine gasket line.
 box(.865,.60,1.42,paint,[0,-.015,-.075],.026,.008);
 box(.882,.615,.014,rubber,[0,-.015,-.793],.023,.002);
 box(.878,.612,.060,castPaint,[0,-.015,-.827],.025,.006);
 // Recessed lower channel and a small reinforcement, rather than open water-trapping vents.
 box(.72,.032,.94,castPaint,[0,-.325,-.10],.012,.005);
 for(const x of [-.29,.29])box(.028,.025,.89,paint,[x,-.343,-.10],.004,.003);

 // Folded sheet-metal rain hood. Its leading edge is diagonally cut, not a thick slab.
 const hoodSection=new THREE.Shape();
 hoodSection.moveTo(-.519,-.245);hoodSection.lineTo(-.519,.355);hoodSection.lineTo(-.467,.407);
 hoodSection.lineTo(.467,.407);hoodSection.lineTo(.519,.355);hoodSection.lineTo(.519,-.245);
 hoodSection.lineTo(.497,-.245);hoodSection.lineTo(.497,.346);hoodSection.lineTo(.458,.385);
 hoodSection.lineTo(-.458,.385);hoodSection.lineTo(-.497,.346);hoodSection.lineTo(-.497,-.245);hoodSection.closePath();
 const hoodGeo=new THREE.ExtrudeGeometry(hoodSection,{depth:1.76,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:1,steps:1,curveSegments:1});
 hoodGeo.translate(0,0,-.83);
 const hoodPositions=hoodGeo.attributes.position;
 for(let i=0;i<hoodPositions.count;i++)if(hoodPositions.getZ(i)>.90)hoodPositions.setZ(i,hoodPositions.getZ(i)-(.407-hoodPositions.getY(i))*.18);
 hoodPositions.needsUpdate=true;hoodGeo.computeVertexNormals();mesh(hoodGeo,hoodPaint);
 // The shaded hood underside has the anti-reflection finish of the optical compartment.
 mesh(new THREE.PlaneGeometry(.914,1.55),opticalBlack,[0,.383,.020],[Math.PI/2,0,0]);
 // Two rolled side folds and a narrow cover joint catch the light as the prop rotates.
 for(const x of [-.523,.523]){
  box(.008,.009,1.49,fold,[x,.135,-.035],.002,.001);
  box(.009,.010,1.49,paint,[x,.123,-.035],.002,.001);
  box(.008,.006,1.49,fold,[x,-.075,-.035],.002,.001);
 }
 for(const x of [-.37,.37])box(.016,.006,1.34,paint,[x,.412,-.025],.003,.001);

 // Rectangular dark optical window, deeply sheltered by the hood. The lens stays inside.
 const front=roundedShape(.882,.618,.027),hole=roundedShape(.742,.502,.018);
 front.holes.push(new THREE.Path(hole.getPoints(20)));
 const bezelGeo=new THREE.ExtrudeGeometry(front,{depth:.029,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:2,curveSegments:4,steps:1});
 bezelGeo.translate(0,-.015,.653);mesh(bezelGeo,castPaint);
 box(.753,.512,.016,rubber,[0,-.015,.652],.017,.001);
 // Opaque optical compartment and a modest, multi-element objective are visible through glazing.
 box(.736,.494,.012,opticalBlack,[0,-.015,.667],.014,.001);
 cylinder(.171,.025,lensBarrel,[0,-.027,.685]);
 ring(.158,.006,lensBarrel,[0,-.027,.702]);
 cylinder(.145,.006,aperture,[0,-.027,.683]);
 // A shallow spherical objective bends reflections as the camera rotates.
 // Its rim is recessed; the convex apex remains behind the flat protective window.
 const lensRadius=.33,lensOpening=.123,lensApex=.718;
 const objective=new THREE.SphereGeometry(lensRadius,48,16,0,Math.PI*2,0,Math.asin(lensOpening/lensRadius));
 objective.rotateX(Math.PI/2);mesh(objective,innerGlass,[0,-.027,lensApex-lensRadius]);
 ring(.126,.003,opticalBlack,[0,-.027,.695]);
 cylinder(.066,.003,aperture,[0,-.027,.688]);
 // Six restrained iris blades are an internal construction detail, never a luminous ring.
 const irisGeo=new THREE.CircleGeometry(.081,6);mesh(irisGeo,opticalBlack,[0,-.027,.690],[0,0,.18]);
 cylinder(.046,.002,aperture,[0,-.027,.691]);
 box(.739,.497,.005,windowGlass,[0,-.015,.725],.014,0);
 // A continuous elastomer seal around the glass opening.
 const seal=roundedShape(.760,.520,.021),sealHole=roundedShape(.740,.500,.016);seal.holes.push(new THREE.Path(sealHole.getPoints(20)));
 const sealGeo=new THREE.ExtrudeGeometry(seal,{depth:.006,bevelEnabled:false,curveSegments:4});sealGeo.translate(0,-.015,.721);mesh(sealGeo,rubber);

 // Underbody mounting shoe, serrated friction joint, cast arm and wall foot.
 box(.32,.055,.32,castPaint,[0,-.352,-.25],.018,.006);
 box(.071,.205,.22,paint,[-.129,-.456,-.25],.018,.006);
 box(.071,.205,.22,paint,[.129,-.456,-.25],.018,.006);
 cylinder(.093,.335,castPaint,[0,-.451,-.25],'x');
 for(const x of [-.171,.171]){cylinder(.078,.012,rubber,[x,-.451,-.25],'x');cylinder(.060,.019,steel,[x*1.055,-.451,-.25],'x',12);}
 box(.17,.10,.63,castPaint,[0,-.615,-.50],.022,.009,[.15,0,0]);
 box(.32,.335,.015,rubber,[0,-.705,-.877],.029,.001);
 box(.35,.365,.061,paint,[0,-.705,-.840],.030,.006);
 // A triangular web is part of the cast bracket, not a floating diagonal decoration.
 const rib=new THREE.Shape();rib.moveTo(.04,-.59);rib.lineTo(.267,-.59);rib.lineTo(.267,-.73);rib.closePath();
 const ribGeo=new THREE.ExtrudeGeometry(rib,{depth:.037,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:1,steps:1});
 ribGeo.rotateY(Math.PI/2);ribGeo.translate(-.018,0,-.54);mesh(ribGeo,castPaint);

 // Cable gland and a single relaxed service loop. Both ends enter actual metal parts.
 cylinder(.050,.025,fold,[.228,-.165,-.873],'z',6);
 cylinder(.039,.061,rubber,[.228,-.165,-.901]);
 for(let i=0;i<3;i++)ring(.039,.0035,rubber,[.228,-.165,-.883-i*.013]);
 const cablePath=new THREE.CatmullRomCurve3([
  new THREE.Vector3(.228,-.165,-.93),new THREE.Vector3(.289,-.375,-.913),
  new THREE.Vector3(.273,-.693,-.77),new THREE.Vector3(.173,-.849,-.53),
  new THREE.Vector3(.058,-.808,-.359),new THREE.Vector3(0,-.643,-.36)
 ]);
 mesh(new THREE.TubeGeometry(cablePath,38,.018,8,false),rubber);
 cylinder(.030,.058,rubber,[0,-.634,-.36],'y',16);

 // Countersunk hardware shares geometries and two draw calls for all screw heads.
 const screws=[];
 function screw(pos,axis='z'){screws.push({pos,axis});}
 for(const x of [-.403,.403])for(const y of [-.277,.247])screw([x,y,.689]);
 for(const x of [-.13,.13])for(const y of [-.59,-.82])screw([x,y,-.802]);
 for(const x of [-.525,.525])screw([x,-.14,-.57],'x');
 for(const x of [-.28,.28])screw([x,.416,-.43],'y');
 const headGeo=new THREE.CylinderGeometry(.014,.019,.010,12);headGeo.rotateX(Math.PI/2);
 const slotGeo=new THREE.BoxGeometry(.019,.0035,.0018);
 const heads=new THREE.InstancedMesh(headGeo,steel,screws.length),slots=new THREE.InstancedMesh(slotGeo,rubber,screws.length),dummy=new THREE.Object3D();
 screws.forEach(({pos,axis},i)=>{
  dummy.position.set(...pos);dummy.rotation.set(0,0,0);
  if(axis==='x')dummy.rotation.y=pos[0]>0?Math.PI/2:-Math.PI/2;
  else if(axis==='y')dummy.rotation.x=-Math.PI/2;
  else if(axis==='rear')dummy.rotation.y=Math.PI;
  dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix);
  dummy.translateZ(.0058);dummy.updateMatrix();slots.setMatrixAt(i,dummy.matrix);
 });
 heads.instanceMatrix.needsUpdate=slots.instanceMatrix.needsUpdate=true;model.add(heads,slots);
 model.userData.cameraProp={kind:'rectangular-weatherproof-road-camera',forward:'+Z',measured:false};
 return model;
}
