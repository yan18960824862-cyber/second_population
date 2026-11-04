/* Four physical CRT terminals in one room. Source imagery is provided by the integration controller. */
export function buildMonitorRoom(THREE,clips){
 const root=new THREE.Group(),targets=[],stations=[],textures=new Set();
 const colors={shell:'#77766e',edge:'#393d37',dark:'#111613',keys:'#8e8c7f',blackKeys:'#262c28'};
 const plastic=new THREE.MeshStandardMaterial({color:colors.shell,roughness:.68,metalness:.07});
 const trim=new THREE.MeshStandardMaterial({color:colors.edge,roughness:.55,metalness:.2});
 const dark=new THREE.MeshStandardMaterial({color:colors.dark,roughness:.7,metalness:.1});
 const keyMat=new THREE.MeshStandardMaterial({color:colors.keys,roughness:.76});
 const blackKeyMat=new THREE.MeshStandardMaterial({color:colors.blackKeys,roughness:.6});
 const screwMat=new THREE.MeshStandardMaterial({color:'#a7a89c',roughness:.45,metalness:.75});
 const dummy=new THREE.Object3D(),box=new THREE.BoxGeometry(1,1,1);
 function rect(w,h,r){const s=new THREE.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return s;}
 const bezel=rect(3.22,2.52,.2),hole=rect(2.67,1.91,.19);bezel.holes.push(new THREE.Path(hole.getPoints().map(p=>new THREE.Vector2(p.x,p.y+.12))));
 const bezelGeo=new THREE.ExtrudeGeometry(bezel,{depth:.22,bevelEnabled:true,bevelSegments:3,bevelSize:.035,bevelThickness:.035,curveSegments:7});
 const keyboardGeo=new THREE.ExtrudeGeometry(rect(3.23,1.15,.1),{depth:.17,bevelEnabled:true,bevelSegments:2,bevelSize:.045,bevelThickness:.035,curveSegments:4});keyboardGeo.rotateX(-Math.PI/2);
 const screenGeo=new THREE.PlaneGeometry(2.64,1.88,36,26),pos=screenGeo.attributes.position;
 for(let i=0;i<pos.count;i++){const x=pos.getX(i)/1.32,y=pos.getY(i)/.94;pos.setZ(i,.145*(1-x*x)*(1-y*y));}screenGeo.computeVertexNormals();
 const screwGeo=new THREE.CylinderGeometry(.022,.022,.02,8);screwGeo.rotateX(Math.PI/2);
 function addBox(group,x,y,z,w,h,d,material){const m=new THREE.Mesh(box,material);m.position.set(x,y,z);m.scale.set(w,h,d);group.add(m);return m;}
 function taperedCase(){
  const vertices=new Float32Array([-1.6,-1.24,.88,1.6,-1.24,.88,1.6,1.24,.88,-1.6,1.24,.88,-1.31,-1.08,-1.3,1.31,-1.08,-1.3,1.31,1.0,-1.3,-1.31,1.0,-1.3]);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5]);geometry.computeVertexNormals();return geometry;
 }
 const caseGeo=taperedCase();
 const glyphCanvas=document.createElement('canvas');glyphCanvas.width=1024;glyphCanvas.height=320;
 const glyphs=glyphCanvas.getContext('2d');glyphs.fillStyle='#20271f';glyphs.textAlign='center';glyphs.textBaseline='middle';glyphs.font='500 38px monospace';
 ['1234567890-=','QWERTYUIOP[]',"ASDFGHJKL;'Z",'ZXCVBNM,./<>'].forEach((row,y)=>{[...row].forEach((key,x)=>glyphs.fillText(key,(x+.5)*1024/12,(y+.5)*80));});
 const glyphTexture=new THREE.CanvasTexture(glyphCanvas);glyphTexture.colorSpace=THREE.SRGBColorSpace;textures.add(glyphTexture);
 function labelTexture(text,subtitle){
  const c=document.createElement('canvas');c.width=1024;c.height=104;const g=c.getContext('2d');g.fillStyle='#161c18';g.fillRect(0,0,1024,104);g.fillStyle='#b3b5a7';g.font='34px monospace';g.fillText(text,24,44);g.font='20px sans-serif';g.fillStyle='#747e71';g.fillText(subtitle,24,80);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);return texture;
 }
 const layout=[[-2.1,1.85,-1.3,.11],[2.1,1.85,-1.3,-.11],[-2.1,-1,1.5,.08],[2.1,-1,1.5,-.08]];
 clips.forEach((clip,index)=>{
  const group=new THREE.Group(),[x,y,z,angle]=layout[index];group.position.set(x,y,z);group.rotation.y=angle;root.add(group);
  const casing=new THREE.Mesh(caseGeo,plastic);group.add(casing);
  const front=new THREE.Mesh(bezelGeo,plastic);front.position.z=.89;group.add(front);
  addBox(group,0,.1,.90,2.89,2.15,.12,dark);
  const uniforms={map:{value:clip.texture},hover:{value:0}};
  const screenMat=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:true,vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`
    precision highp float;varying vec2 v;uniform sampler2D map;uniform float hover;
    void main(){vec2 q=abs(v-.5)-vec2(.438,.416);float d=length(max(q,0.))+.0;float mask=1.-smoothstep(.067,.075,d);if(mask<.02)discard;
      vec3 sampleColor=texture2D(map,v).rgb;float l=dot(sampleColor,vec3(.2126,.7152,.0722));float scan=.94+.045*sin(v.y*560.);
      float falloff=1.-.24*dot(v-.5,v-.5);vec3 c=vec3(l)*vec3(.90,1.,.93)*scan*falloff*(.94+hover*.14);
      gl_FragColor=vec4(c,mask);}
  `});
  const screen=new THREE.Mesh(screenGeo,screenMat);screen.position.set(0,.12,1.165);screen.userData={sceneId:clip.sceneId,index};group.add(screen);targets.push(screen);
  // Slight glazing reflection, without an emissive halo around the case.
  const glass=new THREE.Mesh(screenGeo,new THREE.MeshPhysicalMaterial({color:'#869c8c',roughness:.17,metalness:.12,transparent:true,opacity:.07,clearcoat:1,depthWrite:false}));
  glass.position.copy(screen.position);glass.position.z+=.008;group.add(glass);
  const plaque=new THREE.Mesh(new THREE.PlaneGeometry(2.15,.22),new THREE.MeshBasicMaterial({map:labelTexture(clip.cameraId+' / SECOND POPULATION',clip.alias),toneMapped:false}));plaque.position.set(-.22,-1.05,1.16);group.add(plaque);
  const led=new THREE.Mesh(new THREE.SphereGeometry(.033,10,8),new THREE.MeshBasicMaterial({color:'#97b389'}));led.position.set(1.19,-.99,1.16);group.add(led);
  addBox(group,1.32,-.98,1.12,.13,.12,.055,trim);
  const screws=new THREE.InstancedMesh(screwGeo,screwMat,4);let screw=0;for(const sx of [-1.43,1.43])for(const sy of [-1.08,1.08]){dummy.position.set(sx,sy,1.14);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();screws.setMatrixAt(screw++,dummy.matrix);}group.add(screws);
  const vents=new THREE.InstancedMesh(box,dark,24);for(let i=0;i<24;i++){const side=i<12?-1:1;dummy.position.set(side*1.535,.05+Math.floor(i%12/6)*.13,.4-(i%6)*.18);dummy.rotation.set(0,0,0);dummy.scale.set(.012,.055,.11);dummy.updateMatrix();vents.setMatrixAt(i,dummy.matrix);}group.add(vents);
  addBox(group,0,-1.36,-.14,2.15,.2,1.65,trim);addBox(group,0,-1.48,-.14,2.65,.09,1.85,plastic);
  const keyboard=new THREE.Mesh(keyboardGeo,plastic);keyboard.position.set(0,-1.51,1.93);group.add(keyboard);
  addBox(group,0,-1.315,1.94,2.95,.04,.92,dark);
  const keys=new THREE.InstancedMesh(box,keyMat,48),functionKeys=new THREE.InstancedMesh(box,blackKeyMat,12);
  for(let k=0;k<48;k++){const col=k%12,row=Math.floor(k/12);dummy.position.set(-1.34+col*.207,-1.25,1.61+row*.202);dummy.rotation.set(-.05,0,0);dummy.scale.set(.17,.10,.155);dummy.updateMatrix();keys.setMatrixAt(k,dummy.matrix);}group.add(keys);
  for(let k=0;k<12;k++){dummy.position.set(-1.34+k*.207,-1.255,1.39);dummy.rotation.set(0,0,0);dummy.scale.set(.17,.09,.105);dummy.updateMatrix();functionKeys.setMatrixAt(k,dummy.matrix);}group.add(functionKeys);
  const legends=new THREE.Mesh(new THREE.PlaneGeometry(2.484,.808),new THREE.MeshBasicMaterial({map:glyphTexture,transparent:true,depthWrite:false,toneMapped:false}));legends.rotation.x=-Math.PI/2;legends.position.set(-.2015,-1.193,1.913);group.add(legends);
  addBox(group,-.1,-1.24,2.46,1.35,.1,.15,keyMat);addBox(group,1.29,-1.24,2.35,.20,.10,.36,blackKeyMat);
  stations.push({group,screen,material:screenMat,clip});
 });
 root.position.set(0,-10.55,-175);
 const furniture=new THREE.Group();furniture.position.copy(root.position);root.parentFurniture=furniture;
 addBox(furniture,0,-1.67,.8,15.25,.18,8,new THREE.MeshStandardMaterial({color:'#242824',roughness:.72,metalness:.16}));
 addBox(furniture,0,-1.8,4.73,15.2,.12,.18,trim);
 for(const x of [-6.75,6.75])for(const z of [-1.9,2.1])addBox(furniture,x,-2.5,z,.16,1.6,.16,dark);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(160,150),new THREE.MeshStandardMaterial({color:'#131815',roughness:.8,metalness:.09}));floor.rotation.x=-Math.PI/2;floor.position.set(0,-14,-177);
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const shadow=shadowCanvas.getContext('2d'),gradient=shadow.createRadialGradient(64,64,2,64,64,64);gradient.addColorStop(0,'rgba(0,0,0,.65)');gradient.addColorStop(1,'rgba(0,0,0,0)');shadow.fillStyle=gradient;shadow.fillRect(0,0,128,128);
 const shadowTexture=new THREE.CanvasTexture(shadowCanvas);textures.add(shadowTexture);
 for(const station of stations){const patch=new THREE.Mesh(new THREE.PlaneGeometry(3.8,3.8),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));patch.rotation.x=-Math.PI/2;patch.position.set(station.group.position.x,-1.565,station.group.position.z+.5);root.add(patch);}
 const upperShelf=addBox(furniture,0,1.25,-1.6,7.7,.15,3.8,trim);
 for(const x of [-5.25,5.25])for(const z of [-2.7,-.4])addBox(furniture,x,-.15,z,.09,2.7,.09,dark);
 return {root,furniture,floor,targets,stations,textures,
  setCompact(compact){
   stations.forEach((s,i)=>{const values=compact?[[ -1.9,1.45,-1.8,.05],[1.9,1.45,-1.8,-.05],[-1.9,-1.5,1.3,.05],[1.9,-1.5,1.3,-.05]][i]:layout[i];s.group.position.set(values[0],values[1],values[2]);s.group.rotation.y=values[3];});
   furniture.scale.x=compact?.55:.68;furniture.position.y=root.position.y+(compact?-1.5:-1);
   upperShelf.scale.x=1/furniture.scale.x;upperShelf.position.y=compact?1.35:1.25;floor.position.y=compact?-16:-14.8;
  },
  setHover(index){stations.forEach((s,i)=>s.material.uniforms.hover.value=i===index?1:0);}
 };
}
