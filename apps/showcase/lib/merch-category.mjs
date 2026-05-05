/**
 * Offline retail merch buckets — stratified CSV demo + mirrored search boosts (csv-demo-search).
 */

export const CATEGORY_TARGET_FRACTIONS = {
  home_living: 0.125,
  tops_tees: 0.1,
  tops_shirts_blouses: 0.055,
  knitwear: 0.048,
  outerwear: 0.065,
  bottoms_jeans: 0.065,
  bottoms_trousers: 0.08,
  bottoms_shorts: 0.05,
  dresses_skirts: 0.05,
  activewear: 0.055,
  footwear_sandals_slides: 0.048,
  footwear_sneakers: 0.045,
  footwear_boots_other: 0.05,
  underwear_lounge_socks: 0.065,
  bags_accessories: 0.075,
  other: 0.075,
};

/**
 * Stable slug from English title + snippet of description (lowercased upstream).
 */
export function inferMerchCategorySlug(nameEn, descSnippet = "") {
  const t = `${String(nameEn || "")} ${String(descSnippet || "")}`.toLowerCase();

  if (
    /\b(vase|cushion|duvet|bed\s*sheet|pillow\b|pillow\s*case|bed\s*linen|bath\s*towel|tea\s*towel|\bcandles?\b|candle\s*holder|kitchenware|kitchen\s*cloth|tea\s*towel|\bjug\b|\bpitcher\b|glassware|\b(?:dinner|salad)?plates?\b|\bbowl\b|\bhomeware\b|stoneware\b|decor\b)\b/u.test(
      t,
    )
  ) {
    return "home_living";
  }

  if (/\b(dress(es)?|\bgown\b|\bmaxi\b.*\bdress\b|skirt(s)?|\bjumpsuit\b|\bplaysuit\b)\b/u.test(t)) {
    return "dresses_skirts";
  }

  if (
    /\b(t[\s'-]*shirt|tshirts?|\bgraphic\s*tee\b|crew\s*neck\s*tee|oversized\s*tee|rugby\s+shirt)\b|\btee\b\s*(pack|shirt)?\s*(pack\b)?|\b\d[\s.-]*pack\b.*\btee\b|\bpack\b.*\bt[\s'-]*shirt/u.test(
      t,
    )
  ) {
    return "tops_tees";
  }

  if (
    (/\bbutton[-\s]down\b|\boxford\b|\blinen\b.*\bshirt\b|\bwoven\b.*\bshirt\b|\bdress\s*shirt\b|\bcasual\s+shirt\b|\bblouse\b|\bkurta\b|\bpopover\b\s*shirt/u.test(t) ||
      (/\bshirt\b|\bblouse\b/u.test(t) && !/\bt[\s'-]*shirt\b|\btshirts?\b/u.test(t)))
  ) {
    return "tops_shirts_blouses";
  }

  if (/\b(jacket|coat|parka|blazer|gilet|bodywarmer|\banorak\b|puffer|windbreaker|hoodie\b|zip\s*hoodie|\bcardigan\b)\b/u.test(t)) {
    return "outerwear";
  }

  if (/\b(jumper|sweater|knitwear|knitted|pull(?:over)?)\b/u.test(t)) return "knitwear";

  if (
    /\b(gym\b|yoga\b|workout\b|training\s+top\b|sports\s+top\b|\bleggings\b|running\s+tights\b|athletic\s+wear\b)/u.test(t)
  ) {
    return "activewear";
  }

  if (/\bjeans?\b|\bdenim\b/u.test(t)) return "bottoms_jeans";

  if (/\bshorts\b|\bbermuda\b|\bcargo\s+short/u.test(t)) return "bottoms_shorts";

  if (/\bjoggers?\b|\bsweatpants?\b|\btracksuit\b(?!\s*top)|track\s*pants?\b|\bchinos?\b|\bculottes?\b|\bpalazzo\b|\b(trousers?|pants?)\b(?!\s*vest)/u.test(t)) {
    return "bottoms_trousers";
  }

  if (/\bsandal|slides?\b|\bmules\b|\bflip[-\s]*flops?\b|\bslides\b/u.test(t)) return "footwear_sandals_slides";

  if (/\bsneaker|trainers?\b|running\s*shoes?/u.test(t)) return "footwear_sneakers";

  if (/\bboot\b|chelsea\b|ankle\s*boot|loafers?\b|espadrilles?\b|pumps\b|\bkitten\s*heels?\b|heel\b/u.test(t))
    return "footwear_boots_other";

  if (/\b(?:leather\s+)?shoes\b|\bfootwear\b/u.test(t)) return "footwear_boots_other";

  if (/lounge\s*shirt|tracksuit\b|pyjama|pajama|loungewear|robe\b|briefs\b|boxers?\b|\bundershirts?\b|thermal\s*tights\b/u.test(t))
    return "underwear_lounge_socks";

  if (/\b(underwear|socks\b|(?:knee|running)\s+socks\b|tights\b|\bsports\s*bra\b)\b/u.test(t)) {
    return "underwear_lounge_socks";
  }

  if (/\b(bag\b|backpack|tote\b|wallet|belt\b|scarf|beanie|baseball\s*cap|cap\b(?!\s*acity)|\that\b|neck\s*tie|bow\s*tie|jewell?ery|sunglasses|keyring)\b/u.test(t)) {
    return "bags_accessories";
  }

  return "other";
}

/** Integer seat counts per bucket for stratified cap N (sum = totalCap). */
export function computeCategoryTargets(totalCap) {
  const keys = Object.keys(CATEGORY_TARGET_FRACTIONS);
  const raw = keys.map((k) => ({
    k,
    w: /** @type {Record<string, number>} */ (CATEGORY_TARGET_FRACTIONS)[k],
  }));
  const sumW = raw.reduce((a, b) => a + b.w, 0);
  const seats = raw.map(({ k, w }) => ({ k, n: Math.floor((totalCap * w) / sumW) }));
  let used = seats.reduce((a, b) => a + b.n, 0);
  let i = 0;
  while (used < totalCap) {
    seats[i % seats.length].n += 1;
    used += 1;
    i += 1;
  }
  return Object.fromEntries(seats.map((s) => [s.k, s.n]));
}
