import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { registerAppShellServiceWorker } from "./infrastructure/service-worker/registration";
import "./styles/app.css";

const root = document.querySelector<HTMLElement>("#root");
if (!root) throw new Error("Application root is missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD) {
  void registerAppShellServiceWorker();
}
