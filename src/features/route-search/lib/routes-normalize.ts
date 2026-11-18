import type { NormalizedRoute, RouteSegment } from "./types";
import { parseDurationSeconds } from "./time";

/** Google Routes API 応答のうち本アプリが使う部分の型（ゆるい定義） */
interface GoogleStopDetails {
  departureStop?: { name?: string };
  arrivalStop?: { name?: string };
  departureTime?: string;
  arrivalTime?: string;
}
interface GoogleTransitDetails {
  stopDetails?: GoogleStopDetails;
  headsign?: string;
  line?: {
    name?: string;
    nameShort?: string;
    vehicle?: { type?: string; name?: string };
  };
  stopCount?: number;
}
interface GoogleStep {
  travelMode?: string;
  staticDuration?: string;
  distanceMeters?: number;
  transitDetails?: GoogleTransitDetails;
}
interface GoogleLeg {
  startTime?: string;
  endTime?: string;
  steps?: GoogleStep[];
}
interface GoogleRoute {
  duration?: string;
  distanceMeters?: number;
  travelAdvisories?: {
    transitFare?: { currencyCode?: string; units?: string | number; nanos?: number };
  };
  legs?: GoogleLeg[];
}

function fareToYen(route: GoogleRoute): { fareYen: number | null; currencyCode?: string } {
  const fare = route.travelAdvisories?.transitFare;
  if (!fare || fare.units === undefined || fare.units === null) return { fareYen: null };
  const units = Number(fare.units);
  if (!Number.isFinite(units)) return { fareYen: null };
  const yen = Math.round(units + (fare.nanos ?? 0) / 1_000_000_000);
  return { fareYen: yen, currencyCode: fare.currencyCode ?? "JPY" };
}

function segmentFromStep(step: GoogleStep): RouteSegment {
  const durationSeconds = parseDurationSeconds(step.staticDuration);
  if (step.travelMode === "TRANSIT") {
    const td = step.transitDetails;
    const sd = td?.stopDetails;
    let dur = durationSeconds;
    if (sd?.departureTime && sd?.arrivalTime) {
      const diff = (new Date(sd.arrivalTime).getTime() - new Date(sd.departureTime).getTime()) / 1000;
      if (Number.isFinite(diff) && diff >= 0) dur = Math.round(diff);
    }
    return {
      kind: "transit",
      lineName: td?.line?.name ?? td?.line?.nameShort,
      vehicleType: td?.line?.vehicle?.type,
      departureStop: sd?.departureStop?.name,
      arrivalStop: sd?.arrivalStop?.name,
      departureTime: sd?.departureTime,
      arrivalTime: sd?.arrivalTime,
      stopCount: td?.stopCount,
      durationSeconds: dur,
      distanceMeters: step.distanceMeters,
    };
  }
  return { kind: "walk", durationSeconds, distanceMeters: step.distanceMeters };
}

/** Google応答JSONを NormalizedRoute[] に変換する */
export function normalizeRoutes(json: unknown): NormalizedRoute[] {
  if (!json || typeof json !== "object") return [];
  const routes = (json as { routes?: GoogleRoute[] }).routes;
  if (!Array.isArray(routes)) return [];
  return routes.map((route, index) => {
    const legs = Array.isArray(route.legs) ? route.legs : [];
    const steps = legs.flatMap((leg) => (Array.isArray(leg.steps) ? leg.steps : []));
    const transitCount = steps.filter((s) => s.travelMode === "TRANSIT").length;
    const { fareYen, currencyCode } = fareToYen(route);
    const firstTransit = steps.find((s) => s.travelMode === "TRANSIT");
    const lastTransit = [...steps].reverse().find((s) => s.travelMode === "TRANSIT");
    return {
      id: `route-${index}`,
      fareYen,
      currencyCode,
      durationSeconds: parseDurationSeconds(route.duration),
      distanceMeters: typeof route.distanceMeters === "number" ? route.distanceMeters : null,
      departureTime:
        legs[0]?.startTime ?? firstTransit?.transitDetails?.stopDetails?.departureTime ?? null,
      arrivalTime:
        legs[legs.length - 1]?.endTime ??
        lastTransit?.transitDetails?.stopDetails?.arrivalTime ??
        null,
      transfers: Math.max(0, transitCount - 1),
      segments: steps.map(segmentFromStep),
    };
  });
}
