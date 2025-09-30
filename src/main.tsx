import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import LinkDareInvitePage from "./components/LinkDareInvitePage";
import LeaderboardPage from "./components/LeaderboardPage";
import ShareResultPage from "./components/ShareResultPage";
import ShareProofPage from "./components/ShareProofPage";
import { FEATURE_LINK_DARES, FEATURE_LEADERBOARDS, FEATURE_SHARING } from "./flags";
import type { SharePayload } from "./types";
import "./index.css";

const path = window.location.pathname;
const inviteMatch = FEATURE_LINK_DARES && path.startsWith("/i/") ? path.split("/")[2] : null;
const token = new URL(window.location.href).searchParams.get("t");

let shareBootstrap: SharePayload | undefined;
if (FEATURE_SHARING && window.__SHARE_DATA__) {
  shareBootstrap = window.__SHARE_DATA__;
  window.__SHARE_DATA__ = undefined;
}

let view: JSX.Element = <App />;

if (FEATURE_SHARING && path.startsWith("/s/r/")) {
  const id = path.split("/")[3];
  view = <ShareResultPage id={id} initialData={shareBootstrap?.type === "result" ? shareBootstrap : undefined} />;
} else if (FEATURE_SHARING && path.startsWith("/s/p/")) {
  const id = path.split("/")[3];
  view = <ShareProofPage id={id} initialData={shareBootstrap?.type === "proof" ? shareBootstrap : undefined} />;
} else if (FEATURE_LEADERBOARDS && path === "/leaderboard") {
  view = <LeaderboardPage />;
} else if (inviteMatch && token) {
  view = <LinkDareInvitePage slug={inviteMatch} token={token} />;
} else if (inviteMatch && !token) {
  view = <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {view}
  </React.StrictMode>
);
