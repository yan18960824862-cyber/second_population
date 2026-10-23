/* Native WebGL2 acceleration for the procedural rider. No external 3D tool,
   library, model download or service is used. Canvas fallback remains available. */
(function(){'use strict';
 const states=new WeakMap();
 const vertex=`#version 300 es
 precision highp float;
 layout(location=0) in vec3 aPosition;
 layout(location=1) in vec3 aNormal;
 layout(location=2) in vec3 aBary;
 layout(location=3) in vec3 aMask;
 layout(location=4) in float aLevel;
 uniform vec2 uSize;
 uniform vec2 uAngle;
 uniform float uScale;
 out vec3 vBary;
 flat out vec3 vMask;
 flat out vec3 vNormal;
 flat out float vLevel;
 vec3 rotate(vec3 p){float cy=cos(uAngle.x),sy=sin(uAngle.x),cp=cos(uAngle.y),sp=sin(uAngle.y);float x=p.x*cy+p.z*sy,z=-p.x*sy+p.z*cy;return vec3(x,p.y*cp-z*sp,p.y*sp+z*cp);}
 void main(){vec3 p=rotate(aPosition);float d=8.6-p.z;gl_Position=vec4(2.0*p.x*uScale*8.6/uSize.x,2.0*(p.y-.1)*uScale*8.6/uSize.y,(21.0*d-40.0)/19.0,d);vBary=aBary;vMask=aMask;vNormal=rotate(aNormal);vLevel=aLevel;}`;
 const fragment=`#version 300 es
 precision highp float;
 in vec3 vBary;
 flat in vec3 vMask;
 flat in vec3 vNormal;
 flat in float vLevel;
 uniform float uCompletion;
 uniform float uLine;
 uniform bool uEdges;
 out vec4 color;
 void main(){
  vec3 ink=vec3(168.0,211.0,224.0)/255.0;
  if(uEdges){if(vLevel>uCompletion||(length(vNormal)>.1&&vNormal.z<.03))discard;color=vec4(ink*.95,1.0);return;}
  vec3 enabled=vec3(0.0);
  for(int k=0;k<3;k++){
   if(vMask[k]>2.5&&uCompletion>.015)enabled[k]=1.0;
   else if(vMask[k]>1.5&&uCompletion>=vLevel)enabled[k]=1.0;
   else if(vMask[k]>.5&&abs(vNormal.z)<.10&&uCompletion>.015)enabled[k]=1.0;
  }
  if(vNormal.z<-.03)enabled=vec3(0.0);
  vec3 aa=max(fwidth(vBary)*uLine,vec3(.00001));
  vec3 edges=(vec3(1.0)-smoothstep(aa*.1,aa*1.25,vBary))*enabled;
  float line=max(edges.x,max(edges.y,edges.z));color=vec4(ink*line*.92,1.0);
 }`;
 function program(gl){const shaders=[gl.VERTEX_SHADER,gl.FRAGMENT_SHADER].map((kind,i)=>{const s=gl.createShader(kind);gl.shaderSource(s,i?fragment:vertex);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;});const p=gl.createProgram();shaders.forEach(s=>gl.attachShader(p,s));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));shaders.forEach(s=>gl.deleteShader(s));return p;}
 function meshBuffers(gl,m){const triangles=[],lines=[];
  const push=(target,p,n,bary,mask,level)=>target.push(...p,...n,...bary,...mask,level);
  m.faces.forEach(f=>{const N=f.p.length,wires=new Set((f.wires||[]).map(([a,b])=>a<b?a+','+b:b+','+a));
   const mask=(a,b)=>{const key=a<b?a+','+b:b+','+a;if(wires.has(key))return 2;let edge=-1;if((a+1)%N===b)edge=a;else if((b+1)%N===a)edge=b;if(edge<0)return 0;const linked=f.links[edge].faces;if(linked.length===1)return 3;const sharp=linked.some(i=>{const n=m.faces[i].n;return n&&n.reduce((s,v,k)=>s+v*f.n[k],0)<.7;});return sharp?3:1;};
   for(let j=1;j<N-1;j++){const indices=[0,j,j+1],flags=[mask(j,j+1),mask(j+1,0),mask(0,j)];for(let k=0;k<3;k++)push(triangles,f.p[indices[k]],f.n||[0,0,1],[k===0?1:0,k===1?1:0,k===2?1:0],flags,f.gridLevel??.1);}
  });
  for(const e of m.edges)for(const p of [e.a,e.b])push(lines,p,e.normal||[0,0,0],[0,0,0],[0,0,0],e.lvl);
  const buffer=data=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);return{buffer:b,count:data.length/13};};
  return{triangles:buffer(triangles),lines:buffer(lines)};
 }
 function bind(gl,data){gl.bindBuffer(gl.ARRAY_BUFFER,data.buffer);for(const [i,size,offset]of [[0,3,0],[1,3,3],[2,3,6],[3,3,9],[4,1,12]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,size,gl.FLOAT,false,52,offset*4);}}
 function draw(ctx,m,o){if(typeof document==='undefined')return false;let s=states.get(ctx.canvas);if(s===false)return false;
  try{
   if(!s){const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl){states.set(ctx.canvas,false);return false;}const p=program(gl),locations={};for(const key of ['uSize','uAngle','uScale','uCompletion','uLine','uEdges'])locations[key]=gl.getUniformLocation(p,key);s={canvas,gl,p,locations};states.set(ctx.canvas,s);}
   const {canvas,gl,p,locations:u}=s;if(s.model!==m){if(s.mesh){gl.deleteBuffer(s.mesh.triangles.buffer);gl.deleteBuffer(s.mesh.lines.buffer);}s.mesh=meshBuffers(gl,m);s.model=m;}
   const width=ctx.canvas.width,height=ctx.canvas.height;if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}gl.viewport(0,0,width,height);gl.useProgram(p);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.uniform2f(u.uSize,o.w,o.h);gl.uniform2f(u.uAngle,(o.yaw||0)+2.6,.14);gl.uniform1f(u.uScale,Math.min(o.w*.71/2.25,o.h*.78/2.25));gl.uniform1f(u.uCompletion,o.completion??1);gl.uniform1f(u.uLine,.72*width/o.w);
   gl.uniform1i(u.uEdges,0);gl.depthRange(0,1);bind(gl,s.mesh.triangles);gl.drawArrays(gl.TRIANGLES,0,s.mesh.triangles.count);
   gl.uniform1i(u.uEdges,1);gl.depthRange(0,.9999);bind(gl,s.mesh.lines);gl.drawArrays(gl.LINES,0,s.mesh.lines.count);
   ctx.clearRect(0,0,o.w,o.h);ctx.save();ctx.globalAlpha=o.opacity??1;ctx.drawImage(canvas,0,0,o.w,o.h);ctx.restore();return true;
  }catch(error){states.set(ctx.canvas,false);return false;}
 }
 window.RiderGPU={draw};
})();
