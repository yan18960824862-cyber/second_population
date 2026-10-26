(function(){
const NS='http://www.w3.org/2000/svg';
class DossierEntry{
 constructor(root,{reduced=false}={}){this.root=root;this.reduced=reduced;this.animations=[];this.borders=[];this.generation=0;}
 cancel(){this.generation++;for(const a of this.animations)a.cancel();this.animations=[];for(const svg of this.borders)svg.remove();this.borders=[];this.root.classList.remove('is-revealing');this.root.removeAttribute('aria-busy');}
 play(){this.cancel();if(this.reduced)return;const generation=this.generation;this.root.classList.add('is-revealing');this.root.setAttribute('aria-busy','true');
 const animate=(el,keyframes,delay,duration,easing='linear')=>{if(!el)return;const a=el.animate(keyframes,{delay,duration,easing,fill:'both'});this.animations.push(a);};
 const reveal=(selector,delay,duration=280,stagger=0)=>{this.root.querySelectorAll(selector).forEach((el,i)=>animate(el,[{opacity:0,clipPath:'inset(0 100% 0 0)'},{opacity:1,clipPath:'inset(0 0% 0 0)'}],delay+i*stagger,duration,'steps(14,end)'));};
 const border=(selector,delay,duration=340)=>{const box=this.root.querySelector(selector);if(!box)return;const svg=document.createElementNS(NS,'svg');svg.classList.add('entry-border');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');const rect=document.createElementNS(NS,'rect');rect.setAttribute('x','.5');rect.setAttribute('y','.5');rect.setAttribute('pathLength','1');rect.setAttribute('vector-effect','non-scaling-stroke');svg.append(rect);box.append(svg);this.borders.push(svg);animate(rect,[{strokeDashoffset:'1',opacity:0},{strokeDashoffset:'.94',opacity:1,offset:.08},{strokeDashoffset:'0',opacity:1}],delay,duration);};
 border('.dossier-header',0,350);
 border('.object-visual',150,420);border('.identity-box',230,400);
 border('.insets .anatomy:first-child',560,340);border('.insets .anatomy:last-child',650,340);
 border('.carbon-box',900,370);border('.resource-box',1340,370);
 reveal('.dossier-header>strong',90,280);reveal('.dossier-header>span',210,270,100);
 reveal('.object-visual .mini-heading',330,230);
 animate(this.root.querySelector('#oaSolidCanvas'),[{opacity:0,clipPath:'inset(0 0 100% 0)'},{opacity:.8,offset:.65},{opacity:1,clipPath:'inset(0 0 0% 0)'}],540,580,'steps(16,end)');
 reveal('.visual-caption',1090,230);
 reveal('.record-name h2',410,280);reveal('.record-name p',590,230);
 reveal('.identity-table>div',670,260,105);
 reveal('.identity-table>div>dd',800,280,105);
 reveal('.insets .mini-heading',740,220,100);
 this.root.querySelectorAll('.approved-detail').forEach((el,i)=>animate(el,[{opacity:0,clipPath:'inset(100% 0 0 0)'},{opacity:1,clipPath:'inset(0% 0 0 0)'}],900+i*100,400,'steps(12,end)'));
 reveal('.carbon-box>h3',1040,230);reveal('.carbon-body',1170,260);
 reveal('.carbon-value>span',1240,220);reveal('.carbon-value>strong',1380,280);reveal('.carbon-value>small',1540,180);reveal('.carbon-value>p',1600,300);
 reveal('.carbon-diagram>span',1270,250);reveal('.carbon-chain>div',1420,230,130);reveal('.carbon-chain>.arrow',1530,180,130);
 reveal('.resource-box>header',1470,300);
 reveal('.resource-inputs>div',1660,300,130);reveal('.resource-network>.network-arrow',1860,200,160);reveal('.resource-unit',1900,280);reveal('.resource-result',2100,250);
 reveal('.dossier-footer',2240,300);
 // A single faint line accompanies the data readout, then leaves the finished layout.
 const sweep=document.createElement('div');sweep.className='entry-sweep';sweep.setAttribute('aria-hidden','true');const column=this.root.querySelector('.info-column');if(column){column.append(sweep);this.borders.push(sweep);animate(sweep,[{top:'0%',opacity:0},{opacity:.45,offset:.08},{opacity:.4,offset:.9},{top:'100%',opacity:0}],570,1680);}
 const current=[...this.animations];Promise.allSettled(current.map(a=>a.finished)).then(()=>{if(this.generation!==generation)return;this.cancel();});
 }
}

window.ArchiveEntry=DossierEntry;
})();
