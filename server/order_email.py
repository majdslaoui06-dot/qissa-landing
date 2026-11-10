"""Durable email notifications for newly recorded Qissa orders."""
from __future__ import annotations

import base64
import json
import logging
import os
import time
from pathlib import Path
from urllib import request

log = logging.getLogger("qissa.email")
STATUS_FILE = "email-status.json"
MAX_RAW_ATTACHMENTS = 12 * 1024 * 1024  # comfortably below Gmail's 25 MB after Base64


def _write_status(path: Path, state: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    os.replace(temporary, path)


def enqueue(order_dir: Path) -> None:
    """Only orders created after this feature is deployed get a notification."""
    _write_status(order_dir / STATUS_FILE, {"state": "pending", "sent_parts": 0, "attempts": 0, "next_attempt": 0})


def _body(order: dict, photo_names: list[str], part: int, parts: int) -> str:
    client = order.get("client") or {}
    rows = [
        ("Référence", order.get("ref")),
        ("Date de commande", order.get("created_at")),
        ("Histoire", order.get("histoire_nom") or order.get("histoire")),
        ("Prénom de l'enfant", order.get("enfant")),
        ("Âge", order.get("age_texte") or (str(order["age"]) + " ans" if order.get("age") is not None else "")),
        ("Date de naissance", order.get("naissance")),
        ("Fille ou garçon", order.get("genre")),
        ("Accompagnant", order.get("avec")),
        ("De la part de", order.get("de_la_part_de")),
        ("Dédicace", order.get("message")),
        ("Formule", "Livre avec coffret premium" if order.get("offre") == "coffret" else "Livre seul"),
        ("Prix du livre", f'{order.get("prix", "")} DH'),
        ("Livraison", f'{order.get("livraison", "")} DH'),
        ("Total à payer à la livraison", f'{order.get("total", "")} DH'),
        ("Nom du client", client.get("nom")),
        ("Téléphone WhatsApp", client.get("telephone")),
        ("Ville", client.get("ville")),
        ("Adresse", client.get("adresse")),
        ("Photos", ", ".join(photo_names) if photo_names else "Aucune photo reçue"),
    ]
    header = "Nouvelle commande Qissa enregistrée dans l'Atelier."
    if parts > 1:
        header += f"\nEnvoi des photos : partie {part}/{parts}."
    return header + "\n\n" + "\n".join(f"{label} : {value}" for label, value in rows if value not in (None, ""))


def _photo_groups(order_dir: Path, order: dict) -> list[list[Path]]:
    photos = [order_dir / "photos" / name for name in order.get("photos", [])]
    photos = [photo for photo in photos if photo.is_file() and photo.suffix.lower() == ".jpg"]
    groups: list[list[Path]] = [[]]
    size = 0
    for photo in photos:
        photo_size = photo.stat().st_size
        if size + photo_size > MAX_RAW_ATTACHMENTS and groups[-1]:
            groups.append([])
            size = 0
        groups[-1].append(photo)
        size += photo_size
    return groups


def _send(api_key: str, sender: str, recipient: str, order: dict, group: list[Path], part: int, parts: int) -> str:
    ref = order["ref"]
    payload = {
        "from": sender,
        "to": [recipient],
        "subject": f"Nouvelle commande Qissa {ref} — {order.get('enfant', '')}" + (f" ({part}/{parts})" if parts > 1 else ""),
        "text": _body(order, order.get("photos", []), part, parts),
        "attachments": [{"filename": photo.name, "content": base64.b64encode(photo.read_bytes()).decode("ascii")} for photo in group],
    }
    req = request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json", "Idempotency-Key": f"qissa-order-{ref}-part-{part}"},
        method="POST",
    )
    with request.urlopen(req, timeout=30) as response:
        result = json.load(response)
    if not result.get("id"):
        raise RuntimeError("Le service d'email n'a pas confirmé l'envoi")
    return result["id"]


def send_pending(orders_dir: Path, api_key: str, sender: str, recipient: str) -> int:
    """Try queued notifications once; failed parts remain queued for the next pass."""
    if not (api_key and sender and recipient):
        return 0
    sent = 0
    now = time.time()
    for status_path in sorted(orders_dir.glob("*/" + STATUS_FILE)):
        status = None
        try:
            status = json.loads(status_path.read_text(encoding="utf-8"))
            if status.get("state") == "sent" or status.get("next_attempt", 0) > now:
                continue
            order_dir = status_path.parent
            order = json.loads((order_dir / "order.json").read_text(encoding="utf-8"))
            groups = _photo_groups(order_dir, order)
            for index in range(int(status.get("sent_parts", 0)), len(groups)):
                _send(api_key, sender, recipient, order, groups[index], index + 1, len(groups))
                status["sent_parts"] = index + 1
                status["attempts"] = 0
                _write_status(status_path, status)
            status["state"] = "sent"
            status["sent_at"] = int(time.time())
            _write_status(status_path, status)
            sent += 1
            log.info("Notification email envoyée pour %s", order.get("ref"))
        except Exception as exc:
            attempts = int(status.get("attempts", 0)) + 1 if isinstance(status, dict) else 1
            if isinstance(status, dict):
                status["attempts"] = attempts
                status["next_attempt"] = int(time.time() + min(3600, 30 * 2 ** min(attempts, 7)))
                _write_status(status_path, status)
            log.warning("Notification email en attente pour %s : %s", status_path.parent.name, type(exc).__name__)
    return sent
