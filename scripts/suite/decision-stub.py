"""
A decision model, for `decision-run-check.mjs`.

The run the check is about happens on the server, which calls the decision
model itself - so like `image-stub.py` this cannot live in the browser: a stub
in the page would be a check of the stub.

It answers the API Jev and Laya share, in TypeSafe's documented shapes
(https://docs.typesafe.ai/api): `GET /v1/models` lists `jev-latest`, and
`POST /v1/systemone` answers every choice question with the first of its
options that appears in the state - or its first option, when none does - at a
confidence of 0.9, every score at its top level, and every noul at 0.8.

Python because there is no Node on the machine this is run from and the server
is on the host beside it. Started by hand:

    python scripts/suite/decision-stub.py 8197

and pointed at with ORKNUX_DECISION_STUB.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer


def answer(state, question):
    kind = question.get("type")
    criteria = question.get("criteria") or {}
    if kind == "choice":
        options = list(criteria.keys()) if isinstance(criteria, dict) else list(criteria)
        said = json.dumps(state).lower()
        picked = next((one for one in options if one.lower() in said), options[0] if options else "")
        rest = (1 - 0.9) / max(1, len(options) - 1)
        return {
            "type": "choice",
            "choice": picked,
            "confidence": 0.9,
            "probabilities": {one: (0.9 if one == picked else rest) for one in options},
        }
    if kind == "score":
        levels = list(criteria)
        top = len(levels) - 1
        return {
            "type": "score",
            "score": float(top),
            "confidence": 0.9,
            "legend": {str(n): level for n, level in enumerate(levels)},
            "probabilities": {str(n): (0.9 if n == top else 0.1 / max(1, top)) for n in range(len(levels))},
        }
    return {"type": "noul", "noul": 0.8}


class Decides(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.rstrip("/").endswith("/v1/models"):
            self.reply(200, {"data": [{"id": "jev-latest", "description": "stub"}]})
            return
        self.reply(404, {"detail": "Not Found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        asked = json.loads(self.rfile.read(length) or b"{}")
        if not self.path.rstrip("/").endswith("/v1/systemone"):
            self.reply(404, {"detail": "Not Found"})
            return
        sys.stderr.write("asked: %s\n" % json.dumps(asked)[:300])
        state = asked.get("state")
        answers = {key: answer(state, question) for key, question in (asked.get("questions") or {}).items()}
        self.reply(200, {"model": "jev-stub", "answers": answers, "usage": {"input_tokens": 12, "output_tokens": 0}})

    def reply(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8197
    HTTPServer(("0.0.0.0", port), Decides).serve_forever()
