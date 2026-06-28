import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeVapiConversation } from "../vapiTranscript";

describe("normalizeVapiConversation", () => {
  it("rebuilds the full dialog from the messages array with secondsFromStart", () => {
    assert.deepEqual(
      normalizeVapiConversation({
        type: "conversation-update",
        messages: [
          { role: "system", message: "You are a partner." },
          { role: "bot", message: "How was your weekend?", secondsFromStart: 1.2 },
          { role: "user", message: "Pretty good, I went hiking.", secondsFromStart: 4.8 },
        ],
      }),
      [
        { speaker: "ai", text: "How was your weekend?", t: 1.2 },
        { speaker: "user", text: "Pretty good, I went hiking.", t: 4.8 },
      ]
    );
  });

  it("falls back to the OpenAI conversation array when messages is absent", () => {
    assert.deepEqual(
      normalizeVapiConversation({
        type: "conversation-update",
        conversation: [
          { role: "assistant", content: "Newest text" },
          { role: "user", content: "And mine" },
        ],
      }),
      [
        { speaker: "ai", text: "Newest text", t: 0 },
        { speaker: "user", text: "And mine", t: 0 },
      ]
    );
  });

  it("derives offsets from `time` relative to the first timestamped entry", () => {
    assert.deepEqual(
      normalizeVapiConversation({
        type: "conversation-update",
        messages: [
          { role: "bot", message: "First", time: 1000 },
          { role: "user", message: "Second", time: 3500 },
        ],
      }),
      [
        { speaker: "ai", text: "First", t: 0 },
        { speaker: "user", text: "Second", t: 2.5 },
      ]
    );
  });

  it("skips malformed, empty, and unsupported-role entries", () => {
    assert.deepEqual(
      normalizeVapiConversation({
        type: "conversation-update",
        messages: [
          null,
          { role: "tool_calls", message: "{}" },
          { role: "user", message: "   " },
          { role: "user", message: "Real line", secondsFromStart: 2 },
        ],
      }),
      [{ speaker: "user", text: "Real line", t: 2 }]
    );
  });

  it("ignores non conversation-update messages", () => {
    assert.equal(
      normalizeVapiConversation({
        type: "transcript",
        role: "user",
        transcript: "Hi",
      }),
      null
    );
  });
});
