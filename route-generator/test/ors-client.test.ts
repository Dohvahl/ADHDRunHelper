import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrsError, fetchRoundTrip } from '../src/ors-client.js';

/** Minimal but structurally real ORS GeoJSON directions response. */
const ORS_RESPONSE = {
  features: [
    {
      geometry: {
        type: 'LineString',
        coordinates: [
          [-0.12, 51.5],
          [-0.119, 51.5],
          [-0.119, 51.501],
        ],
      },
      properties: {
        summary: { distance: 5012.3, duration: 3600 },
        segments: [
          {
            steps: [
              { type: 11, way_points: [0, 1] },
              { type: 0, way_points: [1, 2] },
            ],
          },
        ],
      },
    },
  ],
};

beforeEach(() => {
  process.env.ORS_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ORS_API_KEY;
});

function stubFetch(response: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => response });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('fetchRoundTrip', () => {
  it('posts the round_trip request ORS expects', async () => {
    const fetchMock = stubFetch(ORS_RESPONSE);
    await fetchRoundTrip(51.5, -0.12, 5000, 2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openrouteservice.org/v2/directions/foot-walking/geojson');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('test-key');

    const body = JSON.parse(init.body);
    // ORS wants [lng, lat], and round_trip takes exactly the one start coordinate.
    expect(body.coordinates).toEqual([[-0.12, 51.5]]);
    expect(body.options.round_trip).toEqual({ length: 5000, points: 3, seed: 2 });
  });

  it('parses distance, geometry and flattened steps into a Candidate', async () => {
    stubFetch(ORS_RESPONSE);
    const candidate = await fetchRoundTrip(51.5, -0.12, 5000, 0);

    expect(candidate).not.toBeNull();
    expect(candidate!.distanceM).toBe(5012.3);
    expect(candidate!.geometry).toHaveLength(3);
    expect(candidate!.geometry[0]).toEqual([-0.12, 51.5]);
    expect(candidate!.steps).toEqual([
      { type: 11, way_points: [0, 1] },
      { type: 0, way_points: [1, 2] },
    ]);
  });

  it('flattens steps across multiple segments', async () => {
    stubFetch({
      features: [
        {
          geometry: { coordinates: [[-0.12, 51.5]] },
          properties: {
            summary: { distance: 5000 },
            segments: [{ steps: [{ type: 0, way_points: [0, 1] }] }, { steps: [{ type: 1, way_points: [1, 2] }] }],
          },
        },
      ],
    });
    const candidate = await fetchRoundTrip(51.5, -0.12, 5000, 0);
    expect(candidate!.steps).toEqual([
      { type: 0, way_points: [0, 1] },
      { type: 1, way_points: [1, 2] },
    ]);
  });

  it('resolves null when ORS returns no features', async () => {
    stubFetch({ features: [] });
    expect(await fetchRoundTrip(51.5, -0.12, 5000, 0)).toBeNull();
  });

  it('resolves null when the response has no features key at all', async () => {
    stubFetch({});
    expect(await fetchRoundTrip(51.5, -0.12, 5000, 0)).toBeNull();
  });

  it('throws OrsError on an HTTP failure, with the status in the message', async () => {
    stubFetch({ error: 'rate limited' }, false, 429);
    await expect(fetchRoundTrip(51.5, -0.12, 5000, 0)).rejects.toThrow(OrsError);
    await expect(fetchRoundTrip(51.5, -0.12, 5000, 0)).rejects.toThrow('429');
  });

  it('throws when the API key is missing, without calling fetch', async () => {
    delete process.env.ORS_API_KEY;
    const fetchMock = stubFetch(ORS_RESPONSE);
    await expect(fetchRoundTrip(51.5, -0.12, 5000, 0)).rejects.toThrow('ORS_API_KEY is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A genuine network failure (fetch rejects) IS an ORS problem -> OrsError -> 502.
  // This must survive the refactor; it's the behaviour worth keeping.
  it('wraps a network failure as OrsError', async () => {
    const fn = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fn);
    await expect(fetchRoundTrip(51.5, -0.12, 5000, 0)).rejects.toBeInstanceOf(OrsError);
  });

  // A structurally broken response is OUR parsing bug, not an ORS outage. It must
  // NOT be laundered into an OrsError, or a 502 would blame ORS for our mistake.
  // Currently RED: the blanket catch wraps the parse TypeError as OrsError.
  it('does not disguise a malformed response as an ORS outage', async () => {
    // feature present, but properties.summary is missing -> reading .distance throws.
    stubFetch({ features: [{ geometry: { coordinates: [[-0.12, 51.5]] }, properties: { segments: [] } }] });

    await expect(fetchRoundTrip(51.5, -0.12, 5000, 0)).rejects.toThrow();
    await expect(fetchRoundTrip(51.5, -0.12, 5000, 0)).rejects.not.toBeInstanceOf(OrsError);
  });
});
