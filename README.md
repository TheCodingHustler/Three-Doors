# Three Doors

Three Doors helps people prepare for an appointment. Access Scan searches a local
CoStar/Matterport property cross-reference, presents a location report, and offers
a guided example floor plan. Live reports embed the Matterport walkthrough and
ask Gemini to review sampled scan views with available room measurements. It is
a planning aid, not an accessibility certification.

## Run locally

The building list and guided demo work without API keys. The local catalog reads
`~/Downloads/models_index.csv` and
`~/Downloads/costar-hackathon-kit/commercial-properties.csv`; set
`MATTERPORT_INDEX` or `COSTAR_DATA_DIR` in `.env` to use other paths. Optional
Gemini review uses the local Python proxy, so the API key is never sent to the
browser. Live Matterport room dimensions, floor geometry, and scan faces plus
Vexcel aerial imagery are requested when their credentials are configured.

1. Install Node.js 20.19+ and Python 3.9+.
2. Copy `.env.example` to `.env`. Add a valid `GEMINI_API_KEY` for walkthrough review,
   and optionally Matterport API key/token and a Vexcel API key for live evidence.
   Never commit or share credentials.
3. In one terminal, run `python3 -m backend.server` from the repository root.
4. In another terminal, run `cd frontend && npm install && npm run dev`.
5. Open the Vite URL printed in the terminal. Search for a location and run its
	location report to open its interactive Matterport tour and AI review, or
	choose **Run guided demo** to see a simulated floor plan.

The app sends sampled Matterport scan faces and room-level metric measurements to
Google Gemini for analysis. The app does not store these images. Review Google's
current API data terms before use.

CoStar is read from the local export; no CoStar API key is used. If Matterport
or Vexcel credentials are missing or a provider is unavailable, the report labels
that evidence accordingly. The route estimator is limited to a single captured
floor and scan-to-scan candidates; it does not verify entrances, destinations,
door clearances, threshold heights, ramp slopes, ADA compliance, or on-site
conditions. Matterport room dimensions are not doorway measurements. Gemini
observations are limited to supplied evidence and are not an accessibility
determination.

## Checks

Run the backend tests with `python3 -m unittest discover -s backend/tests -v`.
Build the frontend with `cd frontend && npm run build`.
