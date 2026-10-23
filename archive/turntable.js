/* Eight illustrated viewpoints, not a reconstructed 3D asset. Each frame is
   a complete rider image; loading never swaps to the coarse procedural model. */
(function(){'use strict';
 const image=new Image();image.src='archive/assets/rider-turntable-v4.png';
 function region(yaw){const n=((Math.round(yaw/(Math.PI*2)*8)%8)+8)%8;return[(n%4)/4,Math.floor(n/4)/2,1/4,1/2];}
 function render(ctx,m,o){if(!m.cleanWire||!window.ArchiveMotion)return false;
  let source=image,r=region(o.yaw||0);
  if(!image.complete||!image.naturalWidth){const item=window.ArchiveScans.describe('rider','main');source=item.image;r=item.region;}
  if(!source.complete||!source.naturalWidth){ctx.clearRect(0,0,o.w,o.h);return true;}
  window.ArchiveMotion.draw(ctx,source,r,o.w,o.h,{time:o.time,loading:true,completion:Math.min(1,(o.completion||0)*1.65+.08)});return true;
 }
 window.ArchiveTurntable={render,region};
})();
