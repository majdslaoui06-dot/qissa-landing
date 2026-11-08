/* A spread is split at the spine; the moving sheet has a front and back face. */
(()=>{
const gallery=document.querySelector('.extract .spread-gallery');if(!gallery)return;
const spreads=[...gallery.querySelectorAll('figure')].map(figure=>({src:figure.querySelector('img').src,title:figure.querySelector('b')?.textContent||figure.querySelector('img').alt,caption:figure.querySelector('figcaption span')?.textContent||''}));
if(!spreads.length)return;
spreads.forEach(s=>{const img=new Image();img.src=s.src;});
const reader=document.createElement('div');reader.className='q-reader';
reader.innerHTML=`<div class="q-book-stage"><div class="q-book" tabindex="0" role="group" aria-label="Extrait du livre à feuilleter avec les flèches du clavier"><div class="q-book-cover"></div><div class="q-paper-stack"></div><div class="q-page q-page-left"></div><div class="q-page q-page-right"></div><div class="q-spine"></div><div class="q-sheet" hidden><div class="q-sheet-face q-sheet-front"></div><div class="q-sheet-face q-sheet-back"></div></div><button type="button" class="q-page-hit q-hit-left" aria-label="Double page précédente"></button><button type="button" class="q-page-hit q-hit-right" aria-label="Double page suivante"></button></div></div><div class="q-book-nav"><button type="button" class="q-book-prev" aria-label="Feuilleter vers la gauche">‹</button><span class="q-book-status" aria-live="polite"></span><button type="button" class="q-book-next" aria-label="Feuilleter vers la droite">›</button></div><div class="q-book-caption"><h3></h3><p></p></div>`;
gallery.replaceWith(reader);
const book=reader.querySelector('.q-book'),left=reader.querySelector('.q-page-left'),right=reader.querySelector('.q-page-right'),sheet=reader.querySelector('.q-sheet'),front=reader.querySelector('.q-sheet-front'),back=reader.querySelector('.q-sheet-back'),prev=reader.querySelector('.q-book-prev'),next=reader.querySelector('.q-book-next'),hitLeft=reader.querySelector('.q-hit-left'),hitRight=reader.querySelector('.q-hit-right');
let index=0,busy=false,direction=1,progress=0,gesture=null,suppressClick=false;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
function paint(el,i,half){el.style.backgroundImage=`url("${spreads[i].src}")`;el.style.backgroundPosition=half==='left'?'left center':'right center';}
function render(){paint(left,index,'left');paint(right,index,'right');sheet.hidden=true;book.classList.remove('is-turning');prev.disabled=hitLeft.disabled=index===0;next.disabled=hitRight.disabled=index===spreads.length-1;reader.querySelector('.q-book-status').textContent=`Extrait ${index+1} / ${spreads.length}`;reader.querySelector('.q-book-caption h3').textContent=spreads[index].title;reader.querySelector('.q-book-caption p').textContent=spreads[index].caption;book.setAttribute('aria-label',`${spreads[index].title}. Extrait ${index+1} sur ${spreads.length}. Utilisez les flèches gauche et droite pour feuilleter.`);}
function begin(dir){if(busy||index+dir<0||index+dir>=spreads.length)return false;busy=true;direction=dir;progress=0;book.classList.add('is-turning');sheet.classList.toggle('is-backward',dir<0);paint(front,index,dir>0?'right':'left');paint(back,index+dir,dir>0?'left':'right');paint(dir>0?right:left,index+dir,dir>0?'right':'left');sheet.hidden=false;position(0);return true;}
function position(p){progress=Math.max(0,Math.min(1,p));sheet.style.transform=`rotateY(${-direction*180*progress}deg)`;}
async function finish(commit){const end=commit?1:0,duration=reduced.matches?0:Math.max(180,650*Math.abs(end-progress));const animation=sheet.animate([{transform:`rotateY(${-direction*180*progress}deg)`},{transform:`rotateY(${-direction*180*end}deg)`}],{duration,easing:'cubic-bezier(.22,.7,.18,1)',fill:'forwards'});try{await animation.finished;}catch{}if(commit)index+=direction;render();animation.cancel();busy=false;}
function turn(dir){if(begin(dir))finish(true);}
prev.onclick=()=>turn(-1);next.onclick=()=>turn(1);
hitLeft.onclick=()=>{if(!suppressClick)turn(-1);};hitRight.onclick=()=>{if(!suppressClick)turn(1);};
book.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();turn(e.key==='ArrowRight'?1:-1);}});
book.addEventListener('pointerdown',e=>{if(busy||!e.isPrimary||e.button!==0)return;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now(),started:false};});
book.addEventListener('pointermove',e=>{if(!gesture||gesture.id!==e.pointerId)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(!gesture.started){if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}if(Math.abs(dx)<10)return;if(!begin(dx<0?1:-1)){gesture=null;return;}gesture.started=true;book.setPointerCapture(e.pointerId);}position(-direction*dx/(book.clientWidth*.8));});
function release(e,cancel){if(!gesture||e.pointerId!==gesture.id)return;const g=gesture;gesture=null;if(!g.started)return;suppressClick=true;setTimeout(()=>suppressClick=false,100);const dx=e.clientX-g.x,velocity=Math.abs(dx)/Math.max(1,performance.now()-g.time);finish(!cancel&&(progress>.2||(progress>.04&&velocity>.45)));}
book.addEventListener('pointerup',e=>release(e,false));book.addEventListener('pointercancel',e=>release(e,true));
render();
})();
