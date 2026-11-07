"use client";
import { useApp } from "./provider";
import { useResource } from "@/lib/client";
import { Empty, ErrorNotice, Loading } from "./ui";
import type { serviceReadiness } from "@/lib/service-readiness";
import Link from "next/link";

const workerLabels = {
  healthy: "Up to date", running: "Processing", failed: "Recent failure",
  stalled: "Taking too long", stale: "No recent report", unreported: "No reports yet",
};
function timeLabel(value: string | Date | null) {
  if (!value) return "No completed run yet";
  return new Date(typeof value === "string" ? value : value.getTime()).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}
function ageLabel(value: string, checkedAt: string) {
  const seconds = Math.max(0, Math.floor((Date.parse(checkedAt) - Date.parse(value)) / 1000));
  if (seconds < 60) return "less than a minute";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ${minutes % 60} min` : `${Math.floor(hours / 24)} days ${hours % 24} hr`;
}

export function ServicesScreen() {
  const app = useApp();
  const resource = useResource<Awaited<ReturnType<typeof serviceReadiness>>>(app.user?.role === "ADMIN" ? "/api/admin/services" : null);
  if (!app.authReady || resource.loading) return <Loading />;
  if (app.user?.role !== "ADMIN") return <Empty title="Administrator access required"><p>Service configuration is available to the restaurant administrator.</p></Empty>;
  const data = resource.data;
  return <div className="page services-page">
    <p className="eyebrow">RESTAURANT OPERATIONS</p><h1>Payments & communications</h1>
    <p className="page-description">Check background processing and spot transactions that need attention. Refreshing status does not send a payment, email or SMS.</p>
    <button className="button secondary" onClick={resource.refresh}>Refresh status</button>
    {resource.error && <ErrorNotice message={resource.error} retry={resource.refresh} />}
    {data && <>
      <p>Checked {new Date(data.checkedAt).toLocaleString("en-IN")}{data.demoMode ? " · Demo mode" : ""}</p>
      <div className="service-grid">
        <section className="service-card"><h2>Payments</h2>
          <span className={`service-state ${!data.payment.configured ? "attention" : ""}`}>{data.payment.configured ? data.payment.testMode ? "Test mode" : "Live credentials configured" : "Configuration required"}</span>
          <p>{data.payment.provider === "razorpay" ? "Razorpay hosted checkout" : data.payment.provider === "demo" ? "Simulated gateway" : "Online payments disabled"}</p>
          <p>Live activation needs a verified merchant account, automatic capture and a working webhook.</p>
        </section>
        <section className="service-card"><h2>Email</h2>
          <span className={`service-state ${data.communications.transactionalEmail === "disabled" ? "attention" : ""}`}>{data.communications.transactionalEmail}</span>
          <p>{data.emailProvider === "ses" ? "Amazon SES" : "Resend"} · Sign-in codes {data.communications.emailCode ? "available" : "unavailable"}</p>
          <p>Verify the sending domain and production sending access in the provider account.</p>
        </section>
        <section className="service-card"><h2>SMS</h2>
          <span className={`service-state ${data.communications.transactionalSms === "disabled" ? "attention" : ""}`}>{data.communications.transactionalSms}</span>
          <p>{data.smsProvider === "aws" ? "AWS End User Messaging" : "Twilio"} · Sign-in codes {data.communications.phoneCode ? "available" : "unavailable"}</p>
          <p>Indian local-route messages require registered senders and matching approved templates.</p>
        </section>
      </div>
      <section className="panel" aria-labelledby="worker-heading"><h2 id="worker-heading">Background processing</h2>
        <p>Each task reports independently. Times reflect the latest refresh; a successful run does not confirm payment settlement or message delivery. Use host monitoring to confirm all expected workers are running.</p>
        <div className="service-grid worker-grid">{data.workers.map((worker) => <article className="service-card" key={worker.job}>
          <h3>{worker.label}</h3>
          <span className={`service-state ${["healthy", "running"].includes(worker.status) ? "" : "attention"}`}>{workerLabels[worker.status]}</span>
          <dl className="worker-times">
            <div><dt>Last report</dt><dd>{worker.lastReportedAt ? timeLabel(worker.lastReportedAt) : "Not received"}</dd></div>
            <div><dt>Last successful run</dt><dd>{timeLabel(worker.lastSucceededAt)}</dd></div>
          </dl>
          {worker.consecutiveFailures > 0 && <p>{worker.consecutiveFailures} consecutive failed {worker.consecutiveFailures === 1 ? "run" : "runs"}. Check the worker logs and service queues.</p>}
          {worker.status === "running" && <p>Current run started {timeLabel(worker.lastStartedAt)}.</p>}
          {worker.status === "stalled" && <p>A run exceeded {Math.round(worker.stallAfterSeconds / 60)} minutes. Check the worker and provider response times.</p>}
          {["stale", "unreported"].includes(worker.status) && <p>Check that the worker is running and connected to this database.</p>}
          {worker.instances.length > 1 && <details className="worker-instances"><summary>{worker.instances.length} worker instances</summary>
            <ul>{worker.instances.map((instance) => <li key={instance.processId}><code>{instance.processId.slice(0, 8)}</code> · {workerLabels[instance.status]}</li>)}</ul>
          </details>}
        </article>)}</div>
      </section>
      <section className="panel"><h2>Delivery and payment queues</h2><div className="service-metrics">
        <div><strong>{data.queues.refunds}</strong>Pending refunds
          {data.queueTiming.refundOverdueSince && <small>Oldest check overdue by {ageLabel(data.queueTiming.refundOverdueSince, data.checkedAt)}</small>}</div>
        <div><strong>{data.queues.refundReview}</strong>Payments needing review</div>
        <div><strong>{data.queues.paymentRecovery}</strong>Payment sessions needing attention
          {data.queueTiming.paymentOverdueSince && <small>Oldest check overdue by {ageLabel(data.queueTiming.paymentOverdueSince, data.checkedAt)}</small>}</div>
        <div><strong>{data.queues.queuedNotifications}</strong>Queued notifications
          {data.queueTiming.oldestNotificationAt && <small>Oldest queued {ageLabel(data.queueTiming.oldestNotificationAt, data.checkedAt)} ago</small>}</div>
        <div><strong>{data.queues.notificationAttention}</strong>Notifications needing review</div>
        <div><strong>{data.queues.queuedWebhooks}</strong>Payment updates awaiting processing
          {data.queueTiming.oldestWebhookAt && <small>Oldest received {ageLabel(data.queueTiming.oldestWebhookAt, data.checkedAt)} ago</small>}</div>
        <div><strong>{data.queues.webhookAttention}</strong>Payment updates needing review</div>
      </div><p>An accepted message has been accepted by the provider; it is not proof of delivery. Review unknown outcomes in the provider dashboard before resending. Refunds stay pending until provider confirmation.</p></section>
      {!!data.webhookIssues.length && <section className="panel"><h2>Payment updates to review</h2>
        <div className="service-issues">{data.webhookIssues.map((event) => <article key={event.id}>
          <strong>{event.status === "BLOCKED" ? "Waiting for matching payment mode" : "Automatic retries exhausted"}</strong>
          <small>{event.testMode ? "Test payment" : "Live payment"} · {event.event} · {event.attempts} attempts</small>
          <small>Payment: {event.paymentId || event.refundPaymentId || "Unavailable"}{event.refundId ? ` · Refund: ${event.refundId}` : ""}</small>
          <small>Received: {timeLabel(event.receivedAt)} · {event.lastErrorCode}</small>
        </article>)}</div><p>Showing {data.webhookIssues.length} of {data.queues.webhookAttention} updates, oldest first. Check the provider references and reconcile the affected order. Updates held by a test/live mismatch resume when matching credentials return; exhausted updates need operator review.</p>
      </section>}
      {!!data.paymentIssues.length && <section className="panel"><h2>Payments to review</h2>
        <div className="service-issues">{data.paymentIssues.map((payment) => <article key={payment.id}>
          <Link href={`/orders/${payment.order.id}`}>{payment.order.number}</Link>
          <strong>{payment.refundReviewRequired ? "Reconciliation required" : "Refund pending"}</strong>
          <small>Payment: {payment.providerPaymentId || payment.id}{payment.providerRefundId ? ` · Refund: ${payment.providerRefundId}` : ""}</small>
        </article>)}</div><p>Latest 20 records. Use these references in the merchant dashboard. A partial or uncertain refund must be reconciled before a receipt is issued.</p>
      </section>}
      {!!data.recoveryIssues.length && <section className="panel"><h2>Payment session recovery</h2>
        <div className="service-issues">{data.recoveryIssues.map((session) => <article key={session.id}>
          <Link href={`/orders/${session.order.id}`}>{session.order.number}</Link>
          <strong>{session.lastError}</strong>
          <small>{session.testMode ? "Test payment" : "Live payment"} · Provider order: {session.providerOrderId || "Not yet confirmed"}</small>
          <small>Next scheduled check: {timeLabel(session.nextCheckAt)} · Last update: {timeLabel(session.updatedAt)}</small>
        </article>)}</div><p>Showing {data.recoveryIssues.length} of {data.queues.paymentRecovery} sessions, earliest scheduled check first. Compare the order reference in the merchant dashboard and resolve the reported configuration or refund issue. Recovery continues automatically when the worker can proceed.</p>
      </section>}
      {!!data.deliveryIssues.length && <section className="panel"><h2>Notifications to review</h2>
        <div className="service-issues">{data.deliveryIssues.map((delivery) => <article key={delivery.id}>
          <Link href={`/orders/${delivery.message.order.id}`}>{delivery.message.order.number}</Link>
          <strong>{delivery.channel} · {delivery.status.toLowerCase()} · {delivery.provider}</strong>
          <small>{delivery.lastErrorCode} · Reference: {delivery.providerId || delivery.id}</small>
          <small>{delivery.attempts} {delivery.attempts === 1 ? "attempt" : "attempts"} · Last update: {timeLabel(delivery.updatedAt)}</small>
        </article>)}</div><p>Latest 20 records. Check provider acceptance before a manual resend to avoid duplicate messages.</p>
      </section>}
      <section className="panel"><h2>Business details</h2><ul className="service-checks">
        <li>Order support contact: {data.business.support ? "configured" : "missing"}</li>
        <li>Privacy contact: {data.business.privacy ? "configured" : "missing"}</li>
        <li>Open outlets without a verified licence declaration: {data.business.unverifiedOutlets}</li>
      </ul><p>Keep the background worker running. Credentials, provider approval and a small verified transaction must be checked before accepting customer orders.</p></section>
    </>}
  </div>;
}
