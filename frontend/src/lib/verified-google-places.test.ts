import { getVerifiedGoogleCoverPlaceId, getVerifiedGooglePlaceId, type GoogleCoverSpot, type GooglePlaceSpot } from "./verified-google-places";

const spot: GooglePlaceSpot = {
  spotId: 942, title: "임계식당", address: "강원특별자치도 강릉시 중앙시장길22-2(성남동)",
  latitude: 37.7535599, longitude: 128.8988371, thumbnail: null, images: [],
};
const entry = { ...spot, placeId: "ChIJ_verified-place" };
const catalog = { version: 1, places: [entry] };

test("uses only the approved place with exactly matching source identity and no photo", () => {
  expect(getVerifiedGooglePlaceId(spot, catalog)).toBe(entry.placeId);
  expect(getVerifiedGooglePlaceId({ ...spot, thumbnail: " ", images: [null, " "] }, catalog)).toBe(entry.placeId);
  expect(getVerifiedGooglePlaceId({ ...spot, latitude: Number("37.753559900") }, catalog)).toBe(entry.placeId);
});

test.each([
  { spotId: 943 }, { title: "임계식당 2호점" }, { address: `${spot.address} 2층` },
  { latitude: 37.75356 }, { longitude: 128.89884 }, { latitude: null }, { longitude: null },
  { latitude: NaN }, { longitude: Infinity }, { address: null },
])("rejects missing or changed identity %j", (change) => {
  expect(getVerifiedGooglePlaceId({ ...spot, ...change }, catalog)).toBeNull();
});

test.each([
  { thumbnail: "https://example.com/existing.jpg" },
  { images: [null, "https://example.com/gallery.jpg"] },
])("keeps existing source photos %j", (change) => {
  expect(getVerifiedGooglePlaceId({ ...spot, ...change }, catalog)).toBeNull();
});

test.each([
  null, {}, { version: 2, places: [entry] }, { version: 1, places: null },
  { version: 1, places: [entry, entry] },
  { version: 1, places: [{ ...entry, placeId: "" }] },
  { version: 1, places: [{ ...entry, placeId: "https://example.com/photo" }] },
])("fails closed for an invalid or ambiguous catalog %j", (invalid) => {
  expect(getVerifiedGooglePlaceId(spot, invalid)).toBeNull();
});

const coverSpot: GoogleCoverSpot = {
  spotId: spot.spotId, title: spot.title, latitude: spot.latitude, longitude: spot.longitude, thumbnail: null,
};

test("approves an address-free list item only when its id, title and coordinates all match", () => {
  expect(getVerifiedGoogleCoverPlaceId(coverSpot, catalog)).toBe(entry.placeId);
  expect(getVerifiedGoogleCoverPlaceId({ ...coverSpot, thumbnail: " ", images: [null, " "] }, catalog)).toBe(entry.placeId);
  expect(getVerifiedGoogleCoverPlaceId({ ...coverSpot, address: spot.address }, catalog)).toBe(entry.placeId);
});

test.each([
  { spotId: 943 }, { title: "임계식당 2호점" }, { address: `${spot.address} 2층` },
  { latitude: 37.75356 }, { longitude: 128.89884 }, { latitude: null }, { longitude: null },
  { latitude: NaN }, { longitude: Infinity }, { latitude: undefined }, { longitude: undefined },
  { address: null }, { address: "" }, { thumbnail: "https://example.com/existing.jpg" },
  { images: [null, "https://example.com/gallery.jpg"] },
])("rejects covers with missing or changed identity, provided address, or existing photos %j", (change) => {
  expect(getVerifiedGoogleCoverPlaceId({ ...coverSpot, ...change }, catalog)).toBeNull();
});

test.each([
  null, {}, { version: 2, places: [entry] }, { version: 1, places: null },
  { version: 1, places: [entry, entry] },
  { version: 1, places: [{ ...entry, placeId: "" }] },
  { version: 1, places: [{ ...entry, placeId: "https://example.com/photo" }] },
])("does not approve covers through an invalid or ambiguous catalog %j", (invalid) => {
  expect(getVerifiedGoogleCoverPlaceId(coverSpot, invalid)).toBeNull();
});

test("list cover approval does not relax the detail page's required address check", () => {
  expect(getVerifiedGoogleCoverPlaceId(coverSpot, catalog)).toBe(entry.placeId);
  expect(getVerifiedGooglePlaceId({ ...spot, address: null }, catalog)).toBeNull();
});
