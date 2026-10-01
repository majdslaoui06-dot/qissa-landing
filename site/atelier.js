/* Qissa · Atelier (interne) */
(function () {
  "use strict";
  var CFG = window.QISSA_CONFIG || {};
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var LABELS = { "réf": "ref", "histoire": "histoire", "version": "version", "enfant": "enfant", "âge": "age", "naissance": "naissance", "genre": "genre", "avec": "avec", "de la part de": "de_la_part_de", "message": "message", "offre": "offre", "livraison": "livraison", "total à payer à la livraison": "total", "photos": "photos", "nom": "nom", "téléphone": "telephone", "ville": "ville", "adresse": "adresse" };
  var last = null;

  function parse(txt) {
    var o = {};
    txt.split(/\r?\n/).forEach(function (l) {
      var m = l.match(/^\s*([^:]{2,40}?)\s*:\s*(.+)$/);
      if (!m) return;
      var k = LABELS[m[1].trim().toLowerCase()];
      if (k) o[k] = m[2].trim();
    });
    return o;
  }
  function msgs(o) {
    var prenom = o.enfant || "votre enfant", nom = (o.nom || "").split(" ")[0] || "";
    var hi = "Bonjour" + (nom ? " " + nom : "") + ", ";
    return [
      ["Confirmation de commande", hi + "merci pour votre commande " + (o.ref || "") + " (" + (o.histoire || "") + "). Nous préparons l'aperçu du livre de " + prenom + " et vous l'envoyons aujourd'hui sur ce numéro. Total à la livraison : " + (o.total || "") + "."],
      ["Photos manquantes", hi + "pour illustrer le livre de " + prenom + ", pouvez-vous nous envoyer ici 1 à 3 photos de face, bien éclairées ? Référence : " + (o.ref || "") + ". Elles servent uniquement à la préparation de cette commande."],
      ["Envoi de l'aperçu", hi + "voici l'aperçu du livre de " + prenom + ". Dites-nous si tout vous convient : avec votre accord, nous lançons l'impression."],
      ["Livraison", hi + "le livre de " + prenom + " est en route vers " + (o.ville || "chez vous") + ". Vous réglez " + (o.total || "") + " à la livraison. Merci de votre confiance !"]
    ];
  }
  $("#parse").onclick = function () {
    last = parse($("#paste").value);
    if (!last.ref) { $("#res").innerHTML = '<p class="err">Commande non reconnue : le message doit contenir la ligne « Réf : … ».</p>'; return; }
    var rows = Object.keys(last).map(function (k) { return "<tr><th>" + esc(k) + "</th><td>" + esc(last[k]) + "</td></tr>"; }).join("");
    var tel = (last.telephone || "").replace(/\D/g, "");
    var h = "<table>" + rows + "</table>";
    msgs(last).forEach(function (m) {
      h += "<h3 style='font-size:17px;margin-top:10px'>" + esc(m[0]) + "</h3><pre>" + esc(m[1]) + '</pre><div class="row"><button class="btn ghost" data-copy="' + esc(m[1]) + '">Copier</button>' + (tel ? '<a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/' + tel + "?text=" + encodeURIComponent(m[1]) + '">Ouvrir dans WhatsApp</a>' : "") + "</div>";
    });
    $("#res").innerHTML = h; $("#dl").hidden = false;
  };
  $("#dl").onclick = function () {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(last, null, 2)], { type: "application/json" }));
    a.download = "order-" + (last.ref || "commande") + ".json"; a.click();
  };
  document.addEventListener("click", function (e) {
    var c = e.target.getAttribute && e.target.getAttribute("data-copy");
    if (c) navigator.clipboard.writeText(c).then(function () { e.target.textContent = "Copié"; });
  });

  /* serveur */
  try { $("#api").value = localStorage.getItem("qissa.api") || ""; $("#tok").value = localStorage.getItem("qissa.token") || ""; } catch (e) {}
  function api(path, opt) {
    var base = ($("#api").value || "").replace(/\/$/, "");
    opt = opt || {}; opt.headers = Object.assign({ Authorization: "Bearer " + $("#tok").value }, opt.headers || {});
    return fetch(base + path, opt);
  }
  $("#load").onclick = function () {
    try { localStorage.setItem("qissa.api", $("#api").value); localStorage.setItem("qissa.token", $("#tok").value); } catch (e) {}
    $("#srvmsg").textContent = "";
    api("/api/admin/orders").then(function (r) { if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Code Atelier refusé." : "Serveur injoignable (" + r.status + ")."); return r.json(); })
      .then(function (j) {
        var list = j.orders || j;
        if (!list.length) { $("#list").innerHTML = "<p>Aucune commande pour le moment.</p>"; return; }
        $("#list").innerHTML = "<table><tr><th>Réf</th><th>Histoire</th><th>Enfant</th><th>Client</th><th>Total</th><th>Photos</th><th></th></tr>" + list.map(function (o) {
          return "<tr><td>" + esc(o.ref) + "</td><td>" + esc(o.histoire_nom || o.histoire || "") + "</td><td>" + esc(o.enfant || "") + "</td><td>" + esc((o.client || {}).nom || "") + "<br>" + esc((o.client || {}).ville || "") + "</td><td>" + esc(o.total || "") + "</td><td>" + esc(o.nb_photos == null ? "" : o.nb_photos) + '</td><td><button class="btn ghost" data-zip="' + esc(o.ref) + '">Dossier .zip</button></td></tr>';
        }).join("") + "</table>";
      }).catch(function (e) { $("#srvmsg").textContent = e.message || "Serveur injoignable."; });
  };
  document.addEventListener("click", function (e) {
    var ref = e.target.getAttribute && e.target.getAttribute("data-zip");
    if (!ref) return;
    api("/api/admin/orders/" + encodeURIComponent(ref) + "/zip").then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = ref + ".zip"; a.click();
    }).catch(function () { $("#srvmsg").textContent = "Téléchargement impossible."; });
  });
})();
