# PassPoint

PassPoint gives a teacher a live hall pass board and pairs a student Chromebook with one class. Each teacher signs in with Cloudflare Access and sees their own classes. The shared board starts empty. Add fictional students in **Settings** to try it.

## Run the synced app locally

Install Node.js 22 or later, then run these commands from the repository root.

```sh
npm ci
npm run dev -- --ip 127.0.0.1 --var LOCAL_TEST:yes
```

Open `http://localhost:8787/teacher`. The local test identity works only on localhost with that explicit flag. Use a second browser profile for the Chromebook. Local Wrangler storage persists across restarts. A static-only demonstration of the original browser storage workflow can still be run with `python -m http.server 8011 --directory dist`.

## Deploy and enable automatic releases

1. In Cloudflare **Workers & Pages**, import the **Widogastt/PassPoint** Git repository using **Workers Builds**. Use the repository root. Select the branch containing this implementation for a trial, or merge it into `main` and select `main` for production. Use `npm run deploy` for the deploy command. The repository includes the Worker, its static assets, and the SQLite Durable Object migration. Each subsequent push to the selected production branch triggers a release.
2. Get the Worker hostname from Cloudflare. In Zero Trust **Access → Applications**, create a self-hosted application with two public hostname/path entries on that host, `/teacher` and `/api/teacher/*`. Use one Access application so the same audience covers both paths. Add an Allow policy for the approved teacher emails and enable your staff identity provider or email one-time PIN. Keep `/door` and `/api/kiosk/*` reachable by the Chromebook.
3. In the Worker's runtime **Variables and Secrets**, set `ACCESS_ISSUER` to your team domain including `https://` (no trailing slash), and `ACCESS_AUD` to the Application Audience tag from the Access application. Apply the settings. The deploy script preserves dashboard-managed variables. Teacher routes verify signed Access tokens, including issuer, audience, and expiration. They require valid authentication even on alternate Worker hostnames. Leave `LOCAL_TEST` unset in Cloudflare.
4. Visit `/teacher`, sign in and create a class. Choose **Pair Chromebook**, give each student their own code privately, and select **Create pairing code**. Open the displayed door link in the Chromebook's student browser profile. Enter the single-use pairing code within five minutes. The device session lasts 30 days. **Disconnect kiosk** revokes it, and pairing a replacement supersedes the previous device. Keep the teacher's signed-in browser profile off the shared Chromebook.

## How changes reach both screens

A SQLite Durable Object stores a teacher's workspace. Grouping classes in one object allows roster edits and class management to use the same revision check. The kiosk session grants access to one class. Student requests and returns are checked against the current queue and active trips on the server. Concurrent teacher edits based on an old revision are rejected and the latest board is reloaded. WebSockets announce changes and each device fetches the data its role can see. A disconnected device pauses submissions and refreshes on reconnect. The kiosk receives pass availability and its own action feedback.

The class day and recurring closures use the teacher's browser time zone when the workspace is first opened. Completed history is trimmed after 90 days when the workspace is accessed. The cloud version starts a new board. Existing data under another browser origin stays there.

## Classroom check

With fictional students, issue both passes on the Chromebook and queue two more students. Confirm the names appear in order on the teacher's computer. Return a pass and click **Send next** on the teacher's board. Open weekly stats, disconnect the Chromebook, change the board, reconnect, and reload both screens. Check that the queue, available passes, and history agree.

## Reference

The public [Flint Hall Pass](https://flintk12.com/hallpass) page was used as a functional reference. The shipped public JavaScript was inspected using [Reverse Engineer Anything](https://github.com/teonett/Reverse-Engineer-Anything) version 4.1.0.
