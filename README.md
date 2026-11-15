# LocaleGate

LocaleGate helps release and localization teams catch translations that change the approved announcement. The publisher freezes the source copy and up to four target locales. GenLayer validators independently compare each submitted translation with the source and agree on a verdict. The contract enables on-chain publication when every target's current verdict is `MATCH`. Earlier attempts remain readable after correction and after publication.

For example, an English announcement sets a price of $19. A Spanish draft that says $49 receives `MATERIAL_DRIFT`; corrected copy can then be reviewed again. The contract treats inconclusive reviews as unresolved, so they also block publication.

## Run locally

Use Node.js 22+.

```bash
npm ci
npm test
npm run build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://localhost:4173. The ZIP also includes a ready-to-host `dist/`. For GitHub Pages, copy the contents of `dist/` into `docs/`, add `docs/.nojekyll`, and set the Pages source to `main` and `/docs`. The app uses relative assets and connects to Studionet directly. It needs no backend or environment variables.

## Review a release

Read-only access works without a wallet. Use **Load example release** to inspect the published demo. Under **Review history**, select **Previous** to see the rejected $49 translation. Use **Next** to see the $19 correction.

To make a fresh release, connect an EIP-1193 wallet on GenLayer Studionet (chain ID `61999`). Select **New release**, enter a title, source language tag, target language tags separated by commas, and source copy. After signing, follow **Activity** until the transaction finalizes and use **Open release** to load it. Select each target and use **Review translation** to submit copy. Once all latest attempts match, sign **Publish release** and check that the finalized release shows **Published**. Release text and review attempts are public.

## Reproduce the demo

Create a release called `Export add-on launch` with source locale `en` and target locale `es`.

| Field | Copy |
| --- | --- |
| Approved source | On December 15, Pro subscribers in Brazil can buy the export add-on for $19. |
| First Spanish attempt | El 15 de diciembre, los suscriptores Pro en Brasil podrán comprar el complemento de exportación por 49 USD. |
| Corrected Spanish attempt | El 15 de diciembre, los suscriptores Pro en Brasil podrán comprar el complemento de exportación por 19 USD. |

Wait for each write to finalize in **Activity**. The first attempt should show **Material drift** and keep **Publish release** disabled. After the correction shows **Source matched**, sign the publication and verify **Published**. Both translation attempts remain in **Review history**.

## Contract verification

- [Studionet deployment](https://explorer-studio.genlayer.com/address/0x4b8Ae33a365657986B5f0D4BA6195aE291505A2b)
- [Deployment and live demo receipts](contract/deployment_info.json)
- [Intelligent Contract](contract/contracts/locale_gate.py)

Use Python 3.12 for direct tests and lint.

```bash
cd contract
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
genvm-lint check contracts/locale_gate.py
python -m pytest tests/direct/ -q
```

`python deploy_studionet.py` deploys a fresh instance using a temporary test wallet. `python demo_studionet.py` runs the public example on the configured deployment and records its receipts. Update `src/deployment.json` with your deployment's `contract_address` and optional `demo.release_id` if you use a separate instance, then rebuild.
