import { Injectable } from '@nestjs/common';

/**
 * In-memory online/offline presence tracking (spec §25). A user can
 * have multiple sockets open (multiple tabs/devices) — they're
 * considered online as long as at least one socket is connected.
 *
 * LIMITATION: this is single-process, in-memory state. It works
 * correctly as long as the API runs as a single instance. If this ever
 * scales horizontally to multiple instances, presence needs to move to
 * a shared store (e.g. Redis) via a Socket.IO Redis adapter, or
 * presence checks will be wrong for users connected to a different
 * instance. Flagging this now rather than silently building something
 * that looks correct but breaks under horizontal scaling.
 */
@Injectable()
export class PresenceService {
  private readonly onlineSockets = new Map<string, Set<string>>(); // userId -> socketIds

  addConnection(userId: string, socketId: string) {
    if (!this.onlineSockets.has(userId)) {
      this.onlineSockets.set(userId, new Set());
    }
    this.onlineSockets.get(userId)!.add(socketId);
  }

  /** Returns true if this was the user's last open socket (i.e. they just went offline). */
  removeConnection(userId: string, socketId: string): boolean {
    const sockets = this.onlineSockets.get(userId);
    if (!sockets) return false;
    sockets.delete(socketId);
    if (sockets.size === 0) {
      this.onlineSockets.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    return this.onlineSockets.has(userId);
  }
}
