import http from "http";
import app, { emitSystem } from "./app.js";
import { scheduleLeaderboardJobs } from "./leaderboardScheduler.js";
import { setupWebSocket } from "./realtime/wsGateway.js";

const port = process.env.PORT || 3001;
const server = http.createServer(app);

const scheduler = scheduleLeaderboardJobs({ emit: emitSystem });
const wsServer = setupWebSocket(server);

server.listen(port, () => {
  console.log(`server listening on ${port}`);
});

const shutdown = () => {
  scheduler.stop();
  wsServer?.close();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
