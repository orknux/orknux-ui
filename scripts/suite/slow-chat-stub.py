"""
A chat model that thinks for a long time before it answers, for
`chat-leave-return-check.mjs`.

Issue #201: somebody sends a message, leaves the page while the model is still
thinking, and comes back. What that check asserts is about the *server* going on
with a turn nobody is reading, so the model has to be one the server calls - a
stub in the page would be a check of the stub - and it has to take long enough
that there is a "while it is thinking" to leave in.

It answers the OpenAI-compatible chat-completions shape, streamed, with
`reasoning_content` deltas spread over [THINK_SECONDS] and then the answer in a
few pieces. The answer carries [ANSWER], which is what the check looks for on
the page when it comes back. Stateless, and threaded, so two turns at once - or a
provider check beside a turn - cannot hold each other up.

Python because there is no Node on the machine this is run from and the server is
on the host beside it. Started by hand:

    python scripts/suite/slow-chat-stub.py 8197

and pointed at with ORKNUX_SLOW_CHAT_STUB. A second argument changes how many
seconds it thinks for, for a check that only needs some model to answer.
"""

import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Long enough to leave the page, wait, and come back while it is still going.
THINK_SECONDS = 20.0
THINK_FRAMES = 40

# What the answer says, so the page can be searched for it.
ANSWER = "The slow answer has arrived, and it was kept while nobody was reading."

REASONING = (
    "This needs some careful thought before I say anything at all, so I will "
    "turn it over a few times, consider what was really asked, and only then "
    "write the answer down. "
)


def pieces(text, into):
    size = max(1, len(text) // into)
    return [text[at:at + size] for at in range(0, len(text), size)]


class Slow(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length)
        if not self.path.endswith("/chat/completions"):
            self.send_error(404)
            return
        sys.stderr.write("turn: thinking for %.0fs\n" % THINK_SECONDS)

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()

        for piece in pieces(REASONING * 2, THINK_FRAMES):
            if not self.frame({"choices": [{"delta": {"reasoning_content": piece}}]}):
                sys.stderr.write("turn: hung up on while thinking\n")
                return
            time.sleep(THINK_SECONDS / THINK_FRAMES)
        for piece in pieces(ANSWER, 4):
            if not self.frame({"choices": [{"delta": {"content": piece}}]}):
                sys.stderr.write("turn: hung up on while answering\n")
                return
            time.sleep(0.2)
        self.frame({"choices": [{"delta": {}, "finish_reason": "stop"}],
                    "usage": {"prompt_tokens": 40, "completion_tokens": 20}})
        self.write("data: [DONE]\n\n")
        sys.stderr.write("turn: answered in full\n")

    def do_GET(self):
        payload = json.dumps({"data": [{"id": "stub-slow"}]}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def frame(self, body):
        return self.write("data: %s\n\n" % json.dumps(body))

    def write(self, text):
        try:
            self.wfile.write(text.encode("utf-8"))
            self.wfile.flush()
            return True
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return False

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8197
    if len(sys.argv) > 2:
        THINK_SECONDS = float(sys.argv[2])
    sys.stderr.write("slow chat on %d\n" % port)
    ThreadingHTTPServer(("0.0.0.0", port), Slow).serve_forever()
