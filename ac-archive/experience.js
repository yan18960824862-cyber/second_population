import {SUBJECT_ID,SCAN_DURATION,scanFrame,createController} from './ac-state.js';
import {ACModel} from './ac-renderer.js';
import {ACSurface} from './ac-surface.js';
import {MeshLoader} from './ac-loader.js';
import {DossierEntry} from './dossier-entry.js';
const $=id=>document.getElementById(id), controller=createController();
const models={space:new ACModel($('space-model')),scan:new MeshLoader($('scan-model')),dossier:new ACSurface($('dossier-model'))};
let started=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const dossierEntry=new DossierEntry($('dossier'),{reduced});
let running=!reduced,operatingTime=0,lastFrame=performance.now();
const operationButton=document.createElement('button');operationButton.id='operation-toggle';operationButton.type='button';operationButton.setAttribute('aria-pressed',String(running));operationButton.textContent=running?'● SIGNAL ACTIVE / PAUSE Ⅱ':'○ PAUSED / RUN ▷';operationButton.setAttribute('aria-label','Pause or resume the thermal flow illustration');document.querySelector('.object-visual .mini-heading>span:last-child').replaceWith(operationButton);
operationButton.addEventListener('click',()=>{running=!running;operationButton.setAttribute('aria-pressed',String(running));operationButton.textContent=running?'● SIGNAL ACTIVE / PAUSE Ⅱ':'○ PAUSED / RUN ▷';$('dossier').classList.toggle('is-running',running);});
const coilImage=document.querySelector('img[src="./assets/ac-coil-detail.png"]');
const flowCanvas=document.createElement('canvas');flowCanvas.className='thermal-overlay';flowCanvas.setAttribute('aria-hidden','true');coilImage.parentElement.append(flowCanvas);
function drawThermal(time){const r=coilImage.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=Math.min(devicePixelRatio||1,1.5);if(flowCanvas.width!==Math.round(r.width*dpr)||flowCanvas.height!==Math.round(r.height*dpr)){flowCanvas.width=Math.round(r.width*dpr);flowCanvas.height=Math.round(r.height*dpr);}flowCanvas.style.top=coilImage.offsetTop+'px';flowCanvas.style.left=coilImage.offsetLeft+'px';flowCanvas.style.width=r.width+'px';flowCanvas.style.height=r.height+'px';const c=flowCanvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,r.width,r.height);c.save();c.scale(r.width/337,r.height/206);c.strokeStyle='#c2f0ff';c.lineWidth=1.4;c.shadowColor='#84d9ff';c.shadowBlur=5;c.setLineDash([13,55]);c.lineDashOffset=-time*.035;c.globalAlpha=.8;c.beginPath();for(let i=0;i<14;i++){const yy=25+i*11;if(i===0)c.moveTo(36,yy);c.lineTo(i%2?36:211,yy);if(i<13)c.lineTo(i%2?36:211,yy+11);}c.stroke();c.restore();}
function show(phase){dossierEntry.cancel();for(const id of ['space','scan','dossier'])$(id).hidden=id!==phase;document.body.dataset.phase=phase;models[phase]?.resize();$('dossier').classList.remove('is-open');if(phase==='dossier'){dossierEntry.play();requestAnimationFrame(()=>{if(controller.state==='dossier')$('dossier').classList.add('is-open');});$('dossier').classList.toggle('is-running',running);$('record-title').focus();}else if(phase==='scan')$('cancel-acquisition').focus();else $('object-target').focus();}
function open(id=SUBJECT_ID){if(!controller.open(id))return false;started=performance.now();show('scan');return true;}
function back(){const previous=controller.state;controller.back();show('space');if(previous!=='space')window.dispatchEvent(new CustomEvent('sp:archive-close',{detail:{objectId:SUBJECT_ID}}));}
function replay(){if(!controller.replay())return false;started=performance.now();show('scan');return true;}
$('object-target').addEventListener('click',()=>open());
$('cancel-acquisition').addEventListener('click',back);
$('back-to-space').addEventListener('click',back);
$('replay-acquisition').addEventListener('click',replay);
$('source-notes').addEventListener('click',()=>$('source-dialog').showModal());
$('close-source').addEventListener('click',()=>$('source-dialog').close());
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('source-dialog').open&&controller.state!=='space')back();});
window.addEventListener('resize',()=>models[controller.state]?.resize());
window.addEventListener('sp:object-select',e=>open(e.detail?.objectId));
window.SecondPopulationArchive={open,close:back,replay,getState:()=>controller.state};
document.querySelector('.scan-crosses').innerHTML='<span></span>'.repeat(20);
// Shared pixel grid keeps the three expressions in one visual language.
function pixelFace(mood){const pixels=new Set(),put=(x,y)=>pixels.add(`${x},${y}`);for(let y=0;y<25;y++)for(let x=0;x<25;x++){const r=Math.hypot(x-12,y-12);if(r>=10&&r<11.2)put(x,y);}for(const x of [8,16])for(let y=7;y<12;y++)put(x,y);for(let x=6;x<=18;x++){let y=mood==='smile'?18-Math.round((x-12)**2/10):mood==='sad'?15+Math.round((x-12)**2/10):17;put(x,y);put(x,y+1);}return `<svg viewBox="0 0 25 25" aria-hidden="true">${[...pixels].map(p=>{const[x,y]=p.split(',');return `<rect x="${x}" y="${y}" width="1" height="1"/>`;}).join('')}</svg>`;}
const energy=document.querySelector('.energy-row dd');
energy.innerHTML='<span class="energy-label-status" data-field="energyClass">AWAITING LABEL</span><span class="energy-expression" role="img" aria-label="Smiling face: low energy use illustration">'+pixelFace('smile')+'</span>';
let acAnimation=0,acHiddenAt=0;
const acRequest=cb=>{acAnimation=window.requestAnimationFrame(time=>{if(!document.hidden)cb(time)});};
document.addEventListener('visibilitychange',()=>{if(document.hidden){acHiddenAt=performance.now();cancelAnimationFrame(acAnimation);}else{const now=performance.now();started+=now-acHiddenAt;lastFrame=now;acRequest(tick);}});
function tick(time){const delta=Math.min(60,time-lastFrame);lastFrame=time;if(running)operatingTime+=delta;const state=controller.state;if(state==='space'){const m=models.space;m.drawSolid(time);const b=m.bounds;if(b){const r=m.canvas.getBoundingClientRect(),s=$('space').getBoundingClientRect();Object.assign($('object-target').style,{left:`${r.left-s.left+b.x}px`,top:`${r.top-s.top+b.y}px`,width:`${b.w}px`,height:`${b.h}px`});}}else if(state==='scan'){const f=scanFrame(time-started,reduced?1200:SCAN_DURATION);$('scan-shell').style.setProperty('--frame-opacity',f.frameOpacity);for(const key of ['frameX','frameY','contentOpacity']){const name=key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase());$('scan-shell').style.setProperty('--'+name,f[key]);}$('progress-fill').style.width=f.progress+'%';$('progress-number').textContent=String(f.progress).padStart(2,'0')+'%';$('progressbar').setAttribute('aria-valuenow',f.progress);$('scan-status').textContent=f.label;models.scan.drawAcquisition(time,reduced?{...f,yaw:0}:f);if(f.done&&controller.ready()){show('dossier');window.dispatchEvent(new CustomEvent('sp:archive-open',{detail:{objectId:SUBJECT_ID}}));}}else{models.dossier.draw(operatingTime);drawThermal(operatingTime);}acRequest(tick);}
acRequest(tick);
