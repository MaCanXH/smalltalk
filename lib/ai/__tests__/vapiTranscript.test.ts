import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getTranscriptKey,
  getVapiTranscriptIdentityKey,
  normalizeVapiTranscriptMessage,
} from "../vapiTranscript";

describe("normalizeVapiTranscriptMessage", () => {
  it("keeps final user transcript messages", () => {
    assert.deepEqual(
      normalizeVapiTranscriptMessage({
        type: "transcript",
        transcriptType: "final",
        role: "user",
        transcript: "I went for brunch this weekend.",
      }),
      { speaker: "user", text: "I went for brunch this weekend." }
    );
  });

  it("keeps final assistant transcript messages", () => {
    assert.deepEqual(
      normalizeVapiTranscriptMessage({
        type: "transcript",
        transcriptType: "final",
        role: "assistant",
        transcript: "That sounds like a great weekend.",
      }),
      { speaker: "ai", text: "That sounds like a great weekend." }
    );
  });

  it("ignores partial transcript messages", () => {
    assert.equal(
      normalizeVapiTranscriptMessage({
        type: "transcript",
        transcriptType: "partial",
        role: "user",
        transcript: "I went",
      }),
      null
    );
  });

  it("ignores non-transcript messages", () => {
    assert.equal(
      normalizeVapiTranscriptMessage({
        type: "status-update",
        status: "started",
      }),
      null
    );
  });

  it("supports conversation-update messages with one final newest entry", () => {
    assert.deepEqual(
      normalizeVapiTranscriptMessage({
        type: "conversation-update",
        conversation: [
          { role: "user", content: "Older text" },
          { role: "assistant", content: "Newest text" },
        ],
      }),
      { speaker: "ai", text: "Newest text" }
    );
  });

  it("does not fall back to older conversation entries", () => {
    assert.equal(
      normalizeVapiTranscriptMessage({
        type: "conversation-update",
        conversation: [
          { role: "user", content: "Older valid text" },
          { role: "system", content: "Newest unsupported text" },
        ],
      }),
      null
    );
  });

  it("does not skip malformed newest conversation entries", () => {
    assert.equal(
      normalizeVapiTranscriptMessage({
        type: "conversation-update",
        conversation: [{ role: "user", content: "Older valid text" }, null],
      }),
      null
    );
  });
});

describe("getTranscriptKey", () => {
  it("creates stable duplicate keys", () => {
    assert.equal(
      getTranscriptKey({ speaker: "user", text: "  Hello there  " }),
      "user:hello there"
    );
  });
});

describe("getVapiTranscriptIdentityKey", () => {
  it("uses Vapi message identity when present", () => {
    const turn = { speaker: "user" as const, text: "  Yes  " };

    assert.equal(
      getVapiTranscriptIdentityKey(
        { type: "transcript", id: "msg_1", role: "user", transcript: "Yes" },
        turn
      ),
      "user:yes:msg_1"
    );
  });

  it("uses the newest conversation entry identity", () => {
    const turn = { speaker: "ai" as const, text: "Yes" };

    assert.equal(
      getVapiTranscriptIdentityKey(
        {
          type: "conversation-update",
          conversation: [
            { role: "user", id: "old", content: "Older" },
            { role: "assistant", id: "new", content: "Yes" },
          ],
        },
        turn
      ),
      "ai:yes:new"
    );
  });

  it("does not invent an identity from text alone", () => {
    assert.equal(
      getVapiTranscriptIdentityKey(
        { type: "transcript", role: "user", transcript: "Yes" },
        { speaker: "user", text: "Yes" }
      ),
      null
    );
  });
});
