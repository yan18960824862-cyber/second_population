/* One continuous entrance, ending at four physical CRTs. The same room can be revisited. */
(function(){
 'use strict';
 let resolve;const finished=new Promise(r=>resolve=r);let first=true,engine=null,finishCurrent=null;
 const api=window.CameraPrelude={finished,directEntry:true,active:false};
 function launch(roomOnly=false){
  if(api.active)return;
  const initial=first,returnSnapshot=initial?null:window.Monitor.snapshot();
  let ended=false,pending=roomOnly?1:0,instant=roomOnly;
  Object.assign(api,{ready:false,active:true,running:false,disposed:false,failed:null,frames:0,progress:0,resourcesAfterDispose:null,cancelLoading:null});
  document.body.classList.add('is-entry','entry-integrated');window.Census.setState({view:'entry'});document.getElementById('cam').pause();window.RenderLifecycle?.changed();
  const host=document.createElement('section');host.id='cameraPrelude';host.className='monitor-entry';host.tabIndex=0;
  host.setAttribute('aria-label','第二人口：摄像头坠入影像通道，进入四台实体监视器的观察台');
  host.innerHTML='<div class="entry-stage"></div><canvas class="entry-handoff" aria-hidden="true"></canvas><div class="entry-signal boot-scan" aria-hidden="true"></div><div class="entry-signal boot-noise" aria-hidden="true"></div><header class="entry-header"><span>THE SECOND POPULATION</span><span>OBSERVATION DESK / FOUR CHANNELS</span></header><div class="entry-title"><small>THE SECOND POPULATION</small><h1>第二人口</h1><p>向下滚动，跟随摄像头进入监控影像。</p></div><div class="terminal-access" aria-label="四台监视器"></div><footer class="entry-footer"><div class="entry-progress"><span id="entryPhase">正在载入四个观察现场</span><label><span class="entry-sr">开场进度</span><input id="entryProgress" type="range" min="0" max="1000" value="0" aria-label="摄像头坠落与影像通道进度"><output id="entryPercent">00%</output></label><small id="entryHint">向下滚动进入 · 向上滚动回看</small></div><button type="button" id="entrySkip">'+(roomOnly?'返回当前监控 ↗':'跳过过场 ↗')+'</button></footer>';
  document.body.append(host);
  function finish(reason='screen'){
   if(ended)return;ended=true;engine?.dispose();api.cancelLoading?.();
   api.active=api.running=false;api.disposed=true;api.reason=reason;document.body.classList.remove('is-entry');host.classList.add('entry-leaving');
   if(initial){first=false;resolve({integrated:true,reason});}
   else if(reason==='return'&&returnSnapshot)window.Monitor.restore(returnSnapshot);
   else{window.Census.setState({view:'monitor'});window.RenderLifecycle.changed();document.getElementById('cam').play().catch(()=>{});}
   setTimeout(()=>host.remove(),260);
  }
  finishCurrent=finish;
  api.skip=()=>{
   if(api.failed){finish(initial?'fallback':'return');return;}
   if(roomOnly){finish('return');return;}
   pending=1;instant=true;engine?.toRoom();
  };
  api.setProgress=value=>{pending=Math.max(0,Math.min(1,Number(value)||0));engine?.setProgress(pending);};
  api.selectStation=key=>engine?.selectStation(key);
  api.getState=()=>({...engine?.snapshot(),active:api.active,running:api.running,ready:api.ready,disposed:api.disposed,progress:api.progress,frames:api.frames,failed:api.failed||null,resourcesAfterDispose:api.resourcesAfterDispose});
  host.querySelector('#entrySkip').onclick=api.skip;
  import('./monitor-entry.js').then(async module=>{
   if(ended)return;
   const mounted=await module.mountMonitorEntry(host,api,finish,{roomOnly});
   if(ended){mounted.dispose();return;}engine=mounted;
   api.ready=true;if(instant)engine.toRoom();else engine.setProgress(pending);
   host.focus({preventScroll:true});
  }).catch(error=>{
   if(ended)return;api.failed=error.message;api.ready=true;api.running=false;
   host.classList.add('entry-fallback');host.querySelector('#entryPhase').textContent='三维入口暂不可用';
   host.querySelector('.entry-title p').textContent='可以直接进入监控；四路原始影像与档案仍可查看。';
   host.querySelector('#entryProgress').disabled=true;host.querySelector('#entrySkip').textContent='直接进入监控 ↗';
   console.warn('[ENTRY] 3D entrance unavailable; direct monitoring remains available:',error.message);
  });
 }
 window.ObservationDesk={open:()=>launch(true),close:()=>finishCurrent?.('return')};
 launch();
})();
