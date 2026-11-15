(()=>{
  const images=[
    ['yanis-race-cover.jpg','Couverture illustrée du livre de Yanis'],
    ['yanis-livre-reel-couverture.jpg','Le vrai livre de Yanis photographié'],
    ['yanis-livre-reel-ouvert.jpg','Le vrai livre de Yanis ouvert'],
    ['yanis-livre-reel-detail.jpg','Détail d’une page du vrai livre'],
    ['yanis-race-page8.jpg','Yanis rencontre Coach Ali'],
    ['yanis-race-page15.jpg','Yanis court avec les autres enfants'],
    ['yanis-race-page23.jpg','Yanis et ses amis poursuivent leur aventure'],
    ['coffret-premium-composition.jpg','Le coffret premium Qissa sous plusieurs angles'],
    ['coffret-premium-04-ouvert-trois-quarts.jpg','Le coffret premium Qissa ouvert']
  ];
  let current=0;
  const main=document.querySelector('#main-image');
  const dots=document.querySelector('.gallery-dots');
  function show(index){
    current=(index+images.length)%images.length;
    main.src='../assets/'+images[current][0];
    main.alt=images[current][1];
    [...dots.children].forEach((dot,i)=>dot.setAttribute('aria-current',String(i===current)));
  }
  images.forEach((image,i)=>{
    const dot=document.createElement('button');
    dot.type='button';
    dot.setAttribute('aria-label','Afficher '+image[1]);
    dot.onclick=()=>show(i);
    dots.append(dot);
  });
  document.querySelector('.prev').onclick=()=>show(current-1);
  document.querySelector('.next').onclick=()=>show(current+1);
  let touchX=0;
  main.addEventListener('touchstart',event=>touchX=event.changedTouches[0].clientX,{passive:true});
  main.addEventListener('touchend',event=>{
    const distance=event.changedTouches[0].clientX-touchX;
    if(Math.abs(distance)>35)show(current+(distance<0?1:-1));
  },{passive:true});
  show(0);
  const form=document.querySelector('#preview-form');
  const age=form.elements.age;
  const giver=form.elements.offertPar;
  function toggle(select,selector){
    const field=form.querySelector(selector);
    const on=select.value==='autre'||select.value==='Autre';
    field.hidden=!on;
    field.querySelector('input').required=on;
  }
  age.onchange=()=>toggle(age,'.age-other');
  giver.onchange=()=>toggle(giver,'.giver-other');
  form.addEventListener('change',()=>{
    const price=Number(form.elements.offre.value);
    document.querySelector('#chosen-price').textContent=price+' DH';
    document.querySelector('#total-price').textContent=(price+35)+' DH';
    document.querySelector('#button-price').textContent=(price+35)+' DH';
  });
  const message=document.querySelector('#preview-message');
  function phone(raw){
    let digits=raw.replace(/\D/g,'');
    if(digits.startsWith('00212'))digits=digits.slice(5);
    else if(digits.startsWith('212'))digits=digits.slice(3);
    if(digits.startsWith('0'))digits=digits.slice(1);
    return '+212'+digits;
  }
  function jpeg(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),img=new Image();
      img.onload=()=>{
        const ratio=Math.min(1,1536/Math.max(img.width,img.height));
        const canvas=document.createElement('canvas');
        canvas.width=Math.round(img.width*ratio);
        canvas.height=Math.round(img.height*ratio);
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Photo illisible.')),'image/jpeg',.9);
      };
      img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Photo illisible.'));};
      img.src=url;
    });
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    if(!form.hasAttribute('data-live-orders')){
      message.textContent='Aperçu validé dans le simulateur. La commande ne sera activée qu’après votre accord et la mise en ligne.';
      message.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    const first=form.elements.enfant.value.trim(),telephone=phone(form.elements.telephone.value);
    const photos=[...form.elements['photo-enfant'].files];
    function fail(text,field){message.className='preview-note error';message.textContent=text;(field||message).scrollIntoView({behavior:'smooth',block:'center'});field?.focus();}
    if(first.length<2){fail('Indiquez le prénom de votre enfant (au moins 2 lettres).',form.elements.enfant);return;}
    if(!/^\+212[5-7]\d{8}$/.test(telephone)){fail('Vérifiez le numéro WhatsApp, par exemple 0612345678.',form.elements.telephone);return;}
    if(photos.length>3){fail('Ajoutez trois photos au maximum.');return;}
    if(photos.some(file=>!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>15*1024*1024)){fail('Utilisez des photos JPG, PNG ou WebP de moins de 15 Mo.');return;}
    const offer=form.elements.offre.value==='242'?'coffret':'livre';
    const ageText=age.value==='autre'?form.elements.ageAutre.value.trim():age.value;
    const order={
      histoire:'blue-coaching-race',histoire_nom:'Blue Coaching Race Kids',version:'participants',
      enfant:first,age:age.value==='autre'?null:parseInt(age.value,10),age_texte:ageText,
      genre:form.elements.genre.value||'',de_la_part_de:giver.value==='Autre'?form.elements.offertParAutre.value.trim():giver.value,
      message:form.elements.dedicace.value.trim(),offre,
      client:{nom:form.elements.client.value.trim(),telephone,ville:form.elements.ville.value.trim(),adresse:''},
      consentement_parent:false
    };
    const button=form.querySelector('.submit');button.disabled=true;button.textContent='Enregistrement de la commande…';
    message.className='preview-note';message.textContent='Envoi de votre commande en cours…';
    try{
      const data=new FormData();data.append('order',JSON.stringify(order));
      for(const [index,file] of photos.entries())data.append('photos',await jpeg(file),'enfant-'+(index+1)+'.jpg');
      const response=await fetch('/api/orders',{method:'POST',body:data});
      if(!response.ok){const detail=await response.json().catch(()=>null);throw new Error(typeof detail?.detail==='string'?detail.detail:'La commande n’a pas pu être enregistrée. Réessayez.');}
      const saved=await response.json();
      if(!saved.ok||!saved.ref)throw new Error('Réponse de commande incomplète.');
      message.className='preview-note success';
      message.replaceChildren(document.createTextNode('Commande enregistrée · '+saved.ref+'. Vos photos ont été transmises à l’Atelier. '));
      const link=document.createElement('a');link.href=saved.whatsapp_url;link.textContent='Ouvrir WhatsApp et envoyer le message à Qissa';link.style.textDecoration='underline';message.append(link);
      button.textContent='Commande enregistrée';
      message.scrollIntoView({behavior:'smooth',block:'center'});
      if(saved.whatsapp_url)setTimeout(()=>location.assign(saved.whatsapp_url),900);
    }catch(error){fail(error.message||'Une erreur est survenue.');button.disabled=false;button.textContent='Commander ce livre · '+(Number(form.elements.offre.value)+35)+' DH';}
  };
})();
