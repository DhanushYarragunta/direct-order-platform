CREATE TABLE "WorkerStatus" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkerStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerStatus_processId_job_key" ON "WorkerStatus"("processId", "job");
CREATE INDEX "WorkerStatus_updatedAt_idx" ON "WorkerStatus"("updatedAt");
