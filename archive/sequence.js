/* Same timeline as the approved ac-archive/ac-state.js, shared by the scan
   window and the 3D player so reveal, rotation and fade cannot drift apart. */
(function(){'use strict';
 const clamp=x=>Math.max(0,Math.min(1,x));
 function frame(elapsed,duration=6600){const p=clamp(elapsed/duration);return{
  progress:Math.round(clamp((p-.14)/.78)*100),
  yaw:clamp((p-.18)/.7)*Math.PI*4,
  completion:clamp((p-.16)/.4),
  objectOpacity:clamp((p-.16)/.07)*clamp((.97-p)/.04),
  frameOpacity:clamp(p/.055)*clamp((1-p)/.04),
  frameX:.28+.72*clamp((p-.035)/.095),
  frameY:.02+.98*clamp((p-.065)/.095),
  contentOpacity:clamp((p-.14)/.04)*clamp((.97-p)/.03),
  label:p<.16?'INITIALIZING':p<.6?'STRUCTURE / ACQUIRING':p<.92?'ROTATION / ANALYZING':'RECORD / READY',
  done:p>=1
 };}
 window.ArchiveSequence={frame,duration:6600};
})();
