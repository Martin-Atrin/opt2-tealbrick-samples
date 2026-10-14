# Third-party notices

This repository holds four dev-only spine-test apps (`sample-gate`, `sample-caller`, `sample-pay`, `sample-mismatch`).
Their own code is Apache-2.0 (see `LICENSE` and `NOTICE`). They include the software and assets below under their own
licences. The four apps use the same dependency versions (one lockfile content per app, checked equal). Update this file
when you add a dependency, a vendored file or a companion image.

## Vendored into the built UI (`dist/ui` of each app)

The UI build (`scripts/build-ui.ts`) copies these files into the app image.

| Name | Version | Licence | Source |
|---|---|---|---|
| React (`react`) | 19.3.0 | MIT | https://github.com/facebook/react |
| React DOM (`react-dom`) | 19.3.0 | MIT | https://github.com/facebook/react |
| `scheduler` | 0.28.0 | MIT | https://github.com/facebook/react |
| `@opt2-tealbrick/ui` (Tealbrick design system kit: tokens, components, CSS) | 0.2.3 | MIT | https://github.com/Martin-Atrin/opt2-tealbrick-packages |
| `@opt2-tealbrick/miniapp-sdk/client` and `@opt2-tealbrick/spec/bridge` (browser modules only) | 0.1.16 / 0.1.18 | MIT | see the next section |
| Nunito (variable font, `vendor/@opt2-tealbrick/ui/dist/fonts/*.woff2`) | 5.3.0 (`@fontsource-variable/nunito`) | SIL Open Font License 1.1 | https://github.com/googlefonts/nunito |

- Nunito is Copyright 2014 The Nunito Project Authors. Its licence text ships next to the font files as
  `vendor/@opt2-tealbrick/ui/dist/fonts/OFL.txt`.
- The Tealbrick brand mark (inside `@opt2-tealbrick/ui`) is Tealbrick artwork. It is **not** covered by the Apache-2.0
  licence of this repository and is not licensed for reuse outside Tealbrick products. The sample apps ship no app stills.

## Runtime dependencies in the image (production `node_modules`)

| Name | Version | Licence | Source |
|---|---|---|---|
| `@opt2-tealbrick/miniapp-sdk` | 0.1.16 | MIT | https://github.com/Martin-Atrin/opt2-tealbrick-sdk |
| `@opt2-tealbrick/manifest` | 0.1.12 | MIT | https://github.com/Martin-Atrin/opt2-tealbrick-sdk |
| `@opt2-tealbrick/spec` (dependency of the SDK) | 0.1.18 | MIT | https://github.com/Martin-Atrin/opt2-tealbrick-specs |
| `ajv` (dependency of the manifest package) | 8.17.1 | MIT | https://github.com/ajv-validator/ajv |
| `fast-deep-equal` (ajv) | 3.1.3 | MIT | https://github.com/epoberezkin/fast-deep-equal |
| `fast-uri` (ajv) | 3.1.8 | BSD-3-Clause | https://github.com/fastify/fast-uri |
| `json-schema-traverse` (ajv) | 1.0.0 | MIT | https://github.com/epoberezkin/json-schema-traverse |
| `require-from-string` (ajv) | 2.0.2 | MIT | https://github.com/floatdrop/require-from-string |

## Base image

`node:24-slim` (Dockerfile of each app): Node.js (MIT, with bundled components under their own licences) on Debian (the
licences of its packages are in `/usr/share/doc/*/copyright` inside the image).

## Development only (not shipped)

TypeScript, Biome, `@types/*`, happy-dom and `@opt2-tealbrick/conformance` are used to build and test the apps and are
not part of the image.
