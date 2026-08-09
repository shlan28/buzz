import { index, route, rootRoute } from "@tanstack/virtual-file-routes";

export const routes = rootRoute("root.tsx", [
  index("index.tsx"),
  route("/invite/$code", "invite.$code.tsx"),
  route("/repos", "repos.tsx"),
  route("/repos/$repoId", "repos.$repoId.tsx"),
  route("/repos/$repoId/blob/$", "repos.$repoId.blob.$.tsx"),
  route("/app/channels", "app.channels.tsx"),
  route("/app/channels/$channelId", "app.channels.$channelId.tsx"),
  route("/app/inbox", "app.inbox.tsx"),
  route("/app/calendar", "app.calendar.tsx"),
  route("/app/tasks", "app.tasks.tsx"),
  route("/app/tracks", "app.tracks.tsx"),
  route("/app/tracks/$trackId", "app.tracks.$trackId.tsx"),
  route("/app/activity", "app.activity.tsx"),
  route("/app/pair", "app.pair.tsx"),
  route("/app/settings", "app.settings.tsx"),
]);
