/* A cancelled chain has no outstanding RAF. Owners resume explicitly on visibility changes. */
(function(){
 const loops=new Map();
 function loop(name,step,visible){let id=0,last=0;const state={frames:0,running:false};
  const allowed=()=>!document.hidden&&visible();
  function tick(t){id=0;if(!allowed()){state.running=false;return}if(t-last>=32){last=t;step(t);state.frames++}id=requestAnimationFrame(tick)}
  function sync(){if(allowed()){if(!id){last=0;state.running=true;id=requestAnimationFrame(tick)}}else{cancelAnimationFrame(id);id=0;state.running=false}}
  loops.set(name,{state,sync});document.addEventListener('visibilitychange',sync);window.addEventListener('sp:viewchange',sync);sync();return {sync,stop(){cancelAnimationFrame(id);id=0;state.running=false}};
 }
 const stageVisible=()=>window.Census.state.view==='monitor'&&!document.body.classList.contains('is-booting')&&!document.body.classList.contains('is-selecting')&&!document.getElementById('globalSurvey')?.open&&!document.getElementById('sourceMaterials')?.open&&!document.getElementById('objArchive')?.matches(':not([hidden])')&&!document.getElementById('acArchive')?.matches(':not([hidden])')&&!document.getElementById('evidenceRecord')?.open;
 window.RenderLifecycle={loop,stageVisible,changed(){window.dispatchEvent(new Event('sp:viewchange'))},snapshot(){return Object.fromEntries([...loops].map(([k,v])=>[k,{...v.state}]))}};
 const markSuspended=()=>{document.body.classList.toggle('scene-suspended',document.hidden||!stageVisible());};
 window.addEventListener('sp:viewchange',()=>queueMicrotask(markSuspended));document.addEventListener('visibilitychange',markSuspended);markSuspended();
})();
