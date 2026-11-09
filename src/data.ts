import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { FeatureCollection, Geometry } from 'geojson';
import type { PlaceProps } from './types.ts';
import type { PlacesData } from './map/mapView.ts';

type PlacesTopology = Topology<{
  neighborhoods: GeometryCollection<PlaceProps>;
  municipalities: GeometryCollection<PlaceProps>;
}>;

export async function loadPlaces(): Promise<PlacesData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/places.json`);
  if (!res.ok) throw new Error(`Failed to load places: HTTP ${res.status}`);
  const topo = (await res.json()) as PlacesTopology;
  return {
    neighborhoods: feature(topo, topo.objects.neighborhoods) as FeatureCollection<
      Geometry,
      PlaceProps
    >,
    municipalities: feature(topo, topo.objects.municipalities) as FeatureCollection<
      Geometry,
      PlaceProps
    >,
  };
}
