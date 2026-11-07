type PreparationDetails = {
  estimateModelVersion?: string | null;
  estimateFallback?: boolean;
  messages?: readonly { kind: string }[];
};

export function preparationExplanation(details: PreparationDetails): string {
  if (details.messages?.some((message) => message.kind.startsWith("OVERRIDE_"))) {
    return "The outlet manager updated this preparation time.";
  }

  const version = details.estimateModelVersion || "";
  const demo = version.startsWith("demo-ridge-prep-v1:") || version.startsWith("demo-rules-v1:");
  if (details.estimateFallback === false) {
    if (version.startsWith("demo-ridge-prep-v1:")) {
      return "Demo estimate learned from sample kitchen orders and adjusted for the current kitchen load.";
    }
    if (version.startsWith("ridge-prep-v1:")) {
      return "Learned from this kitchen’s completed orders and adjusted for the current kitchen load.";
    }
  }

  if (version === "rules-v1:invalid-input" || version === "demo-rules-v1:invalid-input") {
    return demo ? "Using a fallback preparation estimate for this demo order." : "Using a fallback preparation estimate for this order.";
  }
  return demo
    ? "Demo estimate based on your dishes and current kitchen load."
    : "Based on your dishes and current kitchen load.";
}
