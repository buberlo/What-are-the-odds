import http from "http";
import app, { emitSystem } from "./app.js";
import { scheduleLeaderboardJobs } from "./leaderboardScheduler.js";

const port = process.env.PORT || 3001;
const server = http.createServer(app);

const scheduler = scheduleLeaderboardJobs({ emit: emitSystem });

server.listen(port, () => {
  console.log(`server listening on ${port}`);
});

const shutdown = () => {
  scheduler.stop();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
