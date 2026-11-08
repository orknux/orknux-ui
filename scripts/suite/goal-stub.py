"""
A model that works on a goal and a reviewer that judges it, for `chat-goal-check.mjs`.

The check is that `/goal` typed into a chat starts the server's loop - a turn of
the chat's agent, then a review - and that the line under the conversation
follows it to the end. Neither half can be stubbed in the browser: the turns and
the review are calls the *server* makes.

Told apart by what is in the request, never by a counter here, so two runs
cannot interfere:

  * A request carrying the reviewer's instructions is a review. The first
    review of a goal - its request says "Iteration 1 of" - is not met, with
    feedback the worker's next turn must carry; any later one is met.
  * Anything else is the agent's turn. It answers plainly, and says whether it
    was handed the feedback, which is what the check reads off the chat.

Plain JSON rather than a stream: a provider may answer a streaming call with one
ordinary body, and the server copes - see AGENTS.md.

Python because there is no Node on the machine this is run from. Started by hand:

    python scripts/suite/goal-stub.py 8193

and pointed at with ORKNUX_GOAL_STUB.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

REVIEWER = "You review another agent's work"
FEEDBACK = "Give it a third line."


class Works(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8", "replace")
        if REVIEWER in body:
            if "Iteration 1 of" in body:
                said = json.dumps({"met": False, "feedback": FEEDBACK})
            else:
                said = json.dumps({"met": True, "feedback": "Three lines, as asked."})
        elif FEEDBACK in body:
            said = "Old pond / a frog jumps in / the sound of water."
        else:
            said = "Old pond / a frog jumps in."
        payload = json.dumps({
            "choices": [{"message": {"role": "assistant", "content": said}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 20, "completion_tokens": 10},
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        payload = json.dumps({"data": [{"id": "stub-goal"}]}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8193
    ThreadingHTTPServer(("0.0.0.0", port), Works).serve_forever()
