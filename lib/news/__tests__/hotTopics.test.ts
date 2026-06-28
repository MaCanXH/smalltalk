import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanHeadline,
  decodeEntities,
  extractItemTitles,
  shortenHeadline,
} from "../hotTopics";

describe("cleanHeadline", () => {
  it("strips the trailing publisher", () => {
    assert.equal(
      cleanHeadline("Leaders meet in Geneva on climate funding - Reuters"),
      "Leaders meet in Geneva on climate funding"
    );
  });

  it("leaves a headline without a publisher untouched", () => {
    assert.equal(cleanHeadline("  City marathon  draws crowds "), "City marathon draws crowds");
  });
});

describe("shortenHeadline", () => {
  it("caps at 8 words with an ellipsis", () => {
    assert.equal(
      shortenHeadline("Global leaders gather in Geneva to discuss climate funding amid tensions"),
      "Global leaders gather in Geneva to discuss climate…"
    );
  });

  it("drops a trailing clause after a colon", () => {
    assert.equal(
      shortenHeadline("Markets rally: investors cheer the surprise rate decision today"),
      "Markets rally"
    );
  });

  it("keeps short headlines as-is", () => {
    assert.equal(shortenHeadline("City marathon draws crowds"), "City marathon draws crowds");
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    assert.equal(
      decodeEntities("Smith &amp; Co. say it&#39;s &#x201C;fine&#x201D;"),
      "Smith & Co. say it's “fine”"
    );
  });
});

describe("extractItemTitles", () => {
  it("pulls item titles (skipping the channel title) and decodes them", () => {
    const xml = `<rss><channel>
      <title>Top stories - Google News</title>
      <item><title>First story &amp; more - BBC</title><link>x</link></item>
      <item><title><![CDATA[Second story - CNN]]></title></item>
    </channel></rss>`;
    assert.deepEqual(extractItemTitles(xml), [
      "First story & more - BBC",
      "Second story - CNN",
    ]);
  });
});
