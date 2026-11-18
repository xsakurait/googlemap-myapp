/** 空港コード解決（飛行機検索用）: 地名・駅名の文字列から IATA 空港コードを返す */

const AIRPORT_KEYWORDS: [string, string][] = [
  ["新千歳", "CTS"],
  ["札幌", "CTS"],
  ["千歳", "CTS"],
  ["羽田", "HND"],
  ["成田", "NRT"],
  ["東京", "HND"],
  ["伊丹", "ITM"],
  ["関西", "KIX"],
  ["関空", "KIX"],
  ["大阪", "ITM"],
  ["中部", "NGO"],
  ["セントレア", "NGO"],
  ["名古屋", "NGO"],
  ["福岡", "FUK"],
  ["那覇", "OKA"],
  ["沖縄", "OKA"],
  ["仙台", "SDJ"],
  ["神戸", "UKB"],
  ["広島", "HIJ"],
  ["松山", "MYJ"],
  ["高松", "TAK"],
  ["鹿児島", "KOJ"],
  ["宮崎", "KMI"],
  ["熊本", "KMJ"],
  ["長崎", "NGS"],
  ["新潟", "KIJ"],
  ["小松", "KMQ"],
  ["岡山", "OKJ"],
  ["北九州", "KKJ"],
  ["函館", "HKD"],
  ["青森", "AOJ"],
  ["秋田", "AXT"],
  ["旭川", "AKJ"],
  ["帯広", "OBO"],
  ["釧路", "KUH"],
];

/** 地名・駅名から空港コードを解決する。解決できない場合は null */
export function resolveAirportCode(text: string): string | null {
  const trimmed = text.trim();
  const code = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) return code;
  for (const [keyword, iata] of AIRPORT_KEYWORDS) {
    if (trimmed.includes(keyword)) return iata;
  }
  return null;
}
