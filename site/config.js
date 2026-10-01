/* ==========================================================================
   Qissa · Réglages du site (à modifier ici, sans toucher au reste)
   ========================================================================== */
window.QISSA_CONFIG = {
  marque: "Qissa Magic",

  // Numéro WhatsApp Business qui reçoit les commandes.
  // Format international SANS "+" ni espaces. Exemple : 212612345678
  whatsapp: "212684048495",

  instagram: "qissamagic",
  email: "contact@qissamagic.com",

  devise: "DH",
  livraison: 35, // frais fixes, payés à la livraison
  offres: [
    { id: "livre",   nom: "Le livre",   prix: 199, detail: "Format carré 21 × 21 cm, 24 pages" },
    { id: "coffret", nom: "Le livre dans son coffret", prix: 249, detail: "Coffret bleu nuit 25 × 25 × 3 cm" }
  ],
  offreParDefaut: "coffret",

  ageMin: 3,
  ageMax: 12,
  nomMax: 16,
  dedicaceMax: 180,
  relations: ["Maman", "Papa", "Maman et Papa", "Autre"],
  prefixeCommande: "QM",

  // Envoi des photos avec la commande
  //   "auto" : le serveur qui publie ce site (python -m uvicorn server.app:app)
  //   "https://commandes.qissamagic.com" : un serveur à part
  //   ""     : pas de serveur, les photos sont envoyées sur WhatsApp après la commande
  serveur: "auto",
  maxPhotos: 3,

  // Lien discret "Atelier" dans le pied de page (mettre false une fois en ligne)
  lienAtelier: false
};
