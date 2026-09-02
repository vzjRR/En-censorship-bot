import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./context/AuthContext";
import { InstallGate } from "./components/InstallGate";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <InstallGate>
        <AuthProvider>
          <App />
        </AuthProvider>
      </InstallGate>
    </BrowserRouter>
  </React.StrictMode>,
);
