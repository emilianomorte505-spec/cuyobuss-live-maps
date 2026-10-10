import { describe, expect, test } from "bun:test";
import { routesFromCurrentStop, type GoogleTransitRoute } from "./destination-routes";

const origin = { lat: -31.5961434, lng: -68.5162306 };
function journey(line: string, lat = origin.lat): GoogleTransitRoute {
  return { duration: "900s", legs: [{ steps: [{ transitDetails: {
    transitLine: { nameShort: line }, headsign: "Centro",
    stopDetails: { departureStop: { location: { latLng: { latitude: lat, longitude: origin.lng } } }, arrivalStop: { name: "Plaza" } },
  } }] }] };
}
describe("Destination journeys from this stop", () => {
  test("shows a line that boards at this stop", () => {
    expect(routesFromCurrentStop([journey("203")], origin, ["203"])[0]?.lineas).toEqual(["203"]);
  });
  test("never recommends a line absent from this stop", () => {
    expect(routesFromCurrentStop([journey("202")], origin, ["203"])).toEqual([]);
  });
  test("never recommends boarding at a different nearby stop", () => {
    expect(routesFromCurrentStop([journey("203", origin.lat + 0.001)], origin, ["203"])).toEqual([]);
  });
  test("shows connecting lines separately after the first bus", () => {
    const route = journey("203");
    route.legs?.[0]?.steps?.push({ transitDetails: { transitLine: { nameShort: "120" }, stopDetails: { arrivalStop: { name: "Hospital" } } } });
    expect(routesFromCurrentStop([route], origin, ["203"])[0]?.lineas).toEqual(["203", "120"]);
  });
});