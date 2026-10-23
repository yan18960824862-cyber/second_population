/* Generated scan illustrations. Atlas regions stay in the original bitmap;
   no source measurements or real-world identification are inferred from them. */
(function(){'use strict';
 const atlas={
  rider:{src:'archive/assets/rider-wire-atlas-v3.png',main:[0,0,.603,1],wheel:[.61,0,.39,.505],assembly:[.61,.515,.39,.485]},
  sedan:{src:'archive/assets/sedan-scan-atlas-v2.png',main:[0,0,2/3,1],wheel:[2/3,0,1/3,.52],assembly:[2/3,.54,1/3,.46]},
  library:{src:'archive/assets/vehicle-library-scan-atlas-v2.png'}
 };
 const regions={suv:[0,0,.5,.49],truck:[.505,0,.495,.49],bus:[0,.5,.65,.5],coach:[0,.5,.65,.5],streetlight:[.66,.485,.34,.515]};
 const images={},pending=new WeakMap();
 for(const [key,a]of Object.entries(atlas)){const image=new Image();image.src=a.src;images[key]=image;}
 function keyFor(model){return model.archiveKind||(model.detailKind==='rider'?'rider':'sedan');}
 function describe(kind,view='main'){
  if(kind==='delivery'||kind==='ebike')kind='rider';
  if(kind==='rider'||kind==='sedan')return {image:images[kind],region:atlas[kind][view]||atlas[kind].main};
  if(regions[kind]){
   if(view==='main')return {image:images.library,region:regions[kind]};
   if(kind==='streetlight'){const r=regions[kind];return {image:images.library,region:[r[0],r[1]+r[3]*(view==='wheel'?0:.55),r[2],r[3]*.45]};}
   return {image:images.sedan,region:atlas.sedan[view]||atlas.sedan.main};
  }
  return null;
 }
 function draw(ctx,kind,view,w,h,o={}){if(!['rider','delivery','ebike'].includes(kind))return false;const item=describe(kind,view);if(!item)return false;ctx.clearRect(0,0,w,h);const image=item.image;
  if(!image.complete||!image.naturalWidth){if(!pending.has(ctx.canvas)){const redraw=()=>{pending.delete(ctx.canvas);if(ctx.canvas.isConnected!==false)draw(ctx,kind,view,w,h);};pending.set(ctx.canvas,redraw);image.addEventListener('load',redraw,{once:true});}return true;}
  if(o.motion&&window.ArchiveMotion){const rect=window.ArchiveMotion.draw(ctx,image,item.region,w,h,o);if(o.energy)window.ArchiveMotion.energy(ctx,rect,o.time||0);return true;}
  const [rx,ry,rw,rh]=item.region,sx=rx*image.naturalWidth,sy=ry*image.naturalHeight,sw=rw*image.naturalWidth,sh=rh*image.naturalHeight;
  const scale=Math.min(w/sw,h/sh)*.98,dw=sw*scale,dh=sh*scale;
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,sx,sy,sw,sh,(w-dw)/2,(h-dh)/2,dw,dh);ctx.restore();return true;
 }
 function detail(canvas,obj,view,o={}){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.5),w=Math.max(1,r.width),h=Math.max(1,r.height);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);const kind=obj.category==='person'?'rider':window.ModelEngine.detectSubtype(obj.category,obj.labelEn);return draw(ctx,kind,view,w,h,o);}
 window.ArchiveScans={draw,detail,keyFor,describe};
})();
