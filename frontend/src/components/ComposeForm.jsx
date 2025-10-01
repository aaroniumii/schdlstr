// frontend/src/components/ComposeForm.jsx
import React, { useContext, useState } from "react";
import { SignerContext } from "../App";

function shortenHex(value) {
  if (!value) {
    return "";
  }
  return value.length > 16
    ? `${value.slice(0, 8)}…${value.slice(-8)}`
    : value;
}

export default function ComposeForm() {
  const {
    pubkey,
    signerType,
    extensionPubkey,
    connectBunker,
    disconnectBunker,
    useExtension,
    signEvent,
  } = useContext(SignerContext);
  const [content, setContent] = useState("");
  const [datetime, setDatetime] = useState("");
  const [status, setStatus] = useState("");
  const [bunkerUrl, setBunkerUrl] = useState("");
  const [bunkerStatus, setBunkerStatus] = useState("");
  const [authUrl, setAuthUrl] = useState("");

  const handleConnectBunker = async () => {
    if (!bunkerUrl.trim()) {
      setBunkerStatus("Paste a bunker:// link to connect.");
      return;
    }
    setBunkerStatus("Connecting to Bunker...");
    setAuthUrl("");
    try {
      const connectedPubkey = await connectBunker(bunkerUrl.trim(), {
        onAuthUrl: (url) => setAuthUrl(url),
      });
      setBunkerStatus(
        `Connected to Bunker. Using signer ${shortenHex(connectedPubkey)}.`,
      );
      setStatus("");
      setAuthUrl("");
    } catch (err) {
      console.error("Bunker connection failed", err);
      setBunkerStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDisconnectBunker = () => {
    disconnectBunker();
    setBunkerStatus("Disconnected from Bunker.");
    setAuthUrl("");
  };

  const handleUseExtension = () => {
    try {
      useExtension();
      setBunkerStatus("Using browser extension for signing.");
      setAuthUrl("");
    } catch (err) {
      setBunkerStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content || !datetime) {
      setStatus("Please complete all fields.");
      return;
    }
    if (!pubkey || !signerType) {
      setStatus("Connect a signer (extension or Bunker) before scheduling.");
      return;
    }
    if (new Date(datetime) <= new Date()) {
      setStatus("The date must be in the future.");
      return;
    }
    try {
      const created_at = Math.floor(Date.now() / 1000);
      const event = { kind: 1, pubkey, created_at, tags: [], content };
      const signedEvent = await signEvent(event, {
        onAuthUrl: (url) => setAuthUrl(url),
      });
      setAuthUrl("");
      const publishAtIso = new Date(datetime).toISOString();
      const res = await fetch("/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: signedEvent, publish_at: publishAtIso }),
      });
      if (res.ok) {
        setStatus("✅ Post scheduled successfully.");
        setContent("");
        setDatetime("");
      } else {
        setStatus("Error scheduling post.");
      }
    } catch (err) {
      console.error("Error signing or sending post", err);
      setStatus(err instanceof Error ? err.message : "Error signing or sending post.");
    }
  };

  const currentSignerLabel = (() => {
    if (signerType === "bunker") {
      return `Bunker remote signer (${shortenHex(pubkey)})`;
    }
    if (signerType === "extension") {
      return `Browser extension (${shortenHex(pubkey)})`;
    }
    return "None";
  })();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Signer</h2>
        <div className="border rounded p-4 space-y-3 bg-gray-50">
          <p className="text-sm text-gray-700">
            Current signer: <strong>{currentSignerLabel}</strong>
          </p>
          {extensionPubkey ? (
            <button
              type="button"
              onClick={handleUseExtension}
              className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={signerType === "extension"}
            >
              Use browser extension
            </button>
          ) : (
            <p className="text-sm text-gray-600">
              No NIP-07 browser extension detected.
            </p>
          )}
          <div className="space-y-2">
            <label className="block text-sm font-semibold">Bunker link</label>
            <input
              type="text"
              value={bunkerUrl}
              onChange={(e) => setBunkerUrl(e.target.value)}
              placeholder="bunker://pubkey?relay=wss://...&secret=..."
              className="w-full p-2 border rounded"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="text-sm px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
                onClick={handleConnectBunker}
                disabled={!bunkerUrl.trim()}
              >
                Connect Bunker
              </button>
              {signerType === "bunker" && (
                <button
                  type="button"
                  className="text-sm px-3 py-1 rounded bg-gray-600 text-white hover:bg-gray-700"
                  onClick={handleDisconnectBunker}
                >
                  Disconnect
                </button>
              )}
            </div>
            {bunkerStatus && (
              <p className="text-xs text-gray-700">{bunkerStatus}</p>
            )}
            {authUrl && (
              <p className="text-xs text-blue-700">
                Approval required: {" "}
                <a
                  href={authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  open Amber to authorize
                </a>
              </p>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="block font-semibold">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full p-2 border rounded"
          rows="4"
        />
      </div>

      <div>
        <label className="block font-semibold">Publish Date &amp; Time</label>
        <input
          type="datetime-local"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>

      <button
        type="submit"
        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
      >
        Schedule
      </button>

      {status && <p className="mt-2 text-sm">{status}</p>}
    </form>
  );
}
