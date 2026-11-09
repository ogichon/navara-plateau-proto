# Local dist capture feasibility probe

Run from the repository root (Node 24, existing playwright-core; no new package):

```sh
npx vite build
node tools/capture/capture.cjs
# Optional approved browser executable:
CHROME_PATH=/path/to/chrome node tools/capture/capture.cjs
python3 tools/capture/stats.py tools/capture/samples/awakening-*.png
```

The script serves only dist on an ephemeral loopback port, opens awakening.html
at its unchanged Tokyo/Before defaults in 1280×720 headless Chromium with ANGLE
SwiftShader, waits for __ready then 30 seconds, and takes three PNGs 10 seconds
apart. It closes browser/server and writes samples/run.json even on failure.
The 30-second delay is a starting point, **not tile-completion proof**. Use the
statistics script (Pillow) to compare frames; moving clouds prevent exact equality.
Inspect the PNGs for buildings, aerial photo and sky, and examine response/error
counts before accepting a capture. Uniformity or a small difference alone cannot
prove city content. This prototype does not implement automatic success scoring.

This VM run was blocked at browser startup by mandatory domain policy; loopback
listen is also denied. samples/run.json is a failure record, not rendering evidence.
No sample PNG exists. Do not bypass the policy or remove security restrictions.
Use an execution environment with approved browser policy, loopback serving and
access to PLATEAU / GSI / Re:Earth endpoints. No deploy is needed.
