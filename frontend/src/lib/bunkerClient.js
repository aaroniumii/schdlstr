import { SimplePool, finishEvent, generatePrivateKey, getPublicKey, nip19, nip44 } from "nostr-tools";

const REMOTE_SIGNER_EVENT_KIND = 24133;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PERMISSIONS = ["sign_event:1"];

function randomRequestId() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(16).slice(2);
}

function normalizeRemotePubkey(rawKey) {
  if (!rawKey) {
    throw new Error("The Bunker link must include the remote signer public key.");
  }
  const cleaned = rawKey.replace(/\/$/, "");
  if (cleaned.startsWith("npub")) {
    const decoded = nip19.decode(cleaned);
    if (decoded.type !== "npub" || typeof decoded.data !== "string") {
      throw new Error("Invalid npub value in the Bunker link.");
    }
    return decoded.data;
  }
  return cleaned.toLowerCase();
}

export function parseBunkerLink(link) {
  if (!link || typeof link !== "string") {
    throw new Error("Paste a valid Bunker link.");
  }
  let trimmed = link.trim();
  if (!trimmed) {
    throw new Error("Paste a valid Bunker link.");
  }
  if (!trimmed.includes("://")) {
    trimmed = `bunker://${trimmed}`;
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch (err) {
    throw new Error("Invalid Bunker link format.");
  }
  if (url.protocol !== "bunker:") {
    throw new Error("The link must start with bunker://");
  }
  const hostPart = url.hostname || url.pathname.replace(/^\/+/, "");
  const remoteSignerPubkey = normalizeRemotePubkey(hostPart);
  if (!/^[0-9a-f]{64}$/i.test(remoteSignerPubkey)) {
    throw new Error("Remote signer public key must be 64 hex characters.");
  }
  const relays = Array.from(new Set(url.searchParams.getAll("relay").map((entry) => entry.trim()).filter(Boolean)));
  const filteredRelays = relays.filter((relay) => {
    try {
      const relayUrl = new URL(relay);
      return relayUrl.protocol === "wss:" || relayUrl.protocol === "ws:";
    } catch (err) {
      return false;
    }
  });
  if (!filteredRelays.length) {
    throw new Error("The Bunker link must include at least one relay.");
  }
  const secret = url.searchParams.get("secret") || "";
  return {
    remoteSignerPubkey: remoteSignerPubkey.toLowerCase(),
    relays: filteredRelays,
    secret,
  };
}

export default class BunkerClient {
  constructor() {
    this.pool = null;
    this.sub = null;
    this.pending = new Map();
    this.relays = [];
    this.remoteSignerPubkey = "";
    this.secret = "";
    this.clientSecretKey = "";
    this.clientPubkey = "";
    this.conversationKey = null;
    this.userPubkey = "";
  }

  async connect(link, { onAuthUrl, permissions } = {}) {
    this.disconnect();
    const { remoteSignerPubkey, relays, secret } = parseBunkerLink(link);
    this.remoteSignerPubkey = remoteSignerPubkey;
    this.relays = relays;
    this.secret = secret;
    this.clientSecretKey = generatePrivateKey();
    this.clientPubkey = getPublicKey(this.clientSecretKey);
    this.conversationKey = nip44.utils.v2.getConversationKey(this.clientSecretKey, this.remoteSignerPubkey);
    this.pool = new SimplePool();
    this.sub = this.pool.sub(this.relays, [
      { kinds: [REMOTE_SIGNER_EVENT_KIND], "#p": [this.clientPubkey] },
    ]);
    this.sub.on("event", (event) => this.handleIncomingEvent(event));
    const requestedPermissions = Array.isArray(permissions) && permissions.length ? permissions : DEFAULT_PERMISSIONS;
    const connectParams = [this.remoteSignerPubkey];
    if (this.secret) {
      connectParams.push(this.secret);
    } else if (requestedPermissions.length) {
      connectParams.push("");
    }
    if (requestedPermissions.length) {
      connectParams.push(requestedPermissions.join(","));
    }
    try {
      const connectResult = await this.sendRequest("connect", connectParams, { onAuthUrl });
      if (this.secret && connectResult !== this.secret && connectResult !== "ack") {
        throw new Error("Unexpected secret received from Bunker.");
      }
      const userPubkey = await this.sendRequest("get_public_key", [], { onAuthUrl });
      if (!userPubkey || typeof userPubkey !== "string") {
        throw new Error("Bunker did not provide a public key.");
      }
      this.userPubkey = userPubkey;
      return userPubkey;
    } catch (err) {
      this.disconnect();
      throw err;
    }
  }

  async signEvent(event, { onAuthUrl, timeout } = {}) {
    if (!this.conversationKey || !this.userPubkey) {
      throw new Error("Bunker is not connected.");
    }
    const eventCopy = {
      kind: event.kind,
      content: event.content,
      tags: Array.isArray(event.tags) ? event.tags : [],
      created_at: event.created_at,
      pubkey: this.userPubkey,
    };
    const payload = JSON.stringify(eventCopy);
    const result = await this.sendRequest("sign_event", [payload], { onAuthUrl, timeout });
    try {
      return JSON.parse(result);
    } catch (err) {
      throw new Error("Invalid response received from Bunker.");
    }
  }

  disconnect() {
    if (this.sub) {
      this.sub.unsub();
      this.sub = null;
    }
    if (this.pool && this.relays.length) {
      this.pool.close(this.relays);
    }
    this.pool = null;
    this.relays = [];
    this.remoteSignerPubkey = "";
    this.secret = "";
    this.clientSecretKey = "";
    this.clientPubkey = "";
    this.conversationKey = null;
    this.userPubkey = "";
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Bunker connection closed."));
    }
    this.pending.clear();
  }

  handleIncomingEvent(event) {
    if (event.kind !== REMOTE_SIGNER_EVENT_KIND) {
      return;
    }
    if (this.remoteSignerPubkey && event.pubkey !== this.remoteSignerPubkey) {
      return;
    }
    if (!this.conversationKey) {
      return;
    }
    let decrypted;
    try {
      decrypted = nip44.decrypt(this.conversationKey, event.content);
    } catch (err) {
      console.error("Unable to decrypt Bunker response", err);
      return;
    }
    let message;
    try {
      message = JSON.parse(decrypted);
    } catch (err) {
      console.error("Invalid JSON received from Bunker", err);
      return;
    }
    if (!message || typeof message.id !== "string") {
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }
    if (message.result === "auth_url" && typeof message.error === "string" && message.error) {
      if (pending.onAuthUrl) {
        pending.onAuthUrl(message.error);
      }
      return;
    }
    if (message.error) {
      pending.reject(new Error(message.error));
      return;
    }
    pending.resolve(typeof message.result === "string" ? message.result : "");
  }

  async sendRequest(method, params = [], { onAuthUrl, timeout } = {}) {
    if (!this.pool || !this.conversationKey) {
      throw new Error("Bunker is not connected.");
    }
    const requestId = randomRequestId();
    const envelope = {
      id: requestId,
      method,
      params,
    };
    const plaintext = JSON.stringify(envelope);
    const content = nip44.encrypt(this.conversationKey, plaintext);
    const event = finishEvent(
      {
        kind: REMOTE_SIGNER_EVENT_KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["p", this.remoteSignerPubkey]],
        content,
      },
      this.clientSecretKey,
    );
    const effectiveTimeout = typeof timeout === "number" ? timeout : DEFAULT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const pending = {
        settled: false,
        onAuthUrl,
        resolve: (value) => {
          if (pending.settled) {
            return;
          }
          pending.settled = true;
          clearTimeout(timerId);
          this.pending.delete(requestId);
          resolve(value);
        },
        reject: (error) => {
          if (pending.settled) {
            return;
          }
          pending.settled = true;
          clearTimeout(timerId);
          this.pending.delete(requestId);
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      };
      const timerId = setTimeout(() => {
        pending.reject(new Error(`Bunker request \"${method}\" timed out.`));
      }, effectiveTimeout);
      this.pending.set(requestId, pending);
      let publishPromises;
      try {
        publishPromises = this.pool.publish(this.relays, event);
      } catch (err) {
        pending.reject(err);
        return;
      }
      Promise.allSettled(publishPromises).then((results) => {
        const anyFulfilled = results.some((result) => result.status === "fulfilled");
        if (!anyFulfilled) {
          pending.reject(new Error("Unable to send request to any relay."));
        }
      }).catch((err) => {
        pending.reject(err);
      });
    });
  }
}
