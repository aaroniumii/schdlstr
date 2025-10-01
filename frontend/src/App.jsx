// App.jsx
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ComposeForm from "./components/ComposeForm";
import ScheduledList from "./components/ScheduledList";
import BunkerClient from "./lib/bunkerClient";

export const SignerContext = createContext(null);

function App() {
  const [pubkey, setPubkey] = useState("");
  const [signerType, setSignerType] = useState(null);
  const [extensionPubkey, setExtensionPubkey] = useState("");
  const bunkerClientRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function detectExtension() {
      if (!window?.nostr) {
        return;
      }
      try {
        const pk = await window.nostr.getPublicKey();
        if (!cancelled) {
          setExtensionPubkey(pk);
          setSignerType((prev) => prev ?? "extension");
          setPubkey((current) => current || pk);
        }
      } catch (err) {
        console.warn("Unable to retrieve public key from extension", err);
      }
    }
    detectExtension();
    return () => {
      cancelled = true;
      bunkerClientRef.current?.disconnect();
    };
  }, []);

  const connectBunker = useCallback(async (link, options = {}) => {
    const client = new BunkerClient();
    try {
      const userPubkey = await client.connect(link, options);
      bunkerClientRef.current?.disconnect();
      bunkerClientRef.current = client;
      setSignerType("bunker");
      setPubkey(userPubkey);
      return userPubkey;
    } catch (err) {
      client.disconnect();
      throw err;
    }
  }, []);

  const disconnectBunker = useCallback(() => {
    if (bunkerClientRef.current) {
      bunkerClientRef.current.disconnect();
      bunkerClientRef.current = null;
    }
    if (extensionPubkey) {
      setSignerType("extension");
      setPubkey(extensionPubkey);
    } else {
      setSignerType(null);
      setPubkey("");
    }
  }, [extensionPubkey]);

  const useExtension = useCallback(() => {
    if (!extensionPubkey) {
      throw new Error("No NIP-07 extension detected.");
    }
    if (bunkerClientRef.current) {
      bunkerClientRef.current.disconnect();
      bunkerClientRef.current = null;
    }
    setSignerType("extension");
    setPubkey(extensionPubkey);
  }, [extensionPubkey]);

  const signEvent = useCallback(
    async (event, options = {}) => {
      if (signerType === "bunker") {
        if (!bunkerClientRef.current) {
          throw new Error("Bunker signer not connected.");
        }
        return bunkerClientRef.current.signEvent(event, options);
      }
      if (signerType === "extension") {
        if (!window?.nostr?.signEvent) {
          throw new Error("Browser extension signer unavailable.");
        }
        return window.nostr.signEvent(event);
      }
      throw new Error("No signer connected.");
    },
    [signerType],
  );

  const contextValue = useMemo(
    () => ({
      pubkey,
      signerType,
      extensionPubkey,
      connectBunker,
      disconnectBunker,
      useExtension,
      signEvent,
    }),
    [
      pubkey,
      signerType,
      extensionPubkey,
      connectBunker,
      disconnectBunker,
      useExtension,
      signEvent,
    ],
  );

  return (
    <SignerContext.Provider value={contextValue}>
      <div className="main-container">
        <h1 className="text-2xl font-bold mb-6">Schedule notes & other stuff</h1>
        <div className="card">
          <ComposeForm />
        </div>
        <div className="card">
          <ScheduledList />
        </div>
        <footer className="mt-10 text-center text-sm text-gray-600">
          Contributions and greetings •
          <a
            href="https://getalby.com/p/algorithm6028"
            className="underline ml-1"
          >
            leon@nostr.aaroniumii.com
          </a>
        </footer>
      </div>
    </SignerContext.Provider>
  );
}

export default App;
