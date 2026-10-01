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

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

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
PHOTO_RE = re.compile(r"^(enfant-[1-3]|parent-[1-2]|etape-(naissance|4mois|8mois|1an))\.jpg$")
STORIES = {"capitaine", "super", "supersara", "ballet", "iletaitunefois", "parc", "premiereannee"}
OFFER_PRICES = {"livre": 199, "coffret": 249}
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


@asynccontextmanager
async def lifespan(_app):
    ORDERS.mkdir(parents=True, exist_ok=True)
    task = asyncio.create_task(cleanup_loop())
    log.info("Qissa prêt · origines %s · Atelier %s", ORIGINS, "actif" if ADMIN_TOKEN else "désactivé (ADMIN_TOKEN absent)")
    yield
    task.cancel()


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
    if o.get("consentement_parent") is not True:
        raise HTTPException(400, "L'autorisation parentale est nécessaire.")
    cli = o.get("client") or {}
    if len(clean(cli.get("nom"))) < 3 or len(clean(cli.get("adresse"))) < 6 or not re.match(r"^\+2120?[5-7]\d{8}$", clean(cli.get("telephone"), 20)):
        raise HTTPException(400, "Coordonnées de livraison incomplètes.")
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
        "enfant": clean(o.get("enfant"), 30), "age": o.get("age") if isinstance(o.get("age"), int) else None,
        "naissance": clean(o.get("naissance"), 10), "genre": clean(o.get("genre"), 10), "avec": clean(o.get("avec"), 10),
        "de_la_part_de": clean(o.get("de_la_part_de"), 40), "message": clean(o.get("message"), 200),
        "offre": o["offre"], "prix": price, "livraison": delivery,
        "total": grand_total,
        "client": {"nom": clean(cli.get("nom"), 60), "telephone": clean(cli.get("telephone"), 20),
                   "ville": clean(cli.get("ville"), 40), "adresse": clean(cli.get("adresse"), 200)},
        "consentement_parent": True,
        "photos": sorted(saved),
    }
    (odir / "order.json").write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log.info("commande %s reçue (%s, %d photos)", ref, record["histoire"], len(saved))
    return {"ok": True, "ref": ref, "photos": len(saved)}


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
        return await super().get_response(path, scope)


if SITE.exists():
    app.mount("/", Site(directory=str(SITE), html=True), name="site")
