import dotenv from "dotenv-safe";
dotenv.config();

import express from "express";

import { root, series, schedule, movies, auth, version } from "./controllers";
import { isAuthorized } from "./services/auth";
import { radarrConfigured } from "./services/radarr";

// Safety net: an unreachable upstream (Sonarr/AniList/TheTVDB) must not take the
// whole server down. On Node >=15 an unhandled rejection terminates the process
// by default, which caused a crash/restart loop when SONARR_API_BASE_URL was
// wrong. Registering these keeps the server alive and logs instead of exiting.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

// Configure Express
const app = express();
const port = Number(process.env.API_PORT ?? 3000);

app.use(express.json());
app.set("json spaces", 2);
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/", root);
app.use("/auth", auth);
app.use("/version", version);
app.use("/series", isAuthorized, series);
app.use("/schedule", isAuthorized, schedule);
app.use("/movies", isAuthorized, movies);

// Listen and log startup
app.listen(port, () => {
  const lineLength = process.stdout.columns || 40;
  const banner =
    "              _____     __  __" +
    "\n /\\ |\\ |||\\/||_  |  /\\ |__)|__)" +
    "\n/--\\| \\|||  ||__ | /--\\| \\ | \\  ";
  const line = "\n" + "-".repeat(lineLength) + "\n";
  console.log(
    banner +
    line +
    `Animetarr server is listening at http://localhost:${port}
  with:
    Password: ${process.env.PASSWORD ? "set" : "MISSING"}
    Sonarr API Base URL : ${process.env.SONARR_API_BASE_URL}
    Sonarr Quality Profile: ${process.env.SONARR_QUALITY_PROFILE_ID}
    Sonarr Base Path: ${process.env.SONARR_BASE_PATH}
    Sonarr API Key: ${process.env.SONARR_API_KEY ? "set" : "MISSING"}
    TVDB API Key: ${process.env.TVDB_API_KEY ? "set" : "MISSING"}
    Radarr: ${radarrConfigured ? "configured" : "not configured (movies disabled)"}` +
    line
  );
});
