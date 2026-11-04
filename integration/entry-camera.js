/* Camera geometry adapted from the supplied second-population-v5-preview.html. */
export function buildCamera(THREE){
function roughTex(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');const d=x.createImageData(128,128);for(let i=0;i<d.data.length;i+=4){let v=190+Math.random()*25;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255}x.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(3,3);return t}
const white=new THREE.MeshStandardMaterial({color:'#a7aaa6',roughness:.43,metalness:.32,roughnessMap:roughTex(),bumpMap:roughTex(),bumpScale:.0018}),edge=new THREE.MeshStandardMaterial({color:'#3c4444',roughness:.6,metalness:.48}),dark=new THREE.MeshStandardMaterial({color:'#141b1c',roughness:.47,metalness:.5}),glass=new THREE.MeshPhysicalMaterial({color:'#101918',roughness:.08,metalness:.38,clearcoat:1,clearcoatRoughness:.05}),bolt=new THREE.MeshStandardMaterial({color:'#6e7471',metalness:.85,roughness:.3});
const model=new THREE.Group();
function part(geo,mat,pos,rot,parent=model){const m=new THREE.Mesh(geo,mat);m.position.set(...pos);if(rot)m.rotation.set(...rot);parent.add(m);return m}
function softBox(w,h,d,mat,pos){const r=.055,sh=new THREE.Shape();sh.moveTo(-w/2+r,-h/2);sh.lineTo(w/2-r,-h/2);sh.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);sh.lineTo(w/2,h/2-r);sh.quadraticCurveTo(w/2,h/2,w/2-r,h/2);sh.lineTo(-w/2+r,h/2);sh.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);sh.lineTo(-w/2,-h/2+r);sh.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);const geo=new THREE.ExtrudeGeometry(sh,{depth:d,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:3,steps:1,curveSegments:5});geo.translate(0,0,-d/2);return part(geo,mat,pos)}
softBox(1.04,.72,1.85,white,[0,0,0]);softBox(1.14,.075,2.28,white,[0,.41,.16]);softBox(1.015,.68,.055,edge,[0,0, .96]);softBox(.84,.54,.055,dark,[0,-.015,1.005]);
// Glazed optical assembly and concentric lens rings, real depth, no emissive neon lens.
part(new THREE.CylinderGeometry(.24,.24,.07,48),dark,[0,-.02,1.075],[Math.PI/2,0,0]);part(new THREE.TorusGeometry(.223,.018,10,48),bolt,[0,-.02,1.12]);part(new THREE.CylinderGeometry(.193,.193,.018,48),glass,[0,-.02,1.13],[Math.PI/2,0,0]);part(new THREE.CylinderGeometry(.095,.095,.02,36),new THREE.MeshStandardMaterial({color:'#070f14',roughness:.13,metalness:.8}),[0,-.02,1.145],[Math.PI/2,0,0]);
for(let k=0;k<6;k++){part(new THREE.TorusGeometry(.11+k*.013,.002,5,40),dark,[0,-.02,1.15+k*.001])}
for(const x of [-.43,.43])for(const y of [-.26,.26])part(new THREE.CylinderGeometry(.022,.022,.025,10),bolt,[x,y,.998],[Math.PI/2,0,0]);
// Underbody joint, actual horizontal wall bracket and mounting plate.
part(new THREE.CylinderGeometry(.16,.18,.3,24),white,[0,-.51,-.16]);part(new THREE.SphereGeometry(.13,18,12),edge,[0,-.69,-.16]);softBox(.19,.18,1.05,white,[0,-.76,-.6]);softBox(.57,.58,.10,white,[0,-.77,-1.15]);
for(const x of [-.2,.2])for(const y of [-.97,-.56])part(new THREE.CylinderGeometry(.028,.028,.04,10),bolt,[x,y,-1.22],[Math.PI/2,0,0]);
for(let k=0;k<8;k++)part(new THREE.BoxGeometry(.008,.11,.018),edge,[-.524,-.1,-.6+k*.12]);
// Recessed seams, hood lips, lens glint and fasteners catch the same ambient light.
for(const x of [-.51,.51])part(new THREE.BoxGeometry(.016,.025,1.62),edge,[x,.3,.03]);
part(new THREE.BoxGeometry(.98,.014,.012),dark,[0,.25,.986]);
part(new THREE.TorusGeometry(.186,.004,8,48),edge,[0,-.02,1.147]);
// Subtle embossed seams along enclosure.
part(new THREE.BoxGeometry(1.052,.012,1.65),edge,[0,-.24,-.02]);

// Keep the same dark, compact box housing and deep hood as the cover camera.
const cameraShell=new THREE.Group();for(const child of [...model.children])cameraShell.add(child);cameraShell.scale.set(1,1.18,.72);model.add(cameraShell);

return model;
}
