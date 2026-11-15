# Three Doors

Three Doors helps people prepare for an appointment. Access Scan searches a local
CoStar/Matterport property cross-reference, presents a location report, and offers
a guided example floor plan. Live reports embed the Matterport walkthrough and
ask Gemini to review sampled scan views and Vexcel aerial imagery for possible access barriers. It is
a planning aid, not an accessibility certification.

## Run locally

The building list and guided demo work without API keys. The local catalog reads
`~/Downloads/models_index.csv` and
`~/Downloads/costar-hackathon-kit/commercial-properties.csv`; set
`MATTERPORT_INDEX` or `COSTAR_DATA_DIR` in `.env` to use other paths. Optional
Gemini review uses the local Python proxy, so the API key is never sent to the
browser. Live Matterport floor geometry and scan faces plus
Vexcel aerial imagery are requested when their credentials are configured.

1. Install Node.js 20.19+ and Python 3.9+.
2. Copy `.env.example` to `.env`. Add a valid `GEMINI_API_KEY` for imagery review,
   and optionally Matterport API key/token and a Vexcel API key for live evidence.
   Never commit or share credentials.
3. In one terminal, run `python3 -m backend.server` from the repository root.
4. In another terminal, run `cd frontend && npm install && npm run dev`.
5. Open the Vite URL printed in the terminal. Search for a location and run its
	location report to open its interactive Matterport tour and AI review, or
	choose **Run guided demo** to see a simulated floor plan.
6. Follow numbered indoor stops and select a stop to see a photo when available.
   Change the endpoints to match your visit. For step-free planning, mark known
   steps and recalculate the route.
7. Choose **Save to Visit Packet** to keep the findings and questions locally.
   Preview the packet and opt in to including your journal before printing.

The app sends sampled Matterport views and Vexcel aerial imagery to Google
Gemini for analysis. Recent reports retain images
in server memory for inspection.

CoStar is read from the local export; no CoStar API key is used. If Matterport
or Vexcel credentials are missing or a provider is unavailable, the report labels
that evidence accordingly. The route estimator is limited to a single captured
floor and scan-to-scan candidates; it does not verify entrances, destinations,
door clearances, threshold heights, ramp slopes, ADA compliance, or on-site
conditions. Gemini
observations are limited to supplied evidence and are not an accessibility
determination.

## Checks

Run the backend tests with `python3 -m unittest discover -s backend/tests -v`.
Build the frontend with `cd frontend && npm run build`.

Barrier evidence photos now show red ellipses using Gemini's normalized `box_2d`
coordinates. The indoor review ties each box to an exact evidence image; aerial
boxes appear on the Vexcel image. Missing or invalid boxes retain the text finding
without inventing a location. Rerun an existing report to request locations.
Evidence-image outlines are separate from the automatic 3D markers described below.


### Automatic markers inside the Matterport tour

Set a public `MATTERPORT_SDK_KEY` in the root `.env` and open the app on a host
allowed by that key (for localhost keys, use `http://localhost:5175`). The ordinary
tour remains available if the SDK cannot connect.

When the camera settles, the app automatically captures the current SDK view,
sends it to the compact server-side Gemini review endpoint, and raycasts an explicit
visible-surface point inside each image box into Matterport geometry. Red native tags show localized
findings and personalized explanations. Visitors do not place or approve markers.
The app also checks the initial view without a button click.

Analysis is serial, debounced by 1.5 seconds, and limited to eight completed views
and twelve total attempts per report session. Failed or camera-interrupted views
may retry once automatically; failed attempts do not count as completed views. It does not move the camera automatically or inspect the
whole building. Views changed during analysis are discarded to avoid applying
coordinates to the wrong viewpoint. Missing boxes and unsuccessful surface hits
remain text findings. Nearby 3D detections are deduplicated. Tags live for the
report session and are removed on exit; old manual placements are no longer read.
Screenshot review uses Gemini and may incur normal provider API usage.

Exact walkthrough links are attached to detections captured inside the SDK tour;
they restore that marker's own scan, rotation and zoom. Report photo findings have
**Open source scan** links: those resolve Model API scan UUIDs against the loaded
SDK sweep collection, but cannot promise the source skybox's facing direction.
Unknown scan IDs are rejected rather than guessed. Native viewport screenshots,
zoom/projection change guards, surface-point validation and a six-pixel
reprojection check limit placement mismatch; the pins have no raised stem offset.
Geometry gaps and AI localization errors can still prevent accurate placement.

Pins are lifted 1.5 cm toward their capture camera along the same ray to avoid
being hidden in the scanned mesh. The status distinguishes no detected barrier
from a detected feature without reliable geometry, with placement reasons listed.

Live pin detection uses `/api/walkthrough-review`, requesting only short findings
and their image positions rather than a full report with summary and staff
questions. The report's normal photo review retains its full response. Expand
**Last view analysis timing** under the tour to compare screenshot capture,
AI request plus network, and 3D placement durations. This does not measure pure
model inference separately from provider queuing or network latency.
