"""Qissa · illustration automatique du héros à partir des photos.

Principe (règle Qissa : jamais de remplacement de visage sur une image générée) :
  1. les photos du parent servent de références ;
  2. le modèle dessine un « personnage maître » (portrait en pied, fond transparent) ;
  3. chaque pose du manifest est dessinée d'un seul coup à partir du personnage
     maître + une photo + la description écrite de l'enfant ;
  4. on obtient 11 PNG transparents, exactement ce qu'attend src/assemble_book.py.

Fournisseurs : "openai" (par défaut si OPENAI_API_KEY), "gemini", "mock" (sans IA, pour tester).
"""
import asyncio
import base64
import io
import json
import logging
import os
import random
import time
from pathlib import Path

from PIL import Image, ImageOps

log = logging.getLogger("qissa.illustrate")
ROOT = Path(__file__).resolve().parents[1]
MOCK_DIR = Path(__file__).resolve().parent / "mock"
PNG_MAGIC = b"\x89PNG"


def load_dotenv(path=ROOT / ".env"):
    """Charge .env (lancement local) sans écraser les variables déjà définies."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()


def env(name, default=None):
    value = os.getenv(name)
    return default if value in (None, "") else value


class PhotoError(ValueError):
    """Photo refusée avant tout appel au modèle (message pour le parent)."""


class ProviderError(RuntimeError):
    """Échec du modèle d'image. `user_message` est affichable au parent."""

    def __init__(self, message, user_message=None, retryable=False):
        super().__init__(message)
        self.user_message = user_message or "L'illustration n'a pas abouti. Réessayez dans un instant."
        self.retryable = retryable


# ---------------------------------------------------------------- images

def prepare_photo(data: bytes, max_side=1536, min_side=360) -> bytes:
    """Ouvre la photo, applique l'orientation, réduit et réencode en JPEG.
    Le réencodage supprime les métadonnées (EXIF, position GPS…)."""
    try:
        im = Image.open(io.BytesIO(data))
        im = ImageOps.exif_transpose(im).convert("RGB")
    except Exception as exc:  # format illisible
        raise PhotoError("Format de photo non reconnu : envoyez une photo JPEG ou PNG.") from exc
    if min(im.size) < min_side:
        raise PhotoError("Cette photo est trop petite : choisissez une photo plus nette.")
    im.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def _alpha_is_real(im: Image.Image) -> bool:
    if im.mode != "RGBA":
        return False
    alpha = im.getchannel("A")
    lo, _ = alpha.getextrema()
    if lo > 16:
        return False
    w, h = im.size
    corners = [alpha.getpixel((x, y)) for x, y in ((2, 2), (w - 3, 2), (2, h - 3), (w - 3, h - 3))]
    return sum(1 for c in corners if c < 40) >= 3


CHROMA = (255, 0, 255)
CHROMA_PROMPT = ("Background: one solid flat pure magenta color (#FF00FF) filling the whole frame behind the child, "
                 "no gradient, no floor, no shadow. Do not use magenta anywhere on the child.")


def cutout(data: bytes) -> bytes:
    """Détoure une image à fond opaque. rembg si installé, sinon clé chroma magenta."""
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    try:
        from rembg import remove  # optionnel : pip install rembg
        out = remove(im)
    except ImportError:
        import numpy as np
        a = np.asarray(im).astype(np.float32)
        rgb = a[..., :3]
        dist = np.sqrt(((rgb - np.array(CHROMA, np.float32)) ** 2).sum(-1))
        alpha = np.clip((dist - 90.0) / (170.0 - 90.0), 0.0, 1.0)
        # atténue le reflet magenta sur les bords
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        spill = np.clip(np.minimum(r, b) - g, 0, None) * (1.0 - alpha)
        rgb[..., 0] = r - spill
        rgb[..., 2] = b - spill
        a[..., :3] = rgb
        a[..., 3] = alpha * 255.0
        out = Image.fromarray(a.clip(0, 255).astype("uint8"), "RGBA")
    buf = io.BytesIO()
    out.save(buf, "PNG")
    return buf.getvalue()


def trim(data: bytes, pad=0.03) -> bytes:
    """Recadre sur le personnage (canal alpha) pour que fit_image_to_box le cadre bien."""
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    box = im.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox()
    if box:
        x0, y0, x1, y1 = box
        p = int(max(x1 - x0, y1 - y0) * pad)
        im = im.crop((max(0, x0 - p), max(0, y0 - p), min(im.width, x1 + p), min(im.height, y1 + p)))
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


class NeedChroma(Exception):
    """Le modèle a rendu un fond opaque alors qu'on demandait la transparence."""


def has_rembg():
    try:
        import rembg  # noqa: F401
        return True
    except ImportError:
        return False


def finish(data: bytes, chroma_requested=False) -> bytes:
    im = Image.open(io.BytesIO(data))
    im.load()
    rgba = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im
    if _alpha_is_real(rgba):
        return trim(data)
    if chroma_requested or has_rembg():
        return trim(cutout(data))
    raise NeedChroma()


# ---------------------------------------------------------------- consignes

class Brief:
    """Construit les consignes à partir du bloc "character" de manifest.json."""

    def __init__(self, manifest):
        c = manifest.get("character", {})
        self.style = c.get("style", "")
        self.outfit = c.get("outfit", "")
        self.rules = c.get("rules", [])
        self.master_pose = c.get("master_pose", "standing, facing the viewer")
        self.poses = c.get("poses", {})

    def _common(self, age, appearance):
        who = f"the same {age}-year-old child as in the reference photos" if age else "the same child as in the reference photos"
        lines = [self.style, f"Draw {who}."]
        if appearance:
            lines.append(f"Written description of the child (use it together with the photos): {appearance}")
        if self.outfit:
            lines.append(f"Outfit: {self.outfit}.")
        lines += self.rules
        return lines

    def master(self, age, appearance):
        return "\n".join(self._common(age, appearance) + [
            f"Pose: {self.master_pose}.",
            "This image is the character reference used for every page of the book, so make it clean and faithful.",
        ])

    def pose(self, pose_id, age, appearance):
        pose = self.poses.get(pose_id, pose_id.replace("_", " "))
        return "\n".join([
            "The first reference image is the approved character of this book: keep exactly the same face, hair, "
            "skin tone, outfit, proportions and art style. The other reference image is a photo of the child for likeness.",
        ] + self._common(age, appearance) + [f"Pose: {pose}."])


DESCRIBE_PROMPT = """Tu prépares l'illustration d'un livre personnalisé pour enfant à partir de photos envoyées par un parent.
Réponds uniquement en JSON avec ces clés :
- "usable" (booléen) : vrai si au moins une photo montre clairement le visage d'un seul enfant, de face ou légèrement de trois-quarts, net et éclairé.
- "issues" (liste de phrases courtes en français, vouvoiement, adressées au parent) : problèmes à corriger, par exemple "Sur la photo 2, le visage est trop petit." Liste vide si tout va bien.
- "appearance" (une phrase en anglais) : l'apparence visible de l'enfant utile pour le dessiner ressemblant : cheveux (couleur, longueur, texture, coiffure), couleur des yeux, teint, forme du visage, lunettes, taches de rousseur ou autre signe visible.
Décris uniquement ce qui se voit. Ne devine ni l'identité, ni l'origine, ni la santé, ni aucune autre caractéristique sensible.
Si plusieurs personnes apparaissent, concentre-toi sur l'enfant le plus visible et signale-le dans "issues"."""


# ---------------------------------------------------------------- débit

class Throttle:
    """File d'attente des appels au modèle, avec priorité.

    Respecte le nombre d'images par minute du compte et le nombre d'appels simultanés.
    Priorité 0 = personnage principal d'un visiteur (passe devant), 1 = pages, 2 = version HD.
    Ainsi, même quand plusieurs visiteurs dessinent en même temps, chacun voit vite son enfant.
    """

    def __init__(self, concurrency=3, per_minute=5):
        import heapq
        self._heapq = heapq
        self.concurrency = max(1, concurrency)
        self.interval = 60.0 / max(1, per_minute)
        self.active = 0
        self.next_at = 0.0
        self.queue = []
        self.seq = 0
        self._wake = None
        self._pump_task = None

    def _event(self):
        if self._wake is None:
            self._wake = asyncio.Event()
        return self._wake

    def slot(self, priority=1):
        throttle = self

        class _Slot:
            async def __aenter__(self_inner):
                await throttle._acquire(priority)
                return self_inner

            async def __aexit__(self_inner, *exc):
                throttle._release()
        return _Slot()

    async def __aenter__(self):  # compatibilité : priorité normale
        await self._acquire(1)
        return self

    async def __aexit__(self, *exc):
        self._release()

    def _release(self):
        self.active -= 1
        self._event().set()

    async def _acquire(self, priority):
        fut = asyncio.get_running_loop().create_future()
        self.seq += 1
        self._heapq.heappush(self.queue, (priority, self.seq, fut))
        self._event().set()
        if self._pump_task is None or self._pump_task.done():
            self._pump_task = asyncio.create_task(self._pump())
        await fut

    async def _pump(self):
        ev = self._event()
        while self.queue:
            if self.active >= self.concurrency:
                ev.clear()
                await ev.wait()
                continue
            wait = self.next_at - time.monotonic()
            if wait > 0:
                await asyncio.sleep(wait)
                continue
            _, _, fut = self._heapq.heappop(self.queue)
            if fut.cancelled():
                continue
            self.active += 1
            self.next_at = time.monotonic() + self.interval
            fut.set_result(True)


# ---------------------------------------------------------------- fournisseurs

class OpenAIProvider:
    name = "openai"

    def __init__(self, throttle):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=env("OPENAI_API_KEY"), base_url=env("OPENAI_BASE_URL"), timeout=240, max_retries=0)
        self.model = env("OPENAI_IMAGE_MODEL", "gpt-image-1.5")
        self.vision_model = env("OPENAI_VISION_MODEL", "gpt-4.1-mini")
        self.size = env("IMAGE_SIZE", "1024x1536")
        self.throttle = throttle
        self.transparent_ok = True
        self.fidelity_ok = True

    async def describe(self, photos):
        content = [{"type": "text", "text": DESCRIBE_PROMPT}]
        for p in photos:
            content.append({"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(p).decode()}})
        try:
            r = await self.client.chat.completions.create(
                model=self.vision_model, messages=[{"role": "user", "content": content}],
                response_format={"type": "json_object"})
            return json.loads(r.choices[0].message.content)
        except Exception as exc:  # la vérification est un plus : on continue sans
            log.warning("vérification des photos indisponible (%s)", exc)
            return None

    async def draw(self, refs, prompt, quality, user=None, priority=1):
        import openai
        files = []
        for i, r in enumerate(refs):
            is_png = r[:4] == PNG_MAGIC
            files.append((f"ref{i}.{'png' if is_png else 'jpg'}", r, "image/png" if is_png else "image/jpeg"))
        for attempt in range(4):
            kwargs = dict(model=self.model, image=files, size=self.size, quality=quality, output_format="png", n=1)
            if self.transparent_ok:
                kwargs["background"] = "transparent"
                kwargs["prompt"] = prompt
            else:
                kwargs["background"] = "opaque"
                kwargs["prompt"] = prompt + "\n" + CHROMA_PROMPT
            if self.fidelity_ok:
                kwargs["input_fidelity"] = "high"
            if user:
                kwargs["user"] = user
            try:
                async with self.throttle.slot(priority):
                    r = await self.client.images.edit(**kwargs)
                data = base64.b64decode(r.data[0].b64_json)
                return finish(data, chroma_requested=not self.transparent_ok)
            except NeedChroma:
                log.warning("%s : fond rendu opaque, on redemande sur fond magenta", self.model)
                self.transparent_ok = False
                continue
            except openai.BadRequestError as exc:
                msg = str(exc).lower()
                if "input_fidelity" in msg and self.fidelity_ok:
                    log.warning("%s : input_fidelity refusé, on continue sans", self.model)
                    self.fidelity_ok = False
                    continue
                if ("background" in msg or "transparen" in msg) and self.transparent_ok:
                    log.warning("%s : fond transparent refusé, détourage local", self.model)
                    self.transparent_ok = False
                    continue
                if "moderation" in msg or "safety" in msg or "policy" in msg:
                    raise ProviderError(str(exc), "Ces photos n'ont pas pu être illustrées. Essayez une autre photo de face, bien éclairée, avec l'enfant seul.")
                raise ProviderError(str(exc))
            except openai.PermissionDeniedError as exc:
                if "verif" in str(exc).lower():
                    raise ProviderError(str(exc), "Compte OpenAI à vérifier : platform.openai.com > Settings > Organization > Verify Organization.") from exc
                raise ProviderError(str(exc), "Le service d'illustration est indisponible pour le moment.") from exc
            except openai.NotFoundError as exc:
                raise ProviderError(str(exc), f"Le modèle {self.model} n'est pas disponible sur ce compte OpenAI.") from exc
            except (openai.RateLimitError, openai.APITimeoutError, openai.APIConnectionError, openai.InternalServerError) as exc:
                if "insufficient_quota" in str(exc) or "billing" in str(exc).lower():
                    raise ProviderError(str(exc), "Crédit OpenAI épuisé : ajoutez du crédit sur platform.openai.com > Billing.") from exc
                delay = 6 * (attempt + 1) + random.random() * 3
                log.warning("appel image à reprendre dans %.0fs (%s)", delay, type(exc).__name__)
                await asyncio.sleep(delay)
            except openai.AuthenticationError as exc:
                raise ProviderError(str(exc), "Le service d'illustration est indisponible pour le moment.") from exc
        raise ProviderError("trop d'échecs", retryable=True)


class GeminiProvider:
    """Nano Banana (Gemini) via l'API REST. Pas de fond transparent : fond magenta puis détourage."""
    name = "gemini"

    def __init__(self, throttle):
        import httpx
        self.http = httpx.AsyncClient(timeout=240)
        self.key = env("GEMINI_API_KEY")
        self.model = env("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")
        self.base = env("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1")
        self.throttle = throttle

    async def describe(self, photos):
        return None

    async def draw(self, refs, prompt, quality, user=None, priority=1):
        parts = [{"text": prompt + "\n" + CHROMA_PROMPT}]
        for r in refs:
            mime = "image/png" if r[:4] == PNG_MAGIC else "image/jpeg"
            parts.append({"inline_data": {"mime_type": mime, "data": base64.b64encode(r).decode()}})
        body = {"contents": [{"parts": parts}],
                "generationConfig": {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": "2:3"}}}
        url = f"{self.base}/models/{self.model}:generateContent"
        for attempt in range(4):
            async with self.throttle.slot(priority):
                resp = await self.http.post(url, json=body, headers={"x-goog-api-key": self.key})
            if resp.status_code in (429, 500, 502, 503, 504):
                await asyncio.sleep(6 * (attempt + 1))
                continue
            if resp.status_code != 200:
                raise ProviderError(f"gemini {resp.status_code}: {resp.text[:300]}")
            for cand in resp.json().get("candidates", []):
                for part in cand.get("content", {}).get("parts", []):
                    inline = part.get("inlineData") or part.get("inline_data")
                    if inline and inline.get("data"):
                        return finish(base64.b64decode(inline["data"]), chroma_requested=True)
            raise ProviderError("gemini: aucune image", "Ces photos n'ont pas pu être illustrées. Essayez une autre photo de face, bien éclairée.")
        raise ProviderError("gemini: trop d'échecs", retryable=True)


class MockProvider:
    """Sans IA : renvoie des silhouettes pour tester tout le parcours gratuitement."""
    name = "mock"

    def __init__(self, throttle):
        self.throttle = throttle

    async def describe(self, photos):
        await asyncio.sleep(0.6)
        return {"usable": True, "issues": [], "appearance": "(mode test : pas d'analyse)"}

    async def draw(self, refs, prompt, quality, user=None, priority=1):
        async with self.throttle.slot(priority):
            await asyncio.sleep(float(env("MOCK_DELAY", "1.2")) * (0.6 + random.random() * 0.8))
        pose = "master"
        for line in prompt.splitlines():
            if line.startswith("Pose: "):
                pose = line[6:].strip().rstrip(".")
        key = MOCK_KEYS.get(pose, "master")
        return (MOCK_DIR / f"{key}.png").read_bytes()


MOCK_KEYS = {}


def make_provider(name, throttle, manifest):
    c = manifest.get("character", {})
    MOCK_KEYS.clear()
    MOCK_KEYS[c.get("master_pose", "")] = "master"
    for sp in manifest["spreads"]:
        MOCK_KEYS[c.get("poses", {}).get(sp["character_pose"], sp["character_pose"])] = sp["id"]
    if name == "openai":
        return OpenAIProvider(throttle)
    if name == "gemini":
        return GeminiProvider(throttle)
    return MockProvider(throttle)
