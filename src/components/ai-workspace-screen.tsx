"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BrainCircuit, Clock3, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import { request } from "@/lib/client";
import type { AIWorkspaceData, AIScenarioResult } from "@/lib/ai-workspace";
import type { AIScenario } from "@/lib/automation-preview";
import { useApp } from "./provider";
import { Empty, ErrorNotice, Loading } from "./ui";
import "./ai-workspace.css";

const scenarios = ["Current kitchen", "Busy kitchen", "Limited history", "Unusual load", "Ten minutes late", "Manager override"] as const;
type ScenarioName = typeof scenarios[number];
const inputFields = [
  { key: "workMinutes", label: "Order workload", unit: "minutes of preparation work", min: 1, max: 5000, step: "any" },
  { key: "queueWork", label: "Queued workload", unit: "minutes across active orders", min: 0, max: 1000000, step: "any" },
  { key: "stations", label: "Active stations", unit: "staffed preparation stations", min: 1, max: 100, step: "1" },
  { key: "minimum", label: "Kitchen minimum", unit: "minimum promised minutes", min: 1, max: 180, step: "1" },
  { key: "hour", label: "Hour of day (IST)", unit: "0 to 23.99; 19.5 means 7:30 PM", min: 0, max: 23.99, step: "any" },
] as const;

function minutes(value: number | null) {
  return value === null ? "Not evaluated" : `${Number.isInteger(value) ? value : value.toFixed(1)} min`;
}

export function AIWorkspaceScreen() {
  const app = useApp();
  const allowed = ["ADMIN", "MANAGER"].includes(app.user?.role || "");
  const [outletId, setOutletId] = useState("");
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<AIWorkspaceData | null>(null);
  const [draft, setDraft] = useState<AIScenario | null>(null);
  const [result, setResult] = useState<AIScenarioResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [scenarioError, setScenarioError] = useState("");
  const [scenarioName, setScenarioName] = useState<string>("Current kitchen");
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const retryScenario = useRef<{ input: AIScenario; name: string } | null>(null);

  useEffect(() => {
    const token = ++generation.current;
    activeRequest.current?.abort();
    setBusy(false);
    setResult(null);
    setDraft(null);
    setScenarioError("");
    setLoadError("");
    retryScenario.current = null;
    if (!app.authReady || !allowed) {
      setLoading(false);
      setData(null);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    const timeout = setTimeout(() => controller.abort(), 30000);
    request<AIWorkspaceData>(`/api/staff/ai${outletId ? `?outlet=${encodeURIComponent(outletId)}` : ""}`, "GET", undefined, controller.signal)
      .then((value) => {
        if (token !== generation.current) return;
        setData(value);
        setDraft(value.evaluation.input);
        setResult(value.evaluation);
        setScenarioName("Current kitchen");
      })
      .catch((error: Error) => {
        if (token !== generation.current) return;
        setLoadError(controller.signal.aborted ? "The kitchen snapshot took too long to load. Please try again." : error.message);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (token === generation.current) setLoading(false);
      });
    return () => {
      ++generation.current;
      clearTimeout(timeout);
      activeRequest.current?.abort();
    };
  }, [app.authReady, app.user?.id, app.user?.role, allowed, outletId, reload]);

  function changeDraft(next: AIScenario) {
    ++generation.current;
    activeRequest.current?.abort();
    setDraft(next);
    setResult(null);
    setScenarioName("Custom scenario");
    setScenarioError("");
    retryScenario.current = null;
  }

  async function evaluate(input: AIScenario, name: string) {
    const token = ++generation.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    retryScenario.current = { input, name };
    setDraft(input);
    setResult(null);
    setScenarioName(name);
    setScenarioError("");
    setBusy(true);
    try {
      const value = await request<AIScenarioResult>("/api/staff/ai", "POST", input, controller.signal);
      if (token === generation.current) setResult(value);
    } catch (error) {
      if (token === generation.current) setScenarioError(controller.signal.aborted
        ? "The scenario took too long to evaluate. Please try again." : (error as Error).message);
    } finally {
      clearTimeout(timeout);
      if (token === generation.current) setBusy(false);
    }
  }

  function chooseScenario(name: ScenarioName) {
    if (!data) return;
    const current = data.evaluation;
    const input: AIScenario = { ...current.input, inputs: { ...current.input.inputs } };
    if (name === "Busy kitchen") Object.assign(input.inputs, { queueWork: 250, workMinutes: 80, stations: 4 });
    if (name === "Limited history") input.history = "limited";
    if (name === "Unusual load") input.inputs.queueWork = 10000;
    if (name === "Ten minutes late") input.elapsedMinutes = current.prediction.minutes + 10;
    if (name === "Manager override") {
      input.elapsedMinutes = 10;
      input.overrideMinutes = Math.max(input.inputs.minimum, 45);
    }
    void evaluate(input, name);
  }

  if (!app.authReady) return <Loading />;
  if (!allowed) return <div className="page"><Empty title="Management access required">
    <p>AI scenarios are available to restaurant administrators and outlet managers.</p>
    <Link className="button secondary" href={app.user ? "/workspace" : "/login?next=/workspace/ai"}>{app.user ? "Open workspace" : "Sign in"}</Link>
  </Empty></div>;

  const disabled = loading || busy;
  const learned = !!result && !result.prediction.fallback && result.prediction.modelVersion.startsWith("demo-ridge-prep-v1:");
  const samples = result ? result.input.history === "full" ? result.dataset.sampleCount : result.prediction.trainingSamples : 0;

  return <div className="page ai-workspace-page">
    <div className="ai-page-heading">
      <div><p className="eyebrow">KITCHEN INTELLIGENCE</p><h1>AI & automation</h1>
        <p className="page-description">Explore preparation estimates and the safeguards around them.</p></div>
      <span className="ai-demo-badge"><BrainCircuit size={17} /> Scenario preview</span>
    </div>
    <div className="ai-preview-note"><ShieldCheck size={21} /><p>These scenarios use synthetic kitchen examples. Previews create no orders or messages. Actual order updates remain in each order’s tracking page.</p></div>

    <div className="ai-toolbar">
      <label>Kitchen<select value={outletId || data?.outletId || ""} disabled={disabled || !data} onChange={(event) => {
        ++generation.current; activeRequest.current?.abort(); setResult(null); setDraft(null); setOutletId(event.target.value);
      }}>
        {!data && <option value="">Loading kitchens…</option>}
        {data?.outlets.map((outlet) => <option value={outlet.id} key={outlet.id}>{outlet.name}</option>)}
      </select></label>
      <button className="button secondary" disabled={disabled} onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} /> Refresh kitchen</button>
      {data && !loading && !loadError && <p className="ai-snapshot">{data.queuedOrders} active {data.queuedOrders === 1 ? "order" : "orders"} · {minutes(data.evaluation.input.inputs.queueWork)} queued work<br />
        <small>Snapshot at {new Date(data.checkedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST · sample order workload</small></p>}
    </div>
    {loadError && <ErrorNotice message={loadError} retry={() => setReload((value) => value + 1)} />}
    {loading ? <Loading /> : !loadError && data && draft ? <>
      <section className="ai-scenarios" aria-labelledby="ai-scenarios-heading">
        <h2 id="ai-scenarios-heading">Try a scenario</h2>
        <div className="ai-scenario-buttons" role="group" aria-label="AI scenarios">{scenarios.map((name) => <button key={name} type="button"
          className={`ai-scenario-button ${scenarioName === name ? "selected" : ""}`} aria-pressed={scenarioName === name}
          disabled={disabled} onClick={() => chooseScenario(name)}>{name}</button>)}</div>
      </section>

      <div className="ai-workbench">
        <form className="panel ai-input-panel" onSubmit={(event) => { event.preventDefault(); void evaluate(draft, "Custom scenario"); }}>
          <h2>Kitchen inputs</h2><p className="ai-section-description">Change the scenario values, then evaluate the result.</p>
          <fieldset disabled={disabled}>
            <div className="ai-input-grid">{inputFields.map((field) => <label key={field.key}>{field.label}
              <input type="number" required min={field.min} max={field.max} step={field.step} value={Number.isFinite(draft.inputs[field.key]) ? draft.inputs[field.key] : ""}
                onChange={(event) => changeDraft({ ...draft, inputs: { ...draft.inputs, [field.key]: event.target.value === "" ? NaN : Number(event.target.value) } })} />
              <small>{field.unit}</small>
            </label>)}
              <label>Available history<select value={draft.history} onChange={(event) => changeDraft({ ...draft, history: event.target.value as AIScenario["history"] })}>
                <option value="full">Full sample history ({data.evaluation.dataset.sampleCount})</option><option value="limited">Limited history (20)</option>
              </select><small>Synthetic examples only</small></label>
              <label>Elapsed since confirmation<input type="number" required min={0} max={1100000} step={1} value={Number.isFinite(draft.elapsedMinutes) ? draft.elapsedMinutes : ""}
                onChange={(event) => changeDraft({ ...draft, elapsedMinutes: event.target.value === "" ? NaN : Number(event.target.value) })} /><small>Minutes elapsed in this preview</small></label>
              <label>Manager override<input type="number" min={Number.isFinite(draft.inputs.minimum) ? draft.inputs.minimum : 1} max={180} step={1} value={draft.overrideMinutes ?? ""} placeholder="No override"
                onChange={(event) => changeDraft({ ...draft, overrideMinutes: event.target.value === "" ? null : Number(event.target.value) })} /><small>Minutes from now; blank keeps the estimate</small></label>
            </div>
            <button className="button primary ai-evaluate-button" type="submit">{busy ? "Evaluating…" : "Evaluate scenario"}<ArrowRight size={17} /></button>
          </fieldset>
        </form>

        <section className="panel ai-result-panel" role="region" aria-label="Estimate result" aria-busy={busy}>
          <div className="ai-result-heading"><h2 id="ai-result-heading">Preparation preview</h2><Clock3 size={21} /></div>
          {scenarioError && <ErrorNotice message={scenarioError} retry={() => {
            if (retryScenario.current) void evaluate(retryScenario.current.input, retryScenario.current.name);
          }} />}
          {busy ? <Loading /> : result ? <>
            <div className={`ai-estimate-state ${learned ? "learned" : "fallback"}`}>{learned ? "Learned demo estimate" : "Kitchen-load fallback"}</div>
            <div className="ai-estimate-number"><strong>{result.prediction.minutes}</strong><span>minutes preparation</span></div>
            <p className="ai-result-description">{learned ? "Learned from sample kitchen orders and adjusted for this scenario’s workload." : result.fallbackReason || "The kitchen-load formula provides this estimate."}</p>
            <dl className="ai-promise-metrics">
              <div><dt>Kitchen minimum</dt><dd>{minutes(result.input.inputs.minimum)}</dd></div>
              <div><dt>Remaining wait</dt><dd>{minutes(result.automation.remainingMinutes)}</dd></div>
              <div><dt>Elapsed in preview</dt><dd>{minutes(result.input.elapsedMinutes)}</dd></div>
              <div><dt>Promise from confirmation</dt><dd>{minutes(result.automation.promisedMinutes)}</dd></div>
            </dl>
            <p className="ai-floor-note"><ShieldCheck size={16} /> The promise never goes below the kitchen minimum.</p>
            {result.automation.overrideApplied && <p className="ai-override-note">Manager override preview: {result.input.overrideMinutes} minutes from now. The updated promise is shown above.</p>}
            <div className={`ai-alert-preview ${result.automation.managerAlert ? "late" : ""}`}>
              <strong>{result.automation.managerAlert ? "Manager alert preview" : "No late alert in this scenario"}</strong>
              <p>{result.automation.managerAlert ? `${result.automation.lateByMinutes} minutes past the promise: preview a manager alert and customer update below.`
                : result.automation.lateByMinutes > 0 ? `${result.automation.lateByMinutes} minutes past the promise. The alert starts at 10 minutes late.`
                  : "A manager alert and customer update are previewed at 10 minutes past the current promise."}</p>
            </div>
            <details className="ai-evaluation-details"><summary>{result.dataset.evaluationLabel}</summary>
              <p>Errors compare predictions with held-out synthetic examples. They do not measure accuracy at this restaurant.</p>
              <dl><div><dt>Examples available</dt><dd>{samples}</dd></div>
                <div><dt>Learned model average error</dt><dd>{minutes(result.prediction.validationMae)}</dd></div>
                <div><dt>Kitchen-load formula average error</dt><dd>{minutes(result.prediction.baselineMae)}</dd></div></dl>
              <p>Kitchen-load formula for this scenario: {minutes(result.baselineMinutes)}. Limited history or an unsafe fit keeps the fallback.</p>
            </details>
          </> : !scenarioError && <div className="ai-awaiting-result"><BrainCircuit size={30} /><p>Evaluate your inputs to see the estimate and message previews.</p></div>}
        </section>
      </div>

      {result && !busy && <section className="panel ai-message-panel" role="region" aria-label="Message previews">
        <div className="ai-message-heading"><h2 id="ai-messages-heading"><MessageSquare size={21} /> Message previews</h2><span className="ai-demo-badge">Preview only</span></div>
        <p className="ai-section-description">Generated for this scenario. Nothing is sent or saved.</p>
        <div className="ai-message-grid">{result.automation.updates.map((update) => <article key={update.kind} className="ai-message-preview">
          <p className="ai-preview-audience">Preview only · {update.audience}</p><blockquote>{update.text}</blockquote>
        </article>)}</div>
      </section>}

      <section className="ai-operational-note" aria-labelledby="ai-operations-heading">
        <h2 id="ai-operations-heading">Outside this preview</h2>
        <div><p><strong>{data.communications.sms === "configured" ? "SMS configured" : data.communications.sms === "simulated" ? "SMS simulated" : "Real SMS unavailable"}</strong>
          {data.communications.sms === "configured" ? " Actual delivery still depends on verified contacts and provider approval." : " Real SMS needs a registered sender and provider setup."} Scenario previews never send SMS.</p>
          <p><strong>{data.backgroundEnabled ? "Background checks enabled" : "Background checks disabled"}</strong> Operational late alerts run only while the host and background process are running. Free hosting can pause them while idle.</p></div>
        {app.user?.role === "ADMIN" && <Link href="/workspace/services">View service status <ArrowRight size={16} /></Link>}
      </section>
    </> : null}
  </div>;
}
