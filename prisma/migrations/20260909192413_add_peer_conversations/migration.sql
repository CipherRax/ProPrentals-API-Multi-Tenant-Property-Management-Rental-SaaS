-- CreateTable
CREATE TABLE "peer_conversations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "participantOneId" TEXT NOT NULL,
    "participantTwoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "peer_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer_conversation_messages" (
    "id" TEXT NOT NULL,
    "peerConversationId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peer_conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peer_conversation_read_states" (
    "id" TEXT NOT NULL,
    "peerConversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peer_conversation_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "peer_conversations_organizationId_updatedAt_idx" ON "peer_conversations"("organizationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "peer_conversations_organizationId_participantOneId_particip_key" ON "peer_conversations"("organizationId", "participantOneId", "participantTwoId");

-- CreateIndex
CREATE INDEX "peer_conversation_messages_peerConversationId_createdAt_idx" ON "peer_conversation_messages"("peerConversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "peer_conversation_read_states_peerConversationId_userId_key" ON "peer_conversation_read_states"("peerConversationId", "userId");

-- AddForeignKey
ALTER TABLE "peer_conversations" ADD CONSTRAINT "peer_conversations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_conversations" ADD CONSTRAINT "peer_conversations_participantOneId_fkey" FOREIGN KEY ("participantOneId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_conversations" ADD CONSTRAINT "peer_conversations_participantTwoId_fkey" FOREIGN KEY ("participantTwoId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_conversation_messages" ADD CONSTRAINT "peer_conversation_messages_peerConversationId_fkey" FOREIGN KEY ("peerConversationId") REFERENCES "peer_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_conversation_messages" ADD CONSTRAINT "peer_conversation_messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "peer_conversation_read_states" ADD CONSTRAINT "peer_conversation_read_states_peerConversationId_fkey" FOREIGN KEY ("peerConversationId") REFERENCES "peer_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
