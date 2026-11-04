/* Recompose the existing monitoring elements; IDs, tracking, dossier and local-module contracts stay intact. */
(function(){
 'use strict';
 const C=window.Census,video=document.getElementById('cam'),layout=document.querySelector('.layout'),sidebar=layout.querySelector('.sidebar'),stage=layout.querySelector('.stage'),web=document.getElementById('objectWeb'),deck=layout.querySelector('.deck'),code=document.getElementById('codePanel');
 document.body.classList.add('monitor-layout');
 const left=document.createElement('div');left.className='observation-column';
 const right=document.createElement('aside');right.className='observation-rail';right.setAttribute('aria-label','当前场景群落、识别进度与实时代码');
 const strip=document.createElement('section');strip.id='cameraStrip';strip.className='camera-strip';strip.setAttribute('aria-label','其他监控视角');
 strip.innerHTML='<header><span>其他视角</span><small id="cameraStripCurrent"></small></header><div class="camera-thumbnails"></div>';
 left.append(stage,strip);right.append(web);
 const stats=document.createElement('section');stats.id='monitorProgress';stats.className='monitor-progress';stats.setAttribute('aria-label','识别进度');
 stats.innerHTML='<header><span>识别进度</span><small>IDENTIFICATION</small></header><div class="monitor-progress-content"></div>';
 stats.querySelector('.monitor-progress-content').append(sidebar.querySelector('.detect-counter'),sidebar.querySelector('.track-progress'));
 const records=document.createElement('details');records.className='monitor-target-records';records.innerHTML='<summary>当前片段的对象记录 ↗</summary>';records.append(sidebar.querySelector('.target-list'));stats.append(records);right.append(stats,code);
 const legacy=document.createElement('details');legacy.className='legacy-research';legacy.hidden=true;legacy.innerHTML='<summary>历史素材研究面板</summary>';legacy.append(deck);left.append(legacy);
 legacy.addEventListener('toggle',()=>window.RenderLifecycle.changed());
 sidebar.hidden=true;document.getElementById('sceneOverview').hidden=true;web.querySelector('.ow-band').hidden=true;
 layout.append(left,right);
 web.setAttribute('aria-label','当前监控的实时局部群落');web.querySelector('.ow-title').textContent='实时局部群落';web.querySelector('.ow-eyebrow').textContent='LOCAL POPULATION / CURRENT CAMERA';
 web.querySelector('.ow-sub').textContent='跟随当前监控的观察记录 · 点击节点调档';web.querySelector('.ow-caption').textContent='原始标注回放 · 群体与物理身份待核验';
 sidebar.querySelector('.sidebar-foot')?.remove();
 stats.querySelector('.count-label').textContent='画面内 / 源标注总量';
 code.querySelector('.dh-title').textContent='实时代码';code.querySelector('.dh-en').textContent='VIDEO / EVENTS';
 const esc=window.ArchiveData.escape,buttons=strip.querySelector('.camera-thumbnails');
 let scenes=[],seen=new Set(),lastSecond=-1;
 function renderThumbnails(key){
  buttons.innerHTML=scenes.filter(s=>s.key!==key).map(s=>'<button type="button" class="camera-preview" data-preview-scene="'+s.key+'" aria-label="切换到 '+esc(s.cam)+' '+esc(s.alias)+'"><img src="integration/entry-frames/CAM0'+s.key.slice(-1)+'-02.jpg" alt="'+esc(s.alias)+'的监控视角"><span class="camera-preview-caption"><b>CAM0'+s.key.slice(-1)+'</b><span>'+esc(s.alias)+'</span><small>'+s.duration+'s · '+s.count+' 条来源记录</small></span><i aria-hidden="true">↗</i></button>').join('');
  buttons.classList.toggle('four-previews',key==='legacy');
  document.getElementById('cameraStripCurrent').textContent=key==='legacy'?'正在查看历史素材':'主画面 / CAM0'+key.slice(-1);
 }
 function sceneChanged(detail){
  const key=detail.sceneId;seen.clear();lastSecond=-1;renderThumbnails(key);legacy.hidden=key!=='legacy';
  window.Panels.code.reset?.(detail.scene||scenes.find(s=>s.key===key)||{key,cam:'历史素材'});
 }
 buttons.addEventListener('click',async e=>{
  const button=e.target.closest('[data-preview-scene]');if(!button)return;button.disabled=true;
  try{await window.__switchScene(button.dataset.previewScene);if(C.state.view==='monitor')video.play().catch(()=>{});}
  catch(error){console.error(error);}
  finally{button.disabled=false;}
 });
 C.events.addEventListener('scenechange',e=>sceneChanged(e.detail));
 C.events.addEventListener('objectdiscovered',e=>{
  const {canonicalId,object}=e.detail;if(seen.has(canonicalId)||!object)return;seen.add(canonicalId);
  window.Panels.code.push('object({ id: "'+canonicalId+'", source: "'+object.sourceId+'", type: "'+object.category+'", seenAt: '+video.currentTime.toFixed(2)+' }); // '+object.label);
 });
 C.events.addEventListener('frame',e=>{
  const second=Math.floor(e.detail.time);if(second===lastSecond)return;lastSecond=second;
  window.Panels.code.push('frame({ t: '+e.detail.time.toFixed(2)+', visible: '+e.detail.visibleIds.length+', camera: "'+(e.detail.sceneId==='legacy'?'ARCHIVE':'CAM0'+e.detail.sceneId.slice(-1))+'" });');
 });
 function playbackStatus(){const indicator=code.querySelector('.dh-live');indicator.innerHTML='<i></i>'+(video.paused?'PAUSED':'RUNNING');indicator.classList.toggle('paused',video.paused);}
 video.addEventListener('play',playbackStatus);video.addEventListener('pause',playbackStatus);playbackStatus();
 C.ready.then(data=>{scenes=data.scenes.filter(s=>s.key!=='legacy');const key=window.__activeScene?.()||'street2';sceneChanged({sceneId:key,scene:data.scenes.find(s=>s.key===key)});});
 window.addEventListener('resize',()=>window.RenderLifecycle.changed());
 window.RenderLifecycle.changed();
})();
