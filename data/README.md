# Data

`public/data/places.json` (TopoJSON, committed) is generated from the sources below plus the curated files in `curated/`.

```sh
npm run data:fetch   # downloads raw sources into data/raw/ (gitignored)
npm run data:build   # validates + simplifies → public/data/places.json
```

`data:build` fails if validation finds problems (neighborhood without zone, unknown names in curated files, alias colliding with another place's name, duplicate ids, empty geometry, output over the size budget). Simplification level can be overridden with `SIMPLIFY=30% npm run data:build`.

## Sources

| Data                            | Source                                                                                                                                                                                                                                              | Notes                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Rio neighborhoods (167)         | Prefeitura do Rio de Janeiro / Instituto Pereira Passos (IPP) — "Limite de Bairros", [ArcGIS service](https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Cartografia/Limites_administrativos/MapServer/4) (also on [Data.Rio](https://www.data.rio/)) | Open data published by the city. Attribution: "Instituto Pereira Passos, PCRJ". |
| Municipal boundaries            | IBGE — [malhas API](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3), RJ state (UF 33), municipality level                                                                                                                                | Attribution: IBGE.                                                              |
| Metropolitan Region composition | IBGE — [Composição das Regiões Metropolitanas 2025](https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/municipios_por_regioes_metropolitanas/Situacao_2020a2029/)                                                           | 22 municipalities incl. Rio (State Complementary Law 184/2018).                 |

## Curated files

- `curated/zones.json` — popular zone of each neighborhood (Centro, Zona Sul, Norte, Oeste, Sudoeste). See `_notes` for the rules and borderline decisions.
- `curated/rmrj.json` — RMRJ municipalities other than Rio (IBGE code + display name).
- `curated/overrides.json` — display names and accepted aliases.

## Processing

1. Raw properties are mapped to `{ id, kind, name, zone?, aliases[] }` (see `src/types.ts`). Ids: `nb-<IPP code>`, `mun-<IBGE code>`.
2. Municipal polygons have any overlap with Rio's neighborhoods erased (IBGE and IPP borders don't match exactly).
3. Geometry is simplified (Visvalingam, `keep-shapes` so no small neighborhood disappears) and written as TopoJSON with two objects: `neighborhoods` and `municipalities`.
