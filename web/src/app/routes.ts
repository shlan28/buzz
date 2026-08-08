import { index, route, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  route("/invite/$code", "invite.$code.tsx"),
  route("/repos", "repos.tsx"),
  route("/repos/$repoId", "repos.$repoId.tsx"),
  route("/repos/$repoId/blob/$", "repos.$repoId.blob.$.tsx"),
  route("/app/channels", "app.channels.tsx"),
  route("/app/calendar", "app.calendar.tsx"),
  route("/app/tasks", "app.tasks.tsx"),
  route("/app/tracks", "app.tracks.tsx"),
  route("/app/activity", "app.activity.tsx"),
  route("/app/pair", "app.pair.tsx"),
]);
