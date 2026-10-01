# Qissa · site de livres personnalisés

Version finale de travail du site Qissa avec 7 histoires, pages produit complètes, tunnel de commande en 3 étapes, WhatsApp, paiement à la livraison et Atelier privé.

## Offre
- Livre personnalisé : **199 DH**
- Livre dans son coffret : **249 DH**
- Livraison : **35 DH** en supplément
- Livre : **21 × 21 cm · 24 pages**
- Coffret : **25 × 25 × 3 cm**

Le site n'annonce aucune génération en temps réel. Une fois la commande reçue, le client reçoit un **aperçu sur WhatsApp le jour même**, puis valide avant impression.

## Histoires intégrées
- Capitaine — garçon · 3–6 / 6–9 / 9–12 ans
- Super Sara — fille ou garçon · 3–6 ans
- Super Omar — fille ou garçon · 6–9 / 9–12 ans
- Il était une fois… — fille · 3–6 / 6–9 / 9–12 ans
- Samy et le Parc Enchanté — fille ou garçon · 2–5 ans · Maman ou Papa personnalisé
- Ania et le ballet des étoiles — fille · 3–6 / 6–9 / 9–12 ans
- La première année — fille ou garçon · 1–2 ans

Toutes les pages intègrent les doubles pages d'exemple, la preuve photo → personnage, le livre physique et le coffret. Les vidéos Nelya et Ayla sont intégrées sur l'accueil et sur leurs pages respectives.

## Personnalisation affichée
Prénom + âge + visage à partir des photos + dédicace. Le Parc Enchanté demande en plus les photos de Maman ou Papa.

## Configuration
`site/config.js` contient le numéro WhatsApp, les prix et les frais de livraison.

Après une modification de contenu :

```bash
python tools/build_site.py
```

## Test local
Double-cliquez sur `Tester_Mac.command` ou `Tester_Windows.bat`, ou lancez :

```bash
uvicorn server.app:app --port 8000
```

Accueil : `http://localhost:8000/`
Atelier : `http://localhost:8000/atelier.html`

## Commandes et photos
Le serveur recalcule les prix et crée la référence de commande côté serveur. Les commandes sont stockées hors des fichiers publics du site. Les photos sont réencodées avant stockage.

## À compléter avant publication définitive
- Mentions légales et politique de confidentialité.
- Valider avec les familles les textes de témoignages rédigés à partir d'un brief, notamment Super Sara et Ania, avant de les présenter comme citations directes.
- Ajouter la future vidéo de découverte de Samy lorsqu'elle sera reçue.


## V6 mobile UX
- Suppression de la question FAQ « Que deviennent ses photos ? ».
- Interface mobile compactée et pensée pour le swipe : catalogue, étapes, preuves, réalisations et témoignages.
- Pages histoires, tunnel de commande, footer et actions flottantes optimisés pour petits écrans.
