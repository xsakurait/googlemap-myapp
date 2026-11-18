/**
 * モックフィクスチャ。Google Routes API の実応答に近い形。
 * 候補3件：運賃あり2件（直通で高い／乗り換え1回で安い）＋運賃なし1件。
 */
export const MOCK_GOOGLE_RESPONSE = {
  routes: [
    {
      duration: "1980s",
      distanceMeters: 14800,
      travelAdvisories: {
        transitFare: { currencyCode: "JPY", units: "230", nanos: 0 },
      },
      legs: [
        {
          startTime: "2026-11-17T01:03:00Z",
          endTime: "2026-11-17T01:36:00Z",
          steps: [
            { travelMode: "WALK", staticDuration: "300s", distanceMeters: 420 },
            {
              travelMode: "TRANSIT",
              staticDuration: "1500s",
              distanceMeters: 13900,
              transitDetails: {
                stopDetails: {
                  departureStop: { name: "品川" },
                  arrivalStop: { name: "新宿" },
                  departureTime: "2026-11-17T01:08:00Z",
                  arrivalTime: "2026-11-17T01:33:00Z",
                },
                headsign: "新宿・池袋方面",
                line: { name: "山手線", nameShort: "山手線", vehicle: { type: "TRAIN", name: "電車" } },
                stopCount: 10,
              },
            },
            { travelMode: "WALK", staticDuration: "180s", distanceMeters: 240 },
          ],
        },
      ],
    },
    {
      duration: "2700s",
      distanceMeters: 15200,
      travelAdvisories: {
        transitFare: { currencyCode: "JPY", units: "180", nanos: 0 },
      },
      legs: [
        {
          startTime: "2026-11-17T01:05:00Z",
          endTime: "2026-11-17T01:50:00Z",
          steps: [
            { travelMode: "WALK", staticDuration: "300s", distanceMeters: 420 },
            {
              travelMode: "TRANSIT",
              staticDuration: "360s",
              distanceMeters: 2100,
              transitDetails: {
                stopDetails: {
                  departureStop: { name: "品川" },
                  arrivalStop: { name: "浜松町" },
                  departureTime: "2026-11-17T01:10:00Z",
                  arrivalTime: "2026-11-17T01:16:00Z",
                },
                headsign: "大宮方面",
                line: { name: "京浜東北線", nameShort: "京浜東北線", vehicle: { type: "TRAIN", name: "電車" } },
                stopCount: 3,
              },
            },
            {
              travelMode: "TRANSIT",
              staticDuration: "1500s",
              distanceMeters: 12400,
              transitDetails: {
                stopDetails: {
                  departureStop: { name: "浜松町" },
                  arrivalStop: { name: "新宿" },
                  departureTime: "2026-11-17T01:19:00Z",
                  arrivalTime: "2026-11-17T01:44:00Z",
                },
                headsign: "新宿・池袋方面",
                line: { name: "山手線", nameShort: "山手線", vehicle: { type: "TRAIN", name: "電車" } },
                stopCount: 9,
              },
            },
            { travelMode: "WALK", staticDuration: "360s", distanceMeters: 480 },
          ],
        },
      ],
    },
    {
      duration: "2100s",
      distanceMeters: 14100,
      // travelAdvisories なし = 運賃不明ルート
      legs: [
        {
          startTime: "2026-11-17T01:04:00Z",
          endTime: "2026-11-17T01:39:00Z",
          steps: [
            { travelMode: "WALK", staticDuration: "240s", distanceMeters: 350 },
            {
              travelMode: "TRANSIT",
              staticDuration: "600s",
              distanceMeters: 4300,
              transitDetails: {
                stopDetails: {
                  departureStop: { name: "品川" },
                  arrivalStop: { name: "泉岳寺" },
                  departureTime: "2026-11-17T01:08:00Z",
                  arrivalTime: "2026-11-17T01:18:00Z",
                },
                headsign: "西馬込方面",
                line: { name: "京急本線", nameShort: "京急本線", vehicle: { type: "TRAIN", name: "電車" } },
                stopCount: 2,
              },
            },
            {
              travelMode: "TRANSIT",
              staticDuration: "1080s",
              distanceMeters: 9200,
              transitDetails: {
                stopDetails: {
                  departureStop: { name: "泉岳寺" },
                  arrivalStop: { name: "新宿三丁目" },
                  departureTime: "2026-11-17T01:20:00Z",
                  arrivalTime: "2026-11-17T01:38:00Z",
                },
                headsign: "笹塚方面",
                line: { name: "都営新宿線", nameShort: "都営新宿線", vehicle: { type: "SUBWAY", name: "地下鉄" } },
                stopCount: 8,
              },
            },
            { travelMode: "WALK", staticDuration: "60s", distanceMeters: 80 },
          ],
        },
      ],
    },
  ],
};
