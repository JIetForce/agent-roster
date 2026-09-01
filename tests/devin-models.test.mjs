// tests/devin-models.test.mjs
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseModelCatalog } from "../scripts/lib/devin-models.mjs";

const catalog = parseModelCatalog(
  readFileSync("tests/fixtures/devin-models-list.txt", "utf8"),
);

describe("devin model catalog", () => {
  it("reads a free model", () => {
    assert.equal(catalog.get("swe-1-7").free, true);
    assert.equal(catalog.get("swe-1-7").label, "SWE-1.7 Max");
  });

  it("reads a priced model as not free", () => {
    assert.equal(catalog.get("swe-1-7-lightning").free, false);
  });

  it("does not mistake an alias line for a model", () => {
    assert.equal(catalog.has("aliases:"), false);
    assert.equal(catalog.has("swe"), false);
  });

  it("reads every model this repository pins", () => {
    for (const slug of ["glm-5-2", "swe-1-7"]) {
      assert.ok(catalog.has(slug), `catalog is missing ${slug}`);
    }
  });

  it("returns an empty Map for input with no model lines", () => {
    // `devin models list` can exit 0 and print an error body instead of a
    // catalogue — observed when the Devin free-tier quota is exhausted. The
    // body has no bracketed model rows, so the parser must contribute nothing.
    // The doctor's guard treats an empty Map the same as a thrown command, so
    // this pins the parser half of that contract.
    const errorBody = `Error: Agent error: Connection error, send a message to continue retrying (error id: abc123): {
  "cognition.ai/errorKind": "resource_exhausted",
  "cognition.ai/retryable": true
}
`;
    const empty = parseModelCatalog(errorBody);
    assert.equal(empty.size, 0);
  });
});
