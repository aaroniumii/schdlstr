// frontend/src/components/ComposeForm.jsx
import React, { useEffect, useState } from "react";
import { getEventHash } from "nostr-tools";

export default function ComposeForm() {
  const [content, setContent] = useState("");
  const [datetime, setDatetime] = useState("");
  const [status, setStatus] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      if (window.nostr) {
        setPubkey(await window.nostr.getPublicKey());
      } else {
        setStatus("Please complete all fields and enable NIP-07.");
      }
    })();
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/upload", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      // Insertamos la URL directamente en el textarea
      setContent((prev) => {
        const separator = prev ? "\n\n" : "";
        return `${prev}${separator}![media](${url})`;
      });
      setStatus("Media uploaded. Adjust its position as needed.");
    } catch (err) {
      console.error(err);
      setStatus("Error uploading media.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content || !datetime || !window.nostr) {
      setStatus("Please complete all fields and enable NIP-07.");
      return;
    }
    if (new Date(datetime) <= new Date()) {
      setStatus("The date must be in the future.");
      return;
    }
    try {
      const created_at = Math.floor(Date.now() / 1000);
      const event = { kind: 1, pubkey, created_at, tags: [], content };
      event.id = getEventHash(event);
      const signedEvent = await window.nostr.signEvent(event);

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
      console.error(err);
      setStatus("Error signing or sending post.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Contenido de la nota */}
      <div>
        <label className="block font-semibold">Content</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full p-2 border rounded"
          rows="4"
        />
      </div>

      {/* Subir imagen */}
      <div>
        <label className="inline-flex items-center bg-blue-600 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-700">
          <span>{uploading ? "Uploading..." : "Upload Image"}</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Fecha y hora */}
      <div>
        <label className="block font-semibold">Publish Date & Time</label>
        <input
          type="datetime-local"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>

      {/* Botón de envío */}
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

