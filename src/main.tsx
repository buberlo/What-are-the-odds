import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LinkDareInvitePage from "./components/LinkDareInvitePage";
import { FEATURE_LINK_DARES } from "./flags";
import "./index.css";

const path = window.location.pathname;
const inviteMatch = FEATURE_LINK_DARES && path.startsWith("/i/") ? path.split("/")[2] : null;
const token = new URL(window.location.href).searchParams.get("t");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {inviteMatch && token ? (
      <LinkDareInvitePage slug={inviteMatch} token={token} />
    ) : (
      <App />
    )}
  </React.StrictMode>
);
