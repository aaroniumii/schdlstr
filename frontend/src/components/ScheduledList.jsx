// frontend/src/components/ScheduledList.jsx
import React, { useCallback, useContext, useEffect, useState } from "react";
import { SignerContext } from "../App";

export default function ScheduledList() {
  const { pubkey } = useContext(SignerContext);
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("");
  const [retryingId, setRetryingId] = useState(null);
  const [listNotice, setListNotice] = useState("Connect a signer to view scheduled posts.");

  const loadEvents = useCallback(async () => {
    if (!pubkey) {
      setEvents([]);
      setListNotice("Connect a signer to view scheduled posts.");
      return;
    }
    try {
      setListNotice("Loading scheduled posts...");
      const res = await fetch(`/scheduled?pubkey=${pubkey}`);
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      const data = await res.json();
      setEvents(data);
      setListNotice(data.length ? "" : "No scheduled posts.");
    } catch (err) {
      console.error("Error loading scheduled notes:", err);
      setEvents([]);
      setListNotice("Unable to load scheduled posts. Try again later.");
    }
  }, [pubkey]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleRetry = async (id) => {
    setRetryingId(id);
    try {
      const res = await fetch(`/scheduled/${id}/retry`, { method: "POST" });
      if (!res.ok) {
        throw new Error(`Retry failed with status ${res.status}`);
      }
      setStatus("Event queued for retry.");
      await loadEvents();
    } catch (err) {
      console.error("Unable to queue retry:", err);
      setStatus("Unable to queue retry. Try again later.");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Scheduled Notes</h2>
      {status && <p className="mb-2 text-sm text-gray-700">{status}</p>}
      {listNotice && events.length === 0 ? (
        <p className="text-sm text-gray-600">{listNotice}</p>
      ) : (
        <ul className="space-y-3">
          {events.map((ev) => {
            const publishDate = new Date(ev.publish_at).toLocaleString();
            const nextRetry = ev.next_attempt_at
              ? new Date(ev.next_attempt_at).toLocaleString()
              : null;
            return (
              <li key={ev.id} className="p-4 border rounded bg-gray-50 space-y-2">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{ev.content}</p>
                <p className="text-xs text-gray-600">
                  Publish: {publishDate} — Status: {ev.status}
                  {ev.status === "retrying" && nextRetry && ` (next retry ${nextRetry})`}
                  {ev.status === "sent" && " ✅"}
                </p>
                <p className="text-xs text-gray-500">
                  Attempts: {ev.attempt_count}
                  {ev.last_attempt_at && ` • Last attempt ${new Date(ev.last_attempt_at).toLocaleString()}`}
                </p>
                {ev.last_error && (
                  <p className="text-xs text-red-600">Error: {ev.last_error}</p>
                )}
                {ev.status === "error" && (
                  <button
                    type="button"
                    className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    onClick={() => handleRetry(ev.id)}
                    disabled={retryingId === ev.id}
                  >
                    {retryingId === ev.id ? "Retrying..." : "Retry"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
