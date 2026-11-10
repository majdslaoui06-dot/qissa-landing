"""Focused checks for order notification delivery and attachments."""
import json
import io
import base64
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server import order_email


class OrderEmailTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.order_dir = self.root / "QM-2026-ABCDEF"
        (self.order_dir / "photos").mkdir(parents=True)
        self.order = {
            "ref": "QM-2026-ABCDEF", "enfant": "Samy", "histoire_nom": "Samy avec Momo",
            "age": None, "age_texte": "18 mois", "de_la_part_de": "Tonton",
            "message": "Pour toi", "offre": "livre", "prix": 195,
            "livraison": 35, "total": 230,
            "client": {"nom": "", "telephone": "+212612345678", "ville": "Rabat", "adresse": ""},
            "photos": ["enfant-1.jpg", "doudou-1.jpg"],
        }
        (self.order_dir / "order.json").write_text(json.dumps(self.order), encoding="utf-8")
        for name in self.order["photos"]:
            (self.order_dir / "photos" / name).write_bytes(b"example-photo")
        order_email.enqueue(self.order_dir)

    def test_sends_all_order_details_and_both_photos_once(self):
        calls = []

        def fake_send(_key, _sender, _recipient, order, group, part, parts):
            calls.append((order, [photo.name for photo in group], part, parts))
            return "email-id"

        with patch.object(order_email, "_send", side_effect=fake_send):
            self.assertEqual(order_email.send_pending(self.root, "key", "Qissa <commandes@qissamagic.com>", "majdslaoui06@gmail.com"), 1)
            self.assertEqual(order_email.send_pending(self.root, "key", "Qissa <commandes@qissamagic.com>", "majdslaoui06@gmail.com"), 0)
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][1], self.order["photos"])
        body = order_email._body(self.order, self.order["photos"], 1, 1)
        for text in ("18 mois", "Tonton", "Pour toi", "+212612345678", "Rabat", "230 DH"):
            self.assertIn(text, body)
        self.assertEqual(json.loads((self.order_dir / order_email.STATUS_FILE).read_text())["state"], "sent")

    def test_failure_keeps_notification_for_retry(self):
        with patch.object(order_email, "_send", side_effect=TimeoutError):
            self.assertEqual(order_email.send_pending(self.root, "key", "sender", "recipient"), 0)
        state = json.loads((self.order_dir / order_email.STATUS_FILE).read_text())
        self.assertEqual(state["state"], "pending")
        self.assertGreater(state["next_attempt"], 0)

    def test_no_credentials_does_not_send(self):
        with patch.object(order_email, "_send") as send:
            self.assertEqual(order_email.send_pending(self.root, "", "sender", "recipient"), 0)
            send.assert_not_called()

    def test_api_request_contains_photo_files_and_recipient(self):
        captured = []

        def fake_urlopen(req, timeout):
            captured.append((req, timeout))
            return io.BytesIO(b'{"id":"email-id"}')

        group = [self.order_dir / "photos" / name for name in self.order["photos"]]
        with patch.object(order_email.request, "urlopen", side_effect=fake_urlopen):
            order_email._send("secret", "Qissa <commandes@qissamagic.com>", "majdslaoui06@gmail.com", self.order, group, 1, 1)
        req, _ = captured[0]
        payload = json.loads(req.data)
        self.assertEqual(payload["to"], ["majdslaoui06@gmail.com"])
        self.assertEqual([a["filename"] for a in payload["attachments"]], self.order["photos"])
        self.assertEqual(base64.b64decode(payload["attachments"][0]["content"]), b"example-photo")
        self.assertEqual(req.get_header("Idempotency-key"), "qissa-order-QM-2026-ABCDEF-part-1")


if __name__ == "__main__":
    unittest.main()
