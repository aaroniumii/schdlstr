// App.jsx
import React from "react";
import ComposeForm from "./components/ComposeForm";
import ScheduledList from "./components/ScheduledList";

function App() {
  return (
    <div className="main-container">
      <h1 className="text-2xl font-bold mb-6">Schedule your Nostr Posts</h1>
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
          algorithm6028@getalby.com
        </a>
      </footer>
    </div>
  );
}

export default App;
