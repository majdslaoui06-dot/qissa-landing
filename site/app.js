// Meta Pixel — Qissa Magic
(function initQissaMetaPixel() {
  if (window.location.pathname.includes('qissa-admin-')) {
    return;
  }

  if (window.fbq) {
    return;
  }

  !function(f,b,e,v,n,t,s)
  {
    if(f.fbq)return;
    n=f.fbq=function(){
      n.callMethod ?
        n.callMethod.apply(n,arguments) :
        n.queue.push(arguments)
    };
    if(!f._fbq)f._fbq=n;
    n.push=n;
    n.loaded=!0;
    n.version='2.0';
    n.queue=[];
    t=b.createElement(e);
    t.async=!0;
    t.src=v;
    s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s);
  }(
    window,
    document,
    'script',
    'https://connect.facebook.net/en_US/fbevents.js'
  );

  fbq('init', '1572444224102626');
  fbq('track', 'PageView');
})();
ViewContent
InitiateCheckout
Purchase
/* Qissa · scripts du site (pages publiques + tunnel de commande) */
(function () {
  "use strict";
  var CFG = window.QISSA_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var money = function (n) { return n + " " + (CFG.devise || "DH"); };
  var waNum = function () { return String(CFG.whatsapp || "").replace(/\D/g, ""); };
  var waUrl = function (msg) { return "https://wa.me/" + waNum() + (msg ? "?text=" + encodeURIComponent(msg) : ""); };
  var prettyWa = function () { var n = waNum(); return n.length === 12 && n.indexOf("212") === 0 ? "+212 " + n[3] + " " + n.slice(4).replace(/(\d\d)(?=\d)/g, "$1 ").trim() : "+" + n; };

  /* ---------- éléments communs ---------- */
  function common() {
    $$("[data-wa]").forEach(function (a) { a.href = waUrl(""); a.target = "_blank"; a.rel = "noopener"; });
    $$("[data-wa-msg]").forEach(function (a) { a.href = waUrl(a.getAttribute("data-wa-msg")); a.target = "_blank"; a.rel = "noopener"; });
    $$("[data-wa-num]").forEach(function (e) { e.textContent = prettyWa(); });
    $$("[data-livraison]").forEach(function (e) { e.textContent = CFG.livraison; });
    (CFG.offres || []).forEach(function (o) {
      $$('[data-price="' + o.id + '"]').forEach(function (e) { e.innerHTML = o.prix + "<small>" + (CFG.devise || "DH") + "</small>"; });
    });
    $$("[data-insta]").forEach(function (a) { a.href = "https://instagram.com/" + CFG.instagram; a.textContent = "@" + CFG.instagram; a.target = "_blank"; a.rel = "noopener"; });
    $$("[data-mail]").forEach(function (a) { a.href = "mailto:" + CFG.email; a.textContent = CFG.email; });
    $$("[data-atelier]").forEach(function (a) { if (CFG.lienAtelier) a.hidden = false; });

    if (!$(".qissa-float-actions")) {
      var actions = document.createElement("div");
      actions.className = "qissa-float-actions";
      var onStory = /\/histoires\/[^/]+\.html$/.test(location.pathname);
      var onHome = /\/(?:index\.html)?$/.test(location.pathname) || location.pathname === "/";
      var ctaHref = onStory ? "#personnaliser" : (onHome ? "#histoires" : "index.html#histoires");
      actions.innerHTML = '<a class="qissa-float-cta" href="' + ctaHref + '">Personnaliser le livre de mon enfant</a>' +
        '<a class="qissa-float-wa" href="' + waUrl("Bonjour Qissa, j’aimerais personnaliser un livre pour mon enfant.") + '" target="_blank" rel="noopener" aria-label="Contacter Qissa sur WhatsApp">' +
        '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16.04 3C9.01 3 3.3 8.7 3.3 15.72c0 2.25.59 4.46 1.71 6.4L3.2 28.75l6.79-1.78a12.7 12.7 0 0 0 6.04 1.54h.01c7.02 0 12.73-5.7 12.73-12.72C28.77 8.7 23.06 3 16.04 3Zm0 23.36h-.01c-1.85 0-3.67-.5-5.25-1.44l-.38-.23-4.03 1.06 1.08-3.93-.25-.4a10.54 10.54 0 0 1-1.62-5.7c0-5.8 4.73-10.52 10.55-10.52 5.82 0 10.55 4.72 10.55 10.52 0 5.8-4.73 10.64-10.64 10.64Zm5.79-7.9c-.32-.16-1.87-.92-2.16-1.03-.29-.1-.5-.16-.71.16-.21.32-.82 1.03-1 1.24-.18.21-.37.24-.69.08-.32-.16-1.34-.49-2.55-1.57-.94-.84-1.58-1.88-1.77-2.2-.18-.32-.02-.49.14-.65.14-.14.32-.37.47-.55.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.55-.08-.16-.71-1.71-.97-2.34-.26-.62-.52-.54-.71-.55h-.61c-.21 0-.55.08-.84.4-.29.32-1.11 1.08-1.11 2.64 0 1.55 1.13 3.05 1.29 3.26.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.8.66.76.24 1.45.21 2 .13.61-.09 1.87-.76 2.14-1.5.26-.74.26-1.37.18-1.5-.08-.13-.29-.21-.61-.37Z"/></svg></a>';
      document.body.appendChild(actions);
    }
  }

  /* ---------- catalogue ---------- */
  function catalogue() {
    var btns = $$(".filters [data-f]");
    if (!btns.length) return;
    var cards = $$("#grid .card");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var f = b.getAttribute("data-f");
        btns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        cards.forEach(function (c) {
          var aud = (c.getAttribute("data-aud") || "").split(" ");
          c.hidden = !(f === "toutes" || aud.indexOf(f) > -1 || aud.indexOf("toutes") > -1 && f === "toutes");
          var alt = c.getAttribute("data-alt-cover");
          if (alt) { // carte Super : bascule sur la version fille pour "Pour elle"
            var img = $("img", c), h3 = $("h3", c);
            if (!c.dataset.o) { c.dataset.o = img.getAttribute("src"); c.dataset.n = h3.textContent; }
            img.src = f === "elle" ? alt : c.dataset.o;
            h3.textContent = f === "elle" ? c.getAttribute("data-alt-name") : c.dataset.n;
          }
        });
      });
    });
  }

  /* ---------- page histoire : version Super ---------- */
  function storyPage() {
    var img = $("#cover[data-a]"), sel = $("#m-v");
    if (img && sel) sel.addEventListener("change", function () { img.src = sel.value === "fille" ? img.getAttribute("data-b") : img.getAttribute("data-a"); });
  }

  /* ---------- tunnel de commande ---------- */
  var app = $("#app");
  if (!app || !window.QISSA_STORIES) { common(); catalogue(); storyPage(); return; }
  common();

  var STORIES = window.QISSA_STORIES, q = new URLSearchParams(location.search);
  var story = STORIES.filter(function (s) { return s.slug === q.get("h"); })[0];
  if (!story) { location.replace("index.html#histoires"); return; }
  var isParc = story.slug === "parc", isBebe = false, hasGender = (story.extras || []).indexOf("gender") > -1 || story.slug === "parc" || story.slug === "premiereannee";
  var MILES = [["naissance", "Naissance"], ["4mois", "4 mois"], ["8mois", "8 mois"], ["1an", "1 an"]];
  var VILLES = ["Casablanca", "Rabat", "Marrakech", "Tanger", "Fès", "Agadir", "Meknès", "Oujda", "Kénitra", "Tétouan", "Salé", "Témara", "Mohammédia", "El Jadida", "Nador", "Béni Mellal", "Settat", "Khouribga", "Safi", "Essaouira", "Laâyoune", "Dakhla", "Errachidia", "Ouarzazate", "Taza", "Berkane", "Larache", "Al Hoceïma", "Khémisset", "Autre ville"];
  var cleanName = function (v) {
    v = String(v || "").replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' \-]/g, "").replace(/\s+/g, " ").trim().slice(0, CFG.nomMax || 16);
    return v.replace(/(^|[ \-'])([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); });
  };
  var S = {
    step: 1, done: false, ref: "",
    nom: cleanName(q.get("nom")),
    age: parseInt(q.get("age"), 10) || story.age_min || 3,
    naissance: q.get("naissance") || "",
    genre: q.get("genre") === "fille" ? "fille" : (story.genre === "elle" ? "fille" : "garcon"),
    v: q.get("v") === "fille" ? "fille" : "garcon",
    avec: q.get("avec") === "Papa" ? "Papa" : "Maman",
    child: [], parent: [], miles: {}, consent: false,
    giver: "Maman et Papa", autre: "", msg: "", offre: CFG.offreParDefaut || "coffret",
    cli: { nom: "", tel: "", ville: "Casablanca", adr: "" },
    err: "", sending: false, serveur: false
  };
  if (story.slug === "capitaine") S.genre = "garcon";

  /* serveur (facultatif) : reçoit les photos avec la commande */
  var apiBase = CFG.serveur === "auto" ? "" : (CFG.serveur || null);
  if (apiBase !== null && location.protocol !== "file:") {
    fetch(apiBase + "/api/config", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.orders) { S.serveur = true; } }).catch(function () {});
  }

  var offer = function () { return (CFG.offres || []).filter(function (o) { return o.id === S.offre; })[0]; };
  var total = function () { return offer().prix + (CFG.livraison || 0); };
  var coverSrc = function () { return "assets/cover-" + story.cover + ".webp"; };
  var title = function () { return story.titre_couv.replace("{{NOM}}", S.nom || story.nom_exemple); };
  var altTxt = function () { return "Livre personnalisé Qissa " + story.nom + ", idée cadeau pour enfant au Maroc, Qissa Magic"; };
  var nbPhotos = function () { return S.child.length + S.parent.length + Object.keys(S.miles).length; };

  /* ---------- photos ---------- */
  function preparePhoto(file) {
    return new Promise(function (ok, ko) {
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return ko(new Error("Ce fichier n'est pas une photo."));
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, h = im.naturalHeight;
        if (Math.min(w, h) < 360) { URL.revokeObjectURL(url); return ko(new Error("Cette photo est trop petite. Choisissez une photo plus grande.")); }
        var k = Math.min(1, 1536 / Math.max(w, h)), c = document.createElement("canvas");
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? ok({ blob: b, url: URL.createObjectURL(b) }) : ko(new Error("Photo illisible.")); }, "image/jpeg", 0.9);
      };
      im.onerror = function () { URL.revokeObjectURL(url); ko(new Error("Photo illisible. Essayez une photo au format JPG ou PNG.")); };
      im.src = url;
    });
  }
  function pickFiles(multiple, cb) {
    var i = document.createElement("input");
    i.type = "file"; i.accept = "image/*"; i.multiple = !!multiple;
    i.onchange = function () { cb(Array.prototype.slice.call(i.files)); };
    i.click();
  }
  function addTo(list, max, files) {
    var room = max - list.length, jobs = files.slice(0, room).map(preparePhoto);
    if (files.length > room) S.err = "Vous pouvez ajouter " + max + " photos au maximum.";
    Promise.all(jobs.map(function (p) { return p.then(function (r) { list.push(r); }, function (e) { S.err = e.message; }); })).then(render);
  }

  /* ---------- rendu ---------- */
  var ICON_CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="3"></rect><path d="M8.5 7l1.5-3h4l1.5 3"></path><path d="M12 11v5M9.5 13.5h5"></path></svg>';
  var ICON_WA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4a8.5 8.5 0 1 1 15.6-4.6z"></path></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';

  function seg(name, opts, val, two) {
    return '<div class="seg' + (two ? " two" : "") + '" role="group" aria-label="' + esc(name) + '">' + opts.map(function (o) {
      return '<button type="button" data-seg="' + esc(name) + '" data-val="' + esc(o[0]) + '" aria-pressed="' + (o[0] === val ? "true" : "false") + '">' + esc(o[1]) + "</button>";
    }).join("") + "</div>";
  }
  function thumbs(list, max, key, label) {
    var h = '<div class="thumbs">' + list.map(function (p, i) {
      return '<div class="t"><img src="' + p.url + '" alt="Photo ajoutée pour le livre personnalisé Qissa"><button type="button" data-rm="' + key + ':' + i + '" aria-label="Retirer cette photo">×</button></div>';
    }).join("");
    if (list.length < max) h += '<button type="button" class="add" data-add="' + key + '">' + ICON_CAM + (label || "Ajouter") + "</button>";
    return h + "</div>";
  }
  function progress(n, label) {
    return '<div class="prog"><p>Étape ' + n + " sur 3 · " + label + '</p><div>' + [1, 2, 3].map(function (i) { return '<span class="' + (i <= n ? "on" : "") + '"></span>'; }).join("") + "</div></div>";
  }
  function summary(showEdit) {
    var o = offer();
    var sub = isBebe ? (S.naissance ? "Né(e) le " + fmtDate(S.naissance) : "") : S.age + " ans";
    return '<div class="sum"><img src="' + coverSrc() + '" alt="' + esc(altTxt()) + '"><span class="n"><b>' + esc(title()) + "</b><span>" + esc(sub) + (sub ? " · " : "") + esc(o.nom.toLowerCase().replace(/^le /, "Le ")) + "<br>" + nbPhotos() + " photo" + (nbPhotos() > 1 ? "s" : "") + (S.step === 3 ? " · Dédicace de " + esc(giver()) : "") + "</span>" + (showEdit ? '<button class="link" type="button" data-go="1" style="align-self:flex-start">Modifier</button>' : "") + '</span><span class="p">' + money(o.prix) + "</span></div>";
  }
  function fmtDate(d) { var m = String(d).match(/^(\d{4})-(\d\d)-(\d\d)$/); return m ? m[3] + "/" + m[2] + "/" + m[1] : d; }
  function giver() { return S.giver === "Autre" ? (S.autre || "un proche") : S.giver; }

  function step1() {
    var h = progress(1, "Votre enfant");
    h += "<h1>" + (isParc ? "Qui entre dans le Parc Enchanté ?" : isBebe ? "Son année, en photos" : "Pour qui est ce livre ?") + '</h1><form novalidate data-form="1">';
    h += '<div class="row2"><div class="field"><label for="f-nom">' + (isBebe ? "Son nom" : "Son nom") + '</label><input id="f-nom" data-k="nom" type="text" maxlength="' + (CFG.nomMax || 16) + '" value="' + esc(S.nom) + '" autocomplete="off"></div>';
    if (isBebe) h += '<div class="field"><label for="f-nais">Sa date de naissance</label><input id="f-nais" data-k="naissance" type="date" value="' + esc(S.naissance) + '" max="' + new Date().toISOString().slice(0, 10) + '"></div></div>';
    else {
      var opts = ""; for (var a = story.age_min || CFG.ageMin || 3; a <= (story.age_max || CFG.ageMax || 12); a++) opts += '<option value="' + a + '"' + (a === S.age ? " selected" : "") + ">" + a + " ans</option>";
      h += '<div class="field"><label for="f-age">Son âge</label><select id="f-age" data-k="age">' + opts + "</select></div></div>";
    }
    if (hasGender) {
      h += '<fieldset class="box"><legend class="l">' + (isParc ? "Pour qui, avec qui ?" : "C’est…") + '</legend><span class="own">Propre à cette histoire</span>';
      h += '<p style="font-weight:800;font-size:14px">C’est…</p>' + seg("genre", [["garcon", "Un petit garçon"], ["fille", "Une petite fille"]], S.genre, true);
      if (isParc) h += '<p style="font-weight:800;font-size:14px;margin-top:6px">Qui l’accompagne dans le parc ?</p>' + seg("avec", [["Maman", "Maman"], ["Papa", "Papa"]], S.avec, true);
      h += "</fieldset>";
    }
    if (isBebe) {
      h += '<fieldset class="field"><legend class="l">Une photo pour chaque étape</legend><small>Au moins une photo. Vous pouvez envoyer les autres sur WhatsApp après la commande.</small><div class="thumbs" style="grid-template-columns:repeat(2,minmax(0,1fr))">';
      MILES.forEach(function (m) {
        var p = S.miles[m[0]];
        h += p ? '<div class="t"><img src="' + p.url + '" alt="Photo ' + m[1] + ' pour le livre personnalisé Qissa"><em>' + m[1] + '</em><button type="button" data-rm="m:' + m[0] + '" aria-label="Retirer cette photo">×</button></div>' : '<button type="button" class="add" data-add="m:' + m[0] + '">' + ICON_CAM + m[1] + "</button>";
      });
      h += "</div></fieldset>";
    } else {
      h += '<fieldset class="field"><legend class="l">' + (isParc ? "Ses photos" : "Ses photos (1 à " + (CFG.maxPhotos || 3) + ")") + "</legend><small>Des photos de face, bien éclairées.</small>" + thumbs(S.child, CFG.maxPhotos || 3, "child") + "</fieldset>";
    }
    if (isParc) h += '<fieldset class="box"><legend class="l">Les photos de ' + esc(S.avec) + '</legend><span class="own">Propre à cette histoire</span><p style="font-size:14px;color:var(--muted)">1 ou 2 photos de face, pour ' + (S.avec === "Maman" ? "qu’elle" : "qu’il") + ' se reconnaisse aussi.</p>' + thumbs(S.parent, 2, "parent") + "</fieldset>";
    h += '<label class="consent"><input type="checkbox" data-k="consent"' + (S.consent ? " checked" : "") + "><span>Je suis son parent ou son tuteur légal et j’accepte que ces photos servent à illustrer ce livre.</span></label>";
    h += '<p class="err" role="alert">' + esc(S.err) + '</p><button class="btn big" type="submit">Continuer ' + ICON_ARROW + "</button></form>";
    return h;
  }

  function step2() {
    var h = progress(2, "Dédicace et offre") + '<form novalidate data-form="2" style="margin-top:18px">' + summary(true);
    h += '<fieldset class="field" style="border:0;padding:0;margin:0;gap:12px"><legend style="font-family:Fredoka,sans-serif;font-size:22px;font-weight:600;margin-bottom:10px">Votre dédicace</legend><p style="font-weight:800">Qui offre le livre ?</p>';
    h += '<div class="seg" role="group" aria-label="Qui offre le livre">' + (CFG.relations || []).map(function (r) { return '<button type="button" data-seg="giver" data-val="' + esc(r) + '" aria-pressed="' + (r === S.giver ? "true" : "false") + '">' + esc(r === "Autre" ? "Autre…" : r) + "</button>"; }).join("") + "</div>";
    if (S.giver === "Autre") h += '<div class="field"><label for="f-autre">De la part de</label><input id="f-autre" data-k="autre" type="text" maxlength="30" value="' + esc(S.autre) + '" placeholder="Mamie, Tonton…"></div>';
    h += '<div class="field"><label for="f-msg">Votre message <span style="font-weight:600;color:var(--muted)">(facultatif)</span></label><textarea id="f-msg" data-k="msg" rows="3" maxlength="' + (CFG.dedicaceMax || 180) + '">' + esc(S.msg) + '</textarea><span id="cnt" style="align-self:flex-end;font-size:13px;font-weight:700;color:var(--muted)">' + S.msg.length + " / " + (CFG.dedicaceMax || 180) + "</span></div></fieldset>";
    h += '<fieldset class="field" style="border:0;padding:0;margin:0;gap:10px"><legend style="font-family:Fredoka,sans-serif;font-size:22px;font-weight:600;margin-bottom:10px">Votre offre</legend>';
    h += (CFG.offres || []).map(function (o) { return '<label class="opt"><input type="radio" name="offre" data-k="offre" value="' + o.id + '"' + (o.id === S.offre ? " checked" : "") + '><span class="n"><b>' + esc(o.nom) + "</b><span>" + esc(o.detail) + '</span></span><span class="p">' + money(o.prix) + "</span></label>"; }).join("") + "</fieldset>";
    h += '<p class="info">' + ICON_WA + "Le jour même de votre commande, vous recevez l’aperçu de son livre sur WhatsApp.</p>";
    h += '<button class="btn big" type="submit"><span id="cont">Continuer · ' + money(offer().prix) + "</span> " + ICON_ARROW + '</button><p style="text-align:center;font-size:13px;font-weight:600;color:var(--muted)">Frais de livraison (' + money(CFG.livraison) + ") à l’étape suivante.</p></form>";
    return h;
  }

  function step3() {
    var o = offer(), c = S.cli;
    var h = progress(3, "Commande") + "<h1>Votre commande</h1>" + '<form novalidate data-form="3">' + summary(true);
    h += '<fieldset class="field" style="border:0;padding:0;margin:0;gap:14px"><legend style="font-family:Fredoka,sans-serif;font-size:22px;font-weight:600;margin-bottom:10px">Livraison</legend>';
    h += '<div class="field"><label for="c-nom">Votre nom</label><input id="c-nom" data-c="nom" type="text" placeholder="Nom et prénom" value="' + esc(c.nom) + '" autocomplete="name"></div>';
    h += '<div class="field"><label for="c-tel">Téléphone (WhatsApp)</label><div style="display:flex;height:52px;border-radius:14px;border:1.5px solid var(--field);background:#fff;overflow:hidden"><span style="display:flex;align-items:center;padding:0 12px;background:#F1E9D6;font-weight:800">+212</span><input id="c-tel" data-c="tel" type="tel" inputmode="tel" placeholder="6 12 34 56 78" value="' + esc(c.tel) + '" autocomplete="tel-national" style="border:0;border-radius:0;height:auto;flex-grow:1;min-width:0"></div></div>';
    h += '<div class="field"><label for="c-ville">Ville</label><select id="c-ville" data-c="ville">' + VILLES.map(function (v) { return "<option" + (v === c.ville ? " selected" : "") + ">" + v + "</option>"; }).join("") + "</select></div>";
    h += '<div class="field"><label for="c-adr">Adresse de livraison</label><textarea id="c-adr" data-c="adr" rows="2" placeholder="Rue, numéro, quartier, un repère">' + esc(c.adr) + "</textarea></div></fieldset>";
    h += '<div class="total"><p><span>' + esc(o.nom) + "</span><span>" + money(o.prix) + "</span></p><p><span>Livraison</span><span>" + money(CFG.livraison) + '</span></p><p class="t"><span>À payer à la livraison</span><b>' + money(total()) + "</b></p></div>";
    h += '<p class="notice">' + ICON_WA + "Le jour même, vous recevez l’aperçu de son livre sur ce numéro WhatsApp.</p>";
    h += '<p class="err" role="alert">' + esc(S.err) + '</p><div style="display:flex;flex-direction:column;gap:10px"><button class="btn wa big" type="submit">' + ICON_WA + 'Envoyer ma commande sur WhatsApp</button><p style="text-align:center;font-size:13px;font-weight:600;color:var(--muted)">WhatsApp s’ouvre avec votre commande déjà écrite. Il vous suffit d’appuyer sur Envoyer.</p></div></form>';
    return h;
  }

  function stepDone() {
    var msg = buildMessage(), url = waUrl(msg);
    var h = '<div class="done"><span class="hand" style="font-size:26px">Merci !</span><h1 style="margin:0">Votre commande est prête à partir</h1>';
    h += '<p style="color:var(--muted)">Appuyez sur Envoyer dans WhatsApp pour nous la transmettre. Votre référence :</p><p class="ref">' + esc(S.ref) + "</p>";
    h += '<a class="btn wa big" id="wa" href="' + url + '" target="_blank" rel="noopener">' + ICON_WA + "Ouvrir WhatsApp</a>";
    h += '<p id="upl" style="font-size:14px;font-weight:700;color:var(--muted)">' + (S.uploaded === true ? "Vos photos sont bien arrivées." : S.uploaded === false ? "Vos photos n’ont pas pu être envoyées : envoyez-les nous sur WhatsApp avec votre commande." : nbPhotos() && S.serveur ? "Envoi de vos photos…" : "") + "</p>";
    h += '<ol><li>Vous nous envoyez la commande sur WhatsApp.</li><li>Le jour même, vous recevez l’aperçu de son livre sur votre numéro.</li><li>Après votre accord, le livre est imprimé, puis livré chez vous.</li><li>Vous payez ' + money(total()) + " à la livraison.</li></ol>";
    if (!S.serveur && nbPhotos()) h += '<p class="info" style="text-align:left">' + ICON_WA + "N’oubliez pas de joindre vos photos dans la conversation WhatsApp, avec la référence " + esc(S.ref) + ".</p>";
    h += '<details style="width:100%;text-align:left"><summary style="cursor:pointer;font-weight:800">Le message n’a pas pu s’ouvrir ?</summary><div class="msg" id="msgtxt">' + esc(msg) + '</div><button class="btn ghost" type="button" data-copy style="margin-top:10px;height:44px">Copier le message</button></details>';
    h += '<a href="index.html" style="font-weight:800">Retour aux histoires</a></div>';
    return h;
  }

  function buildMessage() {
    var o = offer(), c = S.cli, L = [];
    L.push("Bonjour Qissa Magic, je souhaite commander un livre personnalisé.");
    L.push("Réf : " + S.ref);
    L.push("Histoire : " + story.nom);
    L.push("Enfant : " + S.nom);
    if (isBebe) L.push("Naissance : " + (fmtDate(S.naissance) || "non précisée")); else L.push("Âge : " + S.age + " ans");
    if (hasGender) L.push("Genre : " + (S.genre === "fille" ? "fille" : "garçon"));
    if (isParc) L.push("Avec : " + S.avec);
    L.push("De la part de : " + giver());
    if (S.msg) L.push("Message : " + S.msg.replace(/\s*\n\s*/g, " "));
    L.push("Offre : " + o.nom + " (" + o.prix + " DH)");
    L.push("Livraison : " + CFG.livraison + " DH");
    L.push("Total à payer à la livraison : " + total() + " DH");
    L.push("Photos : " + (nbPhotos() ? nbPhotos() + (S.serveur ? " (envoyées avec la commande)" : " (je les envoie ici)") : "je les envoie ici"));
    L.push("Nom : " + c.nom);
    L.push("Téléphone : +212 " + phoneDigits(c.tel).slice(1));
    L.push("Ville : " + c.ville);
    L.push("Adresse : " + c.adr.replace(/\s*\n\s*/g, ", "));
    return L.join("\n");
  }
  var phoneDigits = function (v) { var d = String(v || "").replace(/\D/g, ""); if (d.indexOf("00212") === 0) d = d.slice(5); else if (d.indexOf("212") === 0) d = d.slice(3); return d.charAt(0) === "0" ? d : "0" + d; };
  var phoneValid = function (v) { return /^0[5-7]\d{8}$/.test(phoneDigits(v)); };
  var newRef = function () {
    var a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", s = "", r = new Uint8Array(4);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(r) : r.forEach(function (_, i) { r[i] = Math.random() * 255; });
    for (var i = 0; i < 4; i++) s += a[r[i] % a.length];
    return (CFG.prefixeCommande || "QM") + "-" + new Date().getFullYear() + "-" + s;
  };

  /* ---------- validation ---------- */
  function check1() {
    if (S.nom.length < 2) return "Indiquez son nom.";
    if (isBebe) { if (!S.naissance) return "Indiquez sa date de naissance."; if (Object.keys(S.miles).length < 1) return "Ajoutez au moins une photo."; }
    else if (!S.child.length) return "Ajoutez au moins une photo.";
    if (isParc && !S.parent.length) return "Ajoutez au moins une photo de " + S.avec + ".";
    if (!S.consent) return "Merci de cocher l’autorisation parentale.";
    return "";
  }
  function check3() {
    var c = S.cli;
    if (c.nom.trim().length < 3) return "Indiquez votre nom.";
    if (!phoneValid(c.tel)) return "Vérifiez votre numéro WhatsApp (exemple : 6 12 34 56 78).";
    if (!c.ville) return "Choisissez votre ville.";
    if (c.adr.trim().length < 6) return "Indiquez votre adresse de livraison.";
    return "";
  }

  /* ---------- envoi au serveur ---------- */
  function upload() {
    var fd = new FormData(), n = 0;
    // Les prix et la référence sont recalculés/créés côté serveur.
    var order = { histoire: story.slug, histoire_nom: story.nom, version: "", enfant: S.nom, age: isBebe ? null : S.age, naissance: isBebe ? S.naissance : "", genre: S.genre, avec: isParc ? S.avec : "",
      de_la_part_de: giver(), message: S.msg, offre: S.offre,
      client: { nom: S.cli.nom.trim(), telephone: "+212" + phoneDigits(S.cli.tel).slice(1), ville: S.cli.ville, adresse: S.cli.adr.trim() }, consentement_parent: true };
    fd.append("order", JSON.stringify(order));
    S.child.forEach(function (p, i) { fd.append("photos", p.blob, "enfant-" + (i + 1) + ".jpg"); n++; });
    S.parent.forEach(function (p, i) { fd.append("photos", p.blob, "parent-" + (i + 1) + ".jpg"); n++; });
    MILES.forEach(function (m) { if (S.miles[m[0]]) { fd.append("photos", S.miles[m[0]].blob, "etape-" + m[0] + ".jpg"); n++; } });
    var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 60000);
    return fetch(apiBase + "/api/orders", { method: "POST", body: fd, signal: ctl.signal }).then(function (r) {
      clearTimeout(t);
      if (!r.ok) return null;
      return r.json();
    }).catch(function () { clearTimeout(t); return null; });
  }

  /* ---------- événements ---------- */
  function render() {
    $("#title").textContent = S.done ? "Merci" : story.nom;
    app.innerHTML = S.done ? stepDone() : S.step === 1 ? step1() : S.step === 2 ? step2() : step3();
    window.scrollTo(0, 0);
  }
  function rerender() { var y = window.scrollY; app.innerHTML = S.done ? stepDone() : S.step === 1 ? step1() : S.step === 2 ? step2() : step3(); window.scrollTo(0, y); }

  app.addEventListener("input", function (e) {
    var t = e.target, k = t.getAttribute("data-k"), c = t.getAttribute("data-c");
    if (c) { S.cli[c] = t.value; return; }
    if (!k) return;
    if (k === "nom") S.nom = t.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' \-]/g, "");
    else if (k === "age") S.age = parseInt(t.value, 10);
    else if (k === "consent") S.consent = t.checked;
    else if (k === "offre") { S.offre = t.value; var b = $("#cont"); if (b) b.textContent = "Continuer · " + money(offer().prix); }
    else if (k === "msg") { S.msg = t.value; var n = $("#cnt"); if (n) n.textContent = S.msg.length + " / " + (CFG.dedicaceMax || 180); }
    else S[k] = t.value;
  });
  app.addEventListener("change", function (e) { if (e.target.getAttribute("data-k") === "nom") { S.nom = cleanName(S.nom); e.target.value = S.nom; } });
  app.addEventListener("click", function (e) {
    var t = e.target.closest("button, a"); if (!t) return;
    var sg = t.getAttribute("data-seg");
    if (sg) {
      S[sg] = t.getAttribute("data-val");
      if (sg === "v") S.genre = S.v === "fille" ? "fille" : "garcon";
      return rerender();
    }
    var add = t.getAttribute("data-add");
    if (add) {
      if (add === "child") return pickFiles(true, function (f) { addTo(S.child, CFG.maxPhotos || 3, f); });
      if (add === "parent") return pickFiles(true, function (f) { addTo(S.parent, 2, f); });
      if (add.indexOf("m:") === 0) { var key = add.slice(2); return pickFiles(false, function (f) { preparePhoto(f[0]).then(function (r) { S.miles[key] = r; S.err = ""; rerender(); }, function (er) { S.err = er.message; rerender(); }); }); }
    }
    var rm = t.getAttribute("data-rm");
    if (rm) { var p = rm.split(":"); if (p[0] === "m") delete S.miles[p[1]]; else S[p[0]].splice(parseInt(p[1], 10), 1); return rerender(); }
    var go = t.getAttribute("data-go"); if (go) { S.step = parseInt(go, 10); S.err = ""; return render(); }
    if (t.hasAttribute("data-copy")) { var txt = buildMessage(); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { t.textContent = "Message copié"; }, function () { var r = document.createRange(); r.selectNode($("#msgtxt")); getSelection().removeAllRanges(); getSelection().addRange(r); t.textContent = "Sélectionné : copiez-le"; }); }
  });
  app.addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target.getAttribute("data-form");
    if (f === "1") { S.nom = cleanName(S.nom); S.err = check1(); if (S.err) return rerender(); S.step = 2; render(); }
    else if (f === "2") { if (S.giver === "Autre" && !S.autre.trim()) { S.err = ""; return $("#f-autre").focus(); } S.step = 3; S.err = ""; render(); }
    else if (f === "3") {
      S.err = check3(); if (S.err) return rerender();
      var waWin = window.open("about:blank", "_blank");
      var finish = function (uploaded) {
        S.done = true; S.uploaded = uploaded; render();
        var url = waUrl(buildMessage());
        if (waWin && !waWin.closed) waWin.location.href = url;
      };
      if (S.serveur) {
        var submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Envoi de la commande…"; }
        upload().then(function (res) {
          if (res && res.ref) { S.ref = res.ref; finish(true); }
          else { S.ref = newRef(); finish(false); }
        });
      } else {
        S.ref = newRef(); finish(false);
      }
    }
  });
  $("#back").addEventListener("click", function () {
    if (S.done) return (location.href = "index.html");
    if (S.step > 1) { S.step--; S.err = ""; return render(); }
    location.href = "histoires/" + story.slug + ".html";
  });
  render();
})();
