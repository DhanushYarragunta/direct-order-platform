import { describe, expect, it } from "vitest";
import { preparationExplanation } from "../src/lib/preparation-explanation";

describe("preparation estimate explanations", () => {
  it("identifies sample learning without implying real kitchen history", () => {
    const explanation = preparationExplanation({ estimateModelVersion: "demo-ridge-prep-v1:abc123", estimateFallback: false });
    expect(explanation).toContain("Demo estimate learned from sample kitchen orders");
    expect(explanation).toContain("current kitchen load");
    expect(explanation).not.toContain("this kitchen’s completed orders");
  });

  it("attributes an accepted live model to the outlet's completed orders", () => {
    const explanation = preparationExplanation({ estimateModelVersion: "ridge-prep-v1:abc123", estimateFallback: false });
    expect(explanation).toContain("this kitchen’s completed orders");
    expect(explanation).not.toMatch(/demo|sample/i);
  });

  it.each(["rules-v1:insufficient-history", "rules-v1:validation-gate", "demo-rules-v1:outside-observed-load"])(
    "does not describe the fallback %s as learned", (version) => {
      const explanation = preparationExplanation({ estimateModelVersion: version, estimateFallback: true });
      expect(explanation).toContain("your dishes and current kitchen load");
      expect(explanation).not.toMatch(/learned|completed orders/);
      expect(explanation.startsWith("Demo")).toBe(version.startsWith("demo-"));
    },
  );

  it.each([
    { estimateModelVersion: "demo-ridge-prep-v1:abc123", estimateFallback: true },
    { estimateModelVersion: "ridge-prep-v1:abc123", estimateFallback: true },
    { estimateModelVersion: "ridge-prep-v1:abc123" },
    { estimateModelVersion: "ridge-prep-v10:abc123", estimateFallback: false },
    { estimateModelVersion: null, estimateFallback: false },
    {},
  ])("avoids a learning claim for missing, unfamiliar or conflicting metadata: %j", (details) => {
    expect(preparationExplanation(details)).not.toMatch(/learned|completed orders/i);
  });

  it.each(["rules-v1:invalid-input", "demo-rules-v1:invalid-input"])(
    "does not claim to have used kitchen load when inputs were invalid: %s", (version) => {
      const explanation = preparationExplanation({ estimateModelVersion: version, estimateFallback: true });
      expect(explanation).toContain("fallback preparation estimate");
      expect(explanation).not.toMatch(/current kitchen load|learned/);
    },
  );

  it.each(["demo-ridge-prep-v1:abc123", "ridge-prep-v1:abc123", "rules-v1:insufficient-history"])(
    "attributes an override to the manager regardless of original model: %s", (version) => {
      const explanation = preparationExplanation({
        estimateModelVersion: version, estimateFallback: false,
        messages: [{ kind: "PLACED" }, { kind: "OVERRIDE_2" }, { kind: "LATE" }],
      });
      expect(explanation).toContain("outlet manager updated");
      expect(explanation).not.toMatch(/learned|kitchen load|fallback/);
    },
  );

  it("keeps the model explanation for ordinary status updates", () => {
    const explanation = preparationExplanation({ estimateModelVersion: "demo-ridge-prep-v1:abc123", estimateFallback: false,
      messages: [{ kind: "PLACED" }, { kind: "PREPARING" }, { kind: "LATE" }] });
    expect(explanation).toContain("Demo estimate learned from sample kitchen orders");
  });
});
