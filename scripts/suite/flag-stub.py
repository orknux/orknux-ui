"""
A model that flags the conversation it is in, for `flags-report-check.mjs` and
`flag-hidden-check.mjs`.

A flag is raised by an agent calling `flag_session`, and the agent's model is
the only thing that calls it - so like `message-stub.py` this cannot live in the
browser: what is being checked is a flag the *server* recorded and then kept
from the person, and a stub in the page would be a check of the stub.

Three rounds, told apart by how many tool results the request carries, so two
runs cannot interfere and a restart between them changes nothing:

  * None yet: it flags. The person's message says how - `FLAG <type>
    <severity> <note>` - and the call carries exactly that, with a remark beside
    it about flagging, the way a model writes one; both must stay out of sight.
  * One: it looks the time up with `current_time`, beside a remark of its own,
    so the chat has an ordinary call to draw where the flag is not.
  * Two or more: it answers.

A request with no tools is anything else the server asks of a chat model - a
title - and gets a word back.

Plain JSON, never a stream: a provider may answer a streaming request with one
ordinary body, and the server asks again without streaming when a stream
carried nothing - see AGENTS.md on `stream: true`.

Python because there is no Node on the machine this is run from and the server
is on the host beside it. Started by hand:

    python scripts/suite/flag-stub.py 8196

and pointed at with ORKNUX_FLAG_STUB.
"""

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# What the model writes beside the flag. The checks assert it is drawn nowhere.
REMARK = "I will flag this conversation for the administrators."
# Beside the lookup, which is drawn.
ASIDE = "Let me check the time."
ANSWER = "I cannot share that. It is late, though."
# What every note the stub flags with starts with.
NOTED = "Probe noted: "

DIRECTIVE = re.compile(r"FLAG\s+(\S+)\s+(\d)\s+(.+)", re.S)


def message(content, calls=None):
    said = {"role": "assistant", "content": content}
    if calls:
        said["tool_calls"] = calls
    return {
        "id": "stub",
        "object": "chat.completion",
        "choices": [{"index": 0, "message": said, "finish_reason": "tool_calls" if calls else "stop"}],
        "usage": {"prompt_tokens": 9, "completion_tokens": 4, "total_tokens": 13},
    }


def call(ident, name, arguments):
    return {"id": ident, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


def answer(body):
    if not body.get("tools"):
        return message("Flag check")
    messages = body.get("messages") or []
    answered = sum(1 for one in messages if one.get("role") == "tool")
    if answered >= 2:
        return message(ANSWER)
    if answered == 1:
        return message(ASIDE, [call("call_time", "current_time", {})])
    asked = next((text_of(one.get("content")) for one in reversed(messages) if one.get("role") == "user"), "")
    found = DIRECTIVE.search(asked)
    kind, severity, note = (found.group(1), int(found.group(2)), found.group(3).strip()) if found else ("security", 1, asked.strip())
    # Marked, so a check can tell the note the agent wrote from the message the person typed.
    return message(REMARK, [call("call_flag", "flag_session", {"type": kind, "severity": severity, "note": NOTED + note})])


class Flags(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if self.path.rstrip("/").endswith("/models"):
            self.reply(200, {"object": "list", "data": [{"id": "stub-flag", "object": "model"}]})
            return
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            self.reply(400, {"error": "not JSON"})
            return
        if not self.path.rstrip("/").endswith("/chat/completions"):
            self.reply(404, {"error": "not found"})
            return
        self.reply(200, answer(body))

    def reply(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8196
    ThreadingHTTPServer(("0.0.0.0", port), Flags).serve_forever()
