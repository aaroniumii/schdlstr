// frontend/src/components/ScheduledList.jsx
import React, { useEffect, useState } from "react";

export default function ScheduledList() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("Loading scheduled posts...");

  useEffect(() => {
    const fetchEvents = async () => {
      if (!window.nostr) {
        setStatus("Connect a NIP-07 extension to view scheduled posts.");
        return;
      }
      try {
        const pubkey = await window.nostr.getPublicKey();
        const res = await fetch(`/scheduled?pubkey=${pubkey}`);
        if (!res.ok) {
          throw new Error(`Request failed with status ${res.status}`);
        }
        const data = await res.json();
        setEvents(data);
        setStatus(data.length ? "" : "No scheduled posts.");
      } catch (err) {
        console.error("Error loading scheduled notes:", err);
        setStatus("Unable to load scheduled posts. Try again later.");
      }
    };
    fetchEvents();
  }, []);

  if (status && events.length === 0) return <p>{status}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Scheduled Notes</h2>
      <ul className="space-y-3">
        {events.map((ev) => (
          <li key={ev.id} className="p-4 border rounded bg-gray-50">
            <p className="text-sm text-gray-800">{ev.content}</p>
            <p className={`text-xs mt-1 ${ev.sent ? 'status-sent' : 'status-pending'}`}>
              Publish: {new Date(ev.publish_at).toLocaleString()} — Status: {ev.sent ? '✅ Sent' : '⏳ Pending'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

