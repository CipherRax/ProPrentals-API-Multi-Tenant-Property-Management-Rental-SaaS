-- CreateTable
CREATE TABLE "analytics_insights" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "criticalIssues" JSONB NOT NULL,
    "suggestions" JSONB NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'heuristic',

    CONSTRAINT "analytics_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_search_logs" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marketplace_search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_insights_organizationId_key" ON "analytics_insights"("organizationId");

-- CreateIndex
CREATE INDEX "marketplace_search_logs_query_idx" ON "marketplace_search_logs"("query");

-- CreateIndex
CREATE INDEX "marketplace_search_logs_createdAt_idx" ON "marketplace_search_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "analytics_insights" ADD CONSTRAINT "analytics_insights_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
