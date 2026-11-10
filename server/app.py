"""Qissa · serveur de commandes (site + API).

Le site est statique : ce serveur est facultatif. Il sert à recevoir les photos avec la commande
(le client les ajoute dans le formulaire) et à les ranger par commande pour l'Atelier.

    pip install -r server/requirements.txt
    uvicorn server.app:app --port 8000            → http://localhost:8000

Réglages (variables d'environnement, voir .env.example) :
    QISSA_ORDERS_DIR   dossier des commandes (défaut : orders/)   ← données clients : ne jamais publier
    ADMIN_TOKEN        code de l'Atelier (obligatoire pour lister/télécharger les commandes)
    ALLOWED_ORIGINS    sites autorisés à envoyer des commandes (défaut : *)
    ORDER_PHOTO_TTL_DAYS  suppression automatique des photos (défaut : 30 jours)
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import re
import secrets
import shutil
import tempfile
import time
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps
from server.order_email import enqueue as enqueue_order_email, send_pending as send_pending_order_emails

log = logging.getLogger("qissa")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

ROOT = Path(__file__).resolve().parents[1]


def env(name, default=""):
    return os.environ.get(name, default).strip()


ORDERS = Path(env("QISSA_ORDERS_DIR", str(ROOT / "orders")))
SITE = ROOT / "site"
ADMIN_TOKEN = env("ADMIN_TOKEN")
ORIGINS = [o.strip() for o in env("ALLOWED_ORIGINS", "https://qissamagic.com,https://www.qissamagic.com").split(",") if o.strip()]
MAX_FILES = 12
MAX_PHOTO_BYTES = int(float(env("MAX_PHOTO_MB", "12")) * 1024 * 1024)
ORDERS_PER_IP = int(env("ORDERS_PER_IP_PER_DAY", "15"))
PHOTO_TTL_DAYS = float(env("ORDER_PHOTO_TTL_DAYS", "30"))
SALT = env("IP_SALT") or secrets.token_hex(8)

REF_RE = re.compile(r"^[A-Z]{2,4}-\d{4}-[A-Z0-9]{3,10}$")
PHOTO_RE = re.compile(r"^(enfant-[1-3]|parent-[1-2]|etape-(naissance|4mois|8mois|1an)|doudou-1)\.jpg$")
STORIES = {"capitaine", "super", "supersara", "ballet", "iletaitunefois", "parc", "premiereannee", "samyetmomo"}
OFFER_PRICES = {"livre": 195, "coffret": 289}
OFFERS = set(OFFER_PRICES)
DELIVERY_PRICE = 35
HITS: dict[str, list[float]] = {}


def clean(v, limit=200):
    return re.sub(r"\s+", " ", str(v or "")).strip()[:limit]


def ip_of(request: Request):
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?"))


def too_many(ip):
    key = hashlib.sha256((SALT + ip).encode()).hexdigest()[:16]
    now = time.time()
    hits = [t for t in HITS.get(key, []) if now - t < 86400]
    if len(hits) >= ORDERS_PER_IP:
        HITS[key] = hits
        return True
    hits.append(now)
    HITS[key] = hits
    return False




def new_ref():
    """Référence créée côté serveur pour éviter les collisions/écrasements."""
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    year = datetime.now(timezone.utc).year
    for _ in range(100):
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        ref = f"QM-{year}-{code}"
        if not (ORDERS / ref).exists():
            return ref
    raise HTTPException(503, "Impossible de créer une référence de commande.")

def order_dir(ref):
    if not REF_RE.match(ref or ""):
        raise HTTPException(400, "Référence invalide.")
    return ORDERS / ref


def require_admin(request: Request):
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip() or request.query_params.get("token", "")
    if not ADMIN_TOKEN or not secrets.compare_digest(token, ADMIN_TOKEN):
        raise HTTPException(401, "Code Atelier invalide.")


def reencode(raw: bytes) -> bytes:
    """Photo propre : orientation appliquée, métadonnées retirées, 1536 px max."""
    try:
        im = Image.open(io.BytesIO(raw))
        im.verify()
        im = Image.open(io.BytesIO(raw))
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception:
        raise HTTPException(400, "Une des photos est illisible.")
    if min(im.size) < 200:
        raise HTTPException(400, "Une des photos est trop petite.")
    im.thumbnail((1536, 1536))
    out = io.BytesIO()
    im.save(out, "JPEG", quality=90)
    return out.getvalue()


def cleanup():
    now = time.time()
    for photos in ORDERS.glob("*/photos"):
        for p in photos.glob("*.jpg"):
            if (now - p.stat().st_mtime) / 86400 > PHOTO_TTL_DAYS:
                p.unlink(missing_ok=True)


async def cleanup_loop():
    while True:
        try:
            cleanup()
        except Exception:
            log.exception("nettoyage")
        await asyncio.sleep(3600)


async def email_loop():
    while True:
        try:
            await asyncio.to_thread(
                send_pending_order_emails, ORDERS,
                env("QISSA_RESEND_API_KEY"),
                env("QISSA_EMAIL_FROM"),
                env("QISSA_NOTIFICATION_TO"),
            )
        except Exception:
            log.exception("notifications email")
        await asyncio.sleep(15)


@asynccontextmanager
async def lifespan(_app):
    ORDERS.mkdir(parents=True, exist_ok=True)
    task = asyncio.create_task(cleanup_loop())
    email_task = asyncio.create_task(email_loop())
    log.info("Qissa prêt · origines %s · Atelier %s", ORIGINS, "actif" if ADMIN_TOKEN else "désactivé (ADMIN_TOKEN absent)")
    yield
    task.cancel()
    email_task.cancel()


app = FastAPI(title="Qissa · commandes", docs_url=None, redoc_url=None, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"], max_age=600)


@app.get("/api/config")
async def config():
    return {"orders": True, "max_files": MAX_FILES, "retention_days": PHOTO_TTL_DAYS}


@app.post("/api/orders")
async def create_order(request: Request, order: str = Form(...), photos: list[UploadFile] = File(default=[])):
    if too_many(ip_of(request)):
        raise HTTPException(429, "Trop de commandes depuis cette connexion. Écrivez-nous sur WhatsApp.")
    try:
        o = json.loads(order)
        assert isinstance(o, dict)
    except Exception:
        raise HTTPException(400, "Commande illisible.")
    if o.get("histoire") not in STORIES or o.get("offre") not in OFFERS:
        raise HTTPException(400, "Histoire ou offre inconnue.")
    cli = o.get("client") or {}
    telephone = clean(cli.get("telephone"), 20)
    if not re.fullmatch(r"\+212[5-7]\d{8}", telephone):
        raise HTTPException(400, "Numéro de téléphone invalide.")
    # La case est facultative ; sa valeur est conservée dans la commande.
    if len(photos) > MAX_FILES:
        raise HTTPException(400, "Trop de photos.")

    ref = new_ref()
    price = OFFER_PRICES[o["offre"]]
    delivery = DELIVERY_PRICE
    grand_total = price + delivery
    odir = order_dir(ref)
    (odir / "photos").mkdir(parents=True, exist_ok=True)
    saved = []
    for up in photos:
        name = clean(up.filename, 40)
        if not PHOTO_RE.match(name):
            raise HTTPException(400, "Nom de photo inattendu.")
        raw = await up.read(MAX_PHOTO_BYTES + 1)
        if len(raw) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "Une photo est trop lourde.")
        data = await asyncio.to_thread(reencode, raw)
        (odir / "photos" / name).write_bytes(data)
        saved.append(name)

    record = {
        "ref": ref,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": "reçue",
        "histoire": o["histoire"], "histoire_nom": clean(o.get("histoire_nom"), 60),
        "version": clean(o.get("version"), 10),
        "enfant": clean(o.get("enfant"), 30), "age": o.get("age") if type(o.get("age")) is int else None,
        "age_texte": clean(o.get("age_texte"), 30),
        "naissance": clean(o.get("naissance"), 10), "genre": clean(o.get("genre"), 10), "avec": clean(o.get("avec"), 10),
        "de_la_part_de": clean(o.get("de_la_part_de"), 40), "message": clean(o.get("message"), 200),
        "offre": o["offre"], "prix": price, "livraison": delivery,
        "total": grand_total,
        "client": {"nom": clean(cli.get("nom"), 60), "telephone": clean(cli.get("telephone"), 20),
                   "ville": clean(cli.get("ville"), 40), "adresse": clean(cli.get("adresse"), 200)},
        "consentement_parent": bool(o.get("consentement_parent")) if photos else False,
        "photos": sorted(saved),
    }
    (odir / "order.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    enqueue_order_email(odir)
    log.info("commande %s reçue (%s, %d photos)", ref, record["histoire"], len(saved))
    lines = ["Bonjour Qissa, je viens de commander un livre personnalisé.",
             "Référence : " + ref,
             "Histoire : " + record["histoire_nom"],
             "Prénom de l’enfant : " + record["enfant"]]
    if record["age_texte"]:
        lines.append("Âge : " + record["age_texte"])
    elif record["age"] is not None:
        lines.append("Âge : " + str(record["age"]) + " ans")
    if record["naissance"]:
        lines.append("Date de naissance : " + record["naissance"])
    if record["genre"]:
        lines.append("Fille ou garçon : " + record["genre"])
    if record["avec"]:
        lines.append("Avec : " + record["avec"])
    if record["de_la_part_de"]:
        lines.append("De la part de : " + record["de_la_part_de"])
    if record["message"]:
        lines.append("Dédicace : " + record["message"])
    lines += ["Formule : " + ("Livre et coffret premium" if record["offre"] == "coffret" else "Livre seul"),
              "Livre : " + str(record["prix"]) + " DH",
              "Livraison : " + str(record["livraison"]) + " DH",
              "Total à payer à la livraison : " + str(record["total"]) + " DH"]
    if record["client"]["nom"]:
        lines.append("Nom du client : " + record["client"]["nom"])
    lines.append("Téléphone WhatsApp : " + record["client"]["telephone"])
    if record["client"]["ville"]:
        lines.append("Ville : " + record["client"]["ville"])
    if record["client"]["adresse"]:
        lines.append("Adresse : " + record["client"]["adresse"])
    lines.append("Photos : " + (str(len(saved)) + " reçue(s) dans l’Atelier sous cette référence" if saved else "à transmettre ensuite"))
    whatsapp_number = re.sub(r"\D", "", env("QISSA_WHATSAPP_NUMBER", "212684048495"))
    return {"ok": True, "ref": ref, "photos": len(saved),
            "whatsapp_url": "https://wa.me/" + whatsapp_number + "?text=" + quote("\n".join(lines))}


# ---------------------------------------------------------------- Atelier

@app.get("/api/admin/orders")
async def admin_orders(request: Request):
    require_admin(request)
    rows = []
    for p in ORDERS.glob("*/order.json"):
        try:
            o = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        o["nb_photos"] = len(list((p.parent / "photos").glob("*.jpg")))
        email_status = p.parent / "email-status.json"
        if email_status.exists():
            try:
                o["notification_email"] = json.loads(email_status.read_text(encoding="utf-8")).get("state", "pending")
            except (OSError, ValueError):
                o["notification_email"] = "pending"
        rows.append(o)
    rows.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    return {"orders": rows}


@app.get("/api/admin/orders/{ref}")
async def admin_order(ref: str, request: Request):
    require_admin(request)
    p = order_dir(ref) / "order.json"
    if not p.exists():
        raise HTTPException(404, "Commande introuvable.")
    return json.loads(p.read_text(encoding="utf-8"))


@app.get("/api/admin/orders/{ref}/photo/{name}")
async def admin_photo(ref: str, name: str, request: Request):
    require_admin(request)
    p = order_dir(ref) / "photos" / name
    if not PHOTO_RE.match(name) or not p.exists():
        raise HTTPException(404, "Photo introuvable.")
    return FileResponse(p, media_type="image/jpeg")


@app.get("/api/admin/orders/{ref}/zip")
async def admin_zip(ref: str, request: Request):
    require_admin(request)
    odir = order_dir(ref)
    if not (odir / "order.json").exists():
        raise HTTPException(404, "Commande introuvable.")
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
        for p in odir.rglob("*"):
            if p.is_file():
                z.write(p, Path(ref) / p.relative_to(odir))
    tmp.close()
    return FileResponse(tmp.name, media_type="application/zip", filename=f"{ref}.zip")


@app.post("/api/admin/orders/{ref}/purge-photos")
async def admin_purge(ref: str, request: Request):
    """À lancer une fois le livre fabriqué : supprime les photos de l'enfant."""
    require_admin(request)
    odir = order_dir(ref)
    shutil.rmtree(odir / "photos", ignore_errors=True)
    return {"ok": True}


# ---------------------------------------------------------------- le site lui-même (facultatif)

class Site(StaticFiles):
    async def get_response(self, path, scope):
        if path.startswith("src"):  # sources : pas publiées
            from starlette.exceptions import HTTPException as SHTTP
            raise SHTTP(404)
        public_pages = {
            "index.html", "commander.html", "partager.html",
            "mentions-legales.html", "confidentialite.html",
            *(f"histoires/{slug}.html" for slug in STORIES),
        }
        if path in public_pages:
            from starlette.responses import RedirectResponse
            clean = "/" if path == "index.html" else "/" + path[:-5]
            query = scope.get("query_string", b"").decode("latin-1")
            return RedirectResponse(clean + ("?" + query if query else ""), status_code=308)
        if path + ".html" in public_pages:
            path += ".html"
        return await super().get_response(path, scope)


if SITE.exists():
    app.mount("/", Site(directory=str(SITE), html=True), name="site")
