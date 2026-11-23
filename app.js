/* T&B Foods — fridge & freezer stock, rotation, shops and spend. */
'use strict';

const CFG = window.TB_CONFIG || {};
const VERSION = '1.0.11';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

/* ---------------- locations & food knowledge ---------------- */
const LOCS = {
  fridge: { short: 'Fridge', long: 'American fridge', spots: ['Top shelf', 'Middle shelf', 'Bottom shelf', 'Salad drawer', 'Door'] },
  freezer: { short: 'Freezer', long: 'American freezer', spots: ['Top drawer', 'Middle drawer', 'Bottom drawer', 'Shelf', 'Door'] },
  beko: { short: 'Beko', long: 'Beko chest freezer', spots: [] },
  pantry: { short: 'Pantry', long: 'Pantry (dry & tinned)', spots: ['Cupboard', 'Shelf', 'Drawer'] },
  prepper: { short: 'Prepper', long: 'Prepper (emergency supplies)', spots: ['Prepper box', 'Shelf', 'Garage', 'Attic'] },
  utilities: { short: 'Utilities', long: 'Utilities (cleaning etc.)', spots: ['Under sink', 'Utility room', 'Bathroom'] },
};
const LOC_ORDER = ['fridge', 'freezer', 'beko', 'pantry', 'prepper', 'utilities'];
const isFoodLoc = (l) => l !== 'utilities' && l !== 'prepper';
const PREPPER_RE = /\bmatch(es)?\b|lighters?\b|firelighters?|candles?|tea ?lights?|torch(es)?|head ?torch|batter(y|ies)|power ?bank|first aid|plasters|gas canisters?|camping (gas|stove)|firewood|logs\b|briquettes|coal\b|duct tape|foil blankets?|water (tablets|filter|purif)|emergency|radio\b|paraffin|rope\b/i;
const UTIL_RE = /bleach|detergent|washing (up|powder|liquid|tablets|pods)|cleaner|cleaning|spray|toilet|loo roll|kitchen roll|bin bag|bin liner|sponge|polish|soap|dishwasher|fabric|softener|wipes|tin foil|cling film|baking paper|hand wash|shampoo|toothpaste|batter(y|ies)|light ?bulb|fairy|domestos|flash|zoflora|dettol|febreze/i;
const PANTRY_RE = /tomato(es)? (puree|tins?)|chopped tomatoes|passata|tuna|pesto|weetabix|cornflakes|krispies|granola|muesli|digestives|chocolate|sauce|olive oil|stock|noodles|couscous|custard|jelly|marmalade|nutella|mustard|wraps|tortillas|breadcrumbs|squash|cordial|wine|beer|beans|pasta|spaghetti|penne|rice|cereal|porridge|oats|flour|sugar|tea bags|teabags|coffee|oil|vinegar|tinned|tin of|crisps|biscuit|noodle|stock cube|gravy|herbs|spice|salt|pepper|ketchup|mayo|jam|honey|peanut butter|nuts|crackers|lentils|chickpeas/i;
const FRIDGE_RE = /\bmilk\b|\bbutter\b|\bcheese\b|cheddar|mozzarella|\beggs?\b|yog|\bcream\b|creme fraiche|coleslaw|hummus|houmous|\bsalad\b|lettuce|cucumber|\bham\b|sliced|\bjuice\b|smoothie|margarine|spread|\bdips?\b/i;
const guessLoc = (name, unit) => PREPPER_RE.test(name) ? 'prepper' : UTIL_RE.test(name) ? 'utilities' : (['tin', 'jar', 'roll', 'sachet'].includes(unit) || PANTRY_RE.test(name)) ? 'pantry'
  : (!/ice ?cream|frozen|cheesecake/i.test(name) && FRIDGE_RE.test(name)) ? 'fridge' : null;
const isFrozenLoc = (l) => l === 'freezer' || l === 'beko';
const WEIGHT_UNITS = ['lb', 'kg', 'g', 'litre'];
const STORES = ['Tesco', 'Dunnes', 'SuperValu', 'Aldi', 'Lidl', 'M&S', 'Centra', 'Butcher'];
const STORE_COLORS = { Tesco: '#00539f', Dunnes: '#1b1b1b', SuperValu: '#d6001c', Aldi: '#00205b', Lidl: '#0050aa', 'M&S': '#2e6b3d', Centra: '#e2001a', Butcher: '#8a3b2b' };
const EMOJI = [
  [/\bmatch(es)?\b|lighters?\b|firelighters?|firewood|logs\b|briquettes|coal\b/, '🔥'], [/candles?|tea ?lights?/, '🕯️'], [/torch/, '🔦'], [/first aid|plasters/, '🩹'], [/power ?bank/, '🔌'], [/radio\b/, '📻'], [/gas canister|camping (gas|stove)/, '⛽'],
  [/bleach|cleaner|cleaning|spray|polish|domestos|dettol|flash|zoflora|febreze/, '🧴'], [/toilet|loo roll|kitchen roll|tissue/, '🧻'], [/sponge|scourer/, '🧽'],
  [/soap|hand wash|shampoo|shower gel|toothpaste/, '🧼'], [/detergent|washing (powder|liquid|tablets|pods)|softener|fabric|dishwasher|fairy|washing up/, '🫧'],
  [/bin bag|bin liner|foil|cling film|baking paper/, '🗑️'], [/batter(y|ies)/, '🔋'], [/light ?bulb/, '💡'],
  [/tin of|tinned|(?<!green |broad |runner |french )beans|chickpeas|lentils|soup/, '🥫'], [/cereal|porridge|oats|granola/, '🥣'], [/flour|sugar/, '🌾'], [/tea bags|teabags|\btea\b/, '🫖'], [/coffee/, '☕'],
  [/crisps/, '🥔'], [/biscuit|cookie|crackers/, '🍪'], [/oil|vinegar|ketchup|mayo|sauce|pesto/, '🫙'], [/jam|honey|peanut butter|nutella/, '🍯'], [/salt|spice|herbs|stock cube|gravy/, '🧂'], [/nuts/, '🥜'],
  [/chilli|chili|curry|stew|casserole|bolognese|soup|goulash|tagine|dahl|dal\b/, '🍲'],
  [/lasagn|pasta|spaghetti|macaroni|penne|ravioli|tortellini|noodle/, '🍝'],
  [/pizza/, '🍕'], [/burger/, '🍔'], [/sausage|hot dog|frank/, '🌭'], [/bacon|rasher/, '🥓'],
  [/chicken|turkey|kiev|wing|drumstick|thigh|nugget|goujon/, '🍗'],
  [/beef|steak|mince|lamb|pork|chop|joint|ham|gammon|meat|rib/, '🥩'],
  [/fish|salmon|cod|haddock|prawn|shrimp|tuna|scampi|hake|seafood/, '🐟'],
  [/ice ?cream|gelato|sorbet|lolly/, '🍨'], [/cake|dessert|tart|pie|crumble|cheesecake|brownie|muffin|pastry|croissant/, '🍰'],
  [/bread|baguette|loaf|roll|bagel|wrap|naan|pitta|bun|scone|toast/, '🥖'],
  [/milk|cream|yog|yogh/, '🥛'], [/cheese|cheddar|brie|mozzarella/, '🧀'], [/egg/, '🥚'], [/butter/, '🧈'],
  [/rasp|blueberr|strawberr|berr|fruit|cherr|mango/, '🫐'], [/lemon|lime/, '🍋'], [/apple/, '🍎'], [/banana/, '🍌'], [/orange|clementine/, '🍊'],
  [/chip|potato|wedge|waffle|mash|hash/, '🥔'], [/broccoli|green bean|beans|sprout|cabbage|spinach|kale|veg|stir fry/, '🥦'],
  [/pea\b|peas|sweetcorn|corn/, '🫛'], [/carrot|parsnip/, '🥕'], [/onion|garlic/, '🧅'], [/tomato/, '🍅'], [/pepper/, '🫑'], [/mushroom/, '🍄'],
  [/rice|risotto|paella/, '🍚'], [/juice|drink|water|cola|beer|wine/, '🧃'],
];
const emojiFor = (name) => { const n = String(name || '').toLowerCase(); for (const [re, e] of EMOJI) if (re.test(n)) return e; return '🍽️'; };

/* ---------------- dates ---------------- */
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate();
const parseDate = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
const daysSince = (s) => { const d = parseDate(s); if (!d) return 0; return Math.round((parseDate(today()) - d) / 864e5); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (s) => { const d = parseDate(s); if (!d) return ''; const y = d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''; return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`; };
const fmtAge = (days) => days <= 0 ? 'today' : days === 1 ? '1 day' : days < 14 ? `${days} days` : days < 70 ? `${Math.floor(days / 7)} wk` : `${Math.floor(days / 30.4)} mo`;
const euro = (n, dp = 2) => '€' + Number(n || 0).toLocaleString('en-IE', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/* ---------------- quantities ---------------- */
const num = (q) => { const n = Number(q); return Number.isInteger(n) ? String(n) : String(+n.toFixed(2)); };
function unitText(q, u) {
  if (!u) return '';
  if (Number(q) === 1 || WEIGHT_UNITS.includes(u)) return u;
  if (u === 'box' || u === 'bunch') return u + 'es';
  if (u === 'loaf') return 'loaves';
  return u + 's';
}
const qtyText = (q, u) => (num(q) + (u ? ' ' + unitText(q, u) : ''));
const countOf = (it) => (WEIGHT_UNITS.includes(it.unit) ? 1 : Number(it.qty) || 0);
const titleCase = (s) => { s = String(s || '').trim(); return s ? s[0].toUpperCase() + s.slice(1) : s; };

/* ---------------- rotation & flags ---------------- */
const rotDate = (it) => it.frozen_on || it.bought_on || String(it.added_at || '').slice(0, 10) || today();
function flagOf(it) {
  const t = S.settings;
  const age = daysSince(rotDate(it));
  if (it.location === 'utilities') return null;
  if (it.location === 'pantry' || it.location === 'prepper') {
    if (!it.use_by) return null;
    const left = -daysSince(it.use_by);
    if (left < 0) return { level: 'now', text: 'Past best-before' };
    if (left <= 7) return { level: 'soon', text: 'Use this week' };
    return null;
  }
  if (it.location === 'fridge') {
    if (it.use_by) {
      const left = -daysSince(it.use_by);
      if (left < 0) return { level: 'now', text: 'Past use-by' };
      if (left === 0) return { level: 'now', text: 'Use today' };
      if (left === 1) return { level: 'soon', text: 'Use tomorrow' };
      return null;
    }
    if (age >= t.fridgeDays + 2) return { level: 'now', text: 'Use now' };
    if (age >= t.fridgeDays) return { level: 'soon', text: 'Use soon' };
    return null;
  }
  const rot = t.targetWeeks * 7;
  const hard = it.frozen_on ? 90 : 180;
  if (age >= Math.max(hard, rot + 7)) return { level: 'now', text: 'Eat now' };
  if (age >= rot) return { level: 'soon', text: 'Eat soon' };
  return null;
}

/* ---------------- voice / typed command parsing (mirrors tb_parse in SQL) ---------------- */
const NUMWORDS = { a: 1, an: 1, one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, half: 0.5, couple: 2, dozen: 12, all: -1, every: -1 };
const UNITS = { portion: 'portion', portions: 'portion', bag: 'bag', bags: 'bag', pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack', tub: 'tub', tubs: 'tub', box: 'box', boxes: 'box', tin: 'tin', tins: 'tin', can: 'tin', cans: 'tin', bottle: 'bottle', bottles: 'bottle', tray: 'tray', trays: 'tray', piece: 'piece', pieces: 'piece', slice: 'slice', slices: 'slice', loaf: 'loaf', loaves: 'loaf', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', kg: 'kg', kilo: 'kg', kilos: 'kg', g: 'g', grams: 'g', gram: 'g', litre: 'litre', litres: 'litre', liter: 'litre', liters: 'litre', container: 'container', containers: 'container', carton: 'carton', cartons: 'carton', jar: 'jar', jars: 'jar', punnet: 'punnet', punnets: 'punnet', bunch: 'bunch', bunches: 'bunch', bowl: 'bowl', bowls: 'bowl', meal: 'portion', meals: 'portion', serving: 'portion', servings: 'portion', roll: 'roll', rolls: 'roll', block: 'block', blocks: 'block', pot: 'pot', pots: 'pot', bar: 'bar', bars: 'bar', sachet: 'sachet', sachets: 'sachet' };
const BEKO = 'beko|becko|beco|becco|bekko|beeko|beko\'s|bekos|becko\'s|bico|deco|chest|beaker|beakers|becker|beckers|bekah|becca|beca|bekka|bacco|bekoe|bebo|vecko|veko';
function parseCommand(cmd) {
  let t = ' ' + String(cmd || '').toLowerCase() + ' ';
  let action = 'add', loc = null, freeze = false, qty = null, unit = null;
  t = t.replace(/[’`]/g, "'").replace(/\.(?![0-9])/g, ' ').replace(/[^a-z0-9.' -]/g, ' ').replace(/\s+/g, ' ');
  const isQ = /\?/.test(String(cmd || ''));
  t = t.replace(/\b(big|chest) freezer\b/g, ' beko ');
  t = t.replace(/\b(hey|hi|ok|okay|o k) (siri|seri|sirie|siri's|cyril)\b/g, ' ').replace(/\b(siri|seri|sirie)\b/g, ' ').replace(/\s+/g, ' ');
  for (let t0 = ''; t0 !== t;) { t0 = t; t = t.replace(/^ (hey|hi|ok|okay|um|umm|uh|er|erm|so|right|and|please|can you|could you|would you|will you|go ahead and|i want to|i'd like to|i would like to|we need to|i need to|need to)\b/, ' ').replace(/\s+/g, ' '); }
  if (isQ || /^ (what|whats|what's|which|list|how much|how many|show|tell me|do we have|do i have|do we|have we|have i|is there|are there|is any|are any|any|anything|check|where|did|does|do|was|were|are we|are you|is it|is that|is the|when|should|can i|can we|could i|could we)\b/.test(t)) return { action: 'list', loc: /\b(eat soon|eating soon|needs? eating|use up|oldest|old|expir|rotate)/.test(t) ? 'soon' : /\b(utilities|utility)\b/.test(t) ? 'utilities' : /\b(prepper|preppers|prepping|stockpile|emergency)\b/.test(t) ? 'prepper' : /\b(pantry|cupboard|press|larder)\b/.test(t) ? 'pantry' : (new RegExp(`\\b(${BEKO})\\b`).test(t) ? 'beko' : /\bfreezer\b/.test(t) ? 'freezer' : /\bfridge\b/.test(t) ? 'fridge' : null) };
  if (/\b(utilities|utility|under the sink)\b/.test(t)) {
    loc = 'utilities';
    t = t.replace(/\b((in|into|to|from|out of|on|at) )?((the|my|our) )?(utilities|utility|under the sink)( (room|press|cupboard|cupboards))?\b/g, ' ');
  } else if (/\b(prepper|preppers|prepping|prepper's|stockpile|emergency (supplies|store|box|kit|stash))\b/.test(t)) {
    loc = 'prepper';
    t = t.replace(/\b((in|into|to|from|out of|on|at) )?((the|my|our) )?(prepper|preppers|prepping|prepper's|stockpile|emergency (supplies|store|box|kit|stash))( (box|store|stash|supplies|cupboard|shelf))?\b/g, ' ');
  } else if (/\b(pantry|cupboard|cupboards|press|larder)\b/.test(t)) {
    loc = 'pantry';
    t = t.replace(/\b((in|into|to|from|out of|on|at) )?((the|my|our) )?(food )?(pantry|cupboard|cupboards|press|larder)\b/g, ' ');
  } else if (new RegExp(`\\b(${BEKO})\\b`).test(t)) {
    loc = 'beko';
    t = t.replace(new RegExp(`\\b((in|into|to|from|out of|on|at) )?((the|my|our) )?(${BEKO})( (chest|freezer|chest freezer))*\\b`, 'g'), ' ');
  } else if (/\b(fridge freezer|freezer)\b/.test(t)) {
    loc = 'freezer';
    t = t.replace(/\b((in|into|to|from|out of|on|at) )?((the|my|our) )?((american|big) )?(fridge )?freezer( (drawer|drawers|side))?\b/g, ' ');
  } else if (/\b(fridge|refrigerator)\b/.test(t)) {
    loc = 'fridge';
    t = t.replace(/\b((in|into|to|from|out of|on|at) )?((the|my|our) )?(american )?(fridge|refrigerator)( side)?\b/g, ' ');
  }
  // "frozen peas" = bought frozen; "freeze", "froze", "frozen today", "I've frozen" = frozen at home today
  if (/\b(freeze|freezing|froze)\b/.test(t) || /\bfrozen (it|them|today|now)\b/.test(t) || /\b(i|we)( have| ve|'ve| just)* frozen\b/.test(t) || /^ ((we|i) )?((just|have|'ve) )*frozen\b/.test(t)) {
    freeze = true;
    t = t.replace(/\b(i'm |i am |we're |we are |to )?(freeze|freezing|frozen|froze)( it| them| today| now)*\b/g, ' ');
  } else t = t.replace(/\bfrozen\b/g, ' ');
  if (/\b(ate|eat|eaten|remove|removed|delete|deleted|used|use up|took|take|taken|finished|finish|minus|defrost|defrosted|defrosting|thaw|thawed|thawing|gone)\b/.test(t)) {
    action = 'remove';
    t = t.replace(/\b(we |i )?((have|had|just) )*(ate|eaten|eat|removed|remove|delete|deleted|used up|use up|used|took out|take out|taken out|took|take|taken|finished|finish|minus|defrosted|defrosting|defrost|thawed|thawing|thaw|gone)( up| out| off)?\b/g, ' ');
  }
  t = t.replace(/^ (please )?(add|added|put|plus|bought|got|log|store|stored|new)( in| away)?\b/, ' ');
  t = t.replace(/\b(please|thanks|thank you)\b/g, ' ').replace(/\s+/g, ' ');
  const w = t.trim().split(' ').filter(Boolean);
  let i = 0;
  while (i < w.length && ['we', 'i', 'have', 'had', 'just', 'the', 'some', 'of', 'my', 'our', 'x', "i've", "we've", 'ive', 'weve'].includes(w[i])) i++;
  if (i < w.length) {
    const x = w[i];
    if (/^\d+(\.\d+)?$/.test(x)) { qty = Number(x); i++; }
    else if (/^\d+x$/.test(x)) { qty = Number(x.slice(0, -1)); i++; }
    else if (x in NUMWORDS && !(['to', 'too', 'for', 'won'].includes(x) && i === w.length - 1)) {
      qty = NUMWORDS[x]; i++;
      if ((x === 'all' || x === 'every') && ['the', 'of', 'our', 'my'].includes(w[i])) i++;
      if (qty === 0.5 && ['a', 'an'].includes(w[i])) i++;
      if (x === 'couple' && w[i] === 'of') i++;
      if (w[i] === 'and' && w[i + 1] === 'a' && w[i + 2] === 'half') { qty += 0.5; i += 3; }
    }
  }
  if (i < w.length && w[i] in UNITS) { unit = UNITS[w[i]]; i++; while (['of', 'the', 'x'].includes(w[i])) i++; }
  let name = w.slice(i).join(' ');
  name = name.replace(/^((of|the|some|a|an) )+/, '').replace(/( (in|into|to|from|out|of|the|please|and|today|now|it|them))+$/, '').trim();
  if (action === 'add' && qty === -1) qty = 1;
  return { action, qty: qty ?? 1, unit, name, loc, freeze };
}

/* ---------------- storage backends ---------------- */
class LocalStore {
  constructor() { this.kind = 'local'; this.d = LS.get('tb.data', null) || { items: [], usage: [], shops: [], products: {}, settings: {} }; }
  save() { LS.set('tb.data', this.d); }
  async load() { return JSON.parse(JSON.stringify(this.d)); }
  async insert(table, row) { if (table === 'products') { this.d.products[row.barcode] = row; } else this.d[table].push(row); this.save(); return row; }
  async insertMany(table, rows) { for (const r of rows) this.d[table].push(r); this.save(); }
  async update(table, id, patch) { const r = this.d[table].find((x) => x.id === id); if (r) Object.assign(r, patch); this.save(); }
  async remove(table, id) { this.d[table] = this.d[table].filter((x) => x.id !== id); this.save(); }
  async saveSettings(data) { this.d.settings = data; this.save(); }
  async voice(cmd) { return runLocalCommand(parseCommand(cmd)); }
  ping() {}
}

class RemoteStore {
  constructor(url, key, code) {
    this.kind = 'remote';
    this.url = url.replace(/\/+$/, '');
    this.base = this.url + '/rest/v1';
    this.key = key; this.code = code;
    this.h = { apikey: key, 'x-household': code, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(key)) this.h.Authorization = 'Bearer ' + key;
    this.channel = null;
  }
  async req(method, path, body, prefer) {
    const headers = { ...this.h };
    if (prefer) headers.Prefer = prefer;
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(this.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl.signal });
      const txt = await r.text();
      if (!r.ok) { let m = txt; try { m = JSON.parse(txt).message || txt; } catch {} throw new Error(m || ('HTTP ' + r.status)); }
      setSync('ok');
      return txt ? JSON.parse(txt) : null;
    } catch (e) {
      if (e.name === 'AbortError' || e instanceof TypeError) setSync('off');
      throw e;
    } finally { clearTimeout(tm); }
  }
  async load() {
    const since = new Date(Date.now() - 140 * 864e5).toISOString();
    const [items, usage, shops, products, settings] = await Promise.all([
      this.req('GET', '/items?select=*&gone_at=is.null&order=bought_on.asc'),
      this.req('GET', `/usage?select=*&used_at=gte.${encodeURIComponent(since)}`),
      this.req('GET', '/shops?select=*&order=shop_date.desc,created_at.desc&limit=1000'),
      this.req('GET', '/products?select=*'),
      this.req('GET', '/settings?select=*'),
    ]);
    const pm = {}; for (const p of products) pm[p.barcode] = p;
    return { items, usage, shops, products: pm, settings: settings[0]?.data || {} };
  }
  async insert(table, row) {
    if (table === 'products') {
      await this.req('POST', '/products?on_conflict=household,barcode', { ...row, household: this.code }, 'resolution=merge-duplicates,return=minimal');
      return row;
    }
    const r = await this.req('POST', '/' + table, { ...row, household: this.code }, 'return=representation');
    this.ping(); return r[0];
  }
  async insertMany(table, rows) { await this.req('POST', '/' + table, rows.map((r) => ({ ...r, household: this.code })), 'return=minimal'); this.ping(); }
  async update(table, id, patch) { await this.req('PATCH', `/${table}?id=eq.${id}`, { ...patch, ...(table === 'items' ? { updated_at: new Date().toISOString() } : {}) }, 'return=minimal'); this.ping(); }
  async remove(table, id) { await this.req('DELETE', `/${table}?id=eq.${id}`, undefined, 'return=minimal'); this.ping(); }
  async saveSettings(data) { await this.req('POST', '/settings?on_conflict=household', { household: this.code, data, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal'); this.ping(); }
  async voice(cmd) { return this.req('POST', '/rpc/tb_voice', { cmd, code: this.code }); }
  async topic() {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.code));
    return 'tb-' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }
  async live(onChange) {
    try {
      if (!window.supabase?.createClient || !crypto.subtle) return;
      this.onChange = onChange;
      this.client = this.client || window.supabase.createClient(this.url, this.key, { auth: { persistSession: false, autoRefreshToken: false } });
      if (this.channel) { try { await this.client.removeChannel(this.channel); } catch {} }
      this.channel = this.client.channel(await this.topic(), { config: { broadcast: { self: false } } });
      this.channel.on('broadcast', { event: 'changed' }, () => onChange()).subscribe();
    } catch (e) { console.warn('live sync unavailable', e); }
  }
  // iPhone suspends the home-screen app, which silently drops the live connection: rejoin on resume
  relive() { if (this.onChange) this.live(this.onChange); }
  ping() { try { this.channel?.send({ type: 'broadcast', event: 'changed', payload: { at: Date.now() } }); } catch {} }
}

/* ---------------- app state ---------------- */
const DEFAULT_SETTINGS = { targetWeeks: 8, weeklyEstimate: 14, fridgeDays: 4 };
const S = {
  code: LS.get('tb.code', null),
  store: null,
  items: [], usage: [], shops: [], products: {}, settings: { ...DEFAULT_SETTINGS },
  tab: 'stock', loc: LS.get('tb.loc', 'all'), q: '',
  addMode: LS.get('tb.addMode', 'scan'), scanMode: 'add',
  lastLoc: LS.get('tb.lastLoc', 'beko'), lastStore: LS.get('tb.lastStore', 'Tesco'),
  loaded: false,
};
const remoteConfigured = () => !!(CFG.supabaseUrl && CFG.supabaseKey);

function setSync(state) {
  const el = $('#sync'); if (!el) return;
  el.className = 'sync ' + state;
  $('.label', el).textContent = { ok: 'Synced', off: 'Offline', local: 'This phone', busy: 'Syncing' }[state] || '';
}

async function reload(quiet) {
  if (!S.store) return;
  try {
    if (!quiet) setSync(S.store.kind === 'local' ? 'local' : 'busy');
    const d = await S.store.load();
    S.items = d.items.filter((i) => !i.gone_at && Number(i.qty) > 0);
    S.usage = d.usage; S.shops = d.shops; S.products = d.products;
    S.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    S.loaded = true;
    LS.set('tb.cache.' + S.code, { items: S.items, usage: S.usage, shops: S.shops, products: S.products, settings: S.settings, at: Date.now() });
    if (S.store.kind === 'local') setSync('local');
    render(); return true;
  } catch (e) {
    console.warn(e);
    const c = LS.get('tb.cache.' + S.code, null);
    if (c && !S.loaded) Object.assign(S, { items: c.items, usage: c.usage, shops: c.shops, products: c.products, settings: { ...DEFAULT_SETTINGS, ...c.settings } });
    setSync('off');
    if (!quiet) toast("Can't reach the shared list. Showing the last copy on this phone.");
  }
  render(); return false;
}

/* ---------------- item actions ---------------- */
async function addItem(data, { silent } = {}) {
  const row = {
    id: uid(), name: titleCase(data.name), qty: Number(data.qty) || 1, unit: data.unit || null,
    location: data.location, spot: data.spot || null, barcode: data.barcode || null, image: data.image || null,
    bought_on: data.bought_on || today(), frozen_on: data.frozen_on || null, use_by: data.use_by || null,
    added_at: new Date().toISOString(), gone_at: null,
  };
  // merge with a batch of the same thing added today (keeps rotation dates clean)
  const same = S.items.find((i) => i.location === row.location && i.name.toLowerCase() === row.name.toLowerCase() && (i.unit || '') === (row.unit || '')
    && (i.barcode || '') === (row.barcode || '') && i.bought_on === row.bought_on && (i.frozen_on || '') === (row.frozen_on || '') && (i.spot || '') === (row.spot || ''));
  try {
    let undo;
    if (same) {
      const before = Number(same.qty);
      same.qty = before + row.qty;
      await S.store.update('items', same.id, { qty: same.qty });
      undo = async () => { same.qty = before; await S.store.update('items', same.id, { qty: before }); render(); };
    } else {
      const saved = await S.store.insert('items', row);
      S.items.push(saved || row);
      undo = async () => { S.items = S.items.filter((i) => i.id !== row.id); await S.store.update('items', row.id, { qty: 0, gone_at: new Date().toISOString() }); render(); };
    }
    S.lastLoc = row.location; LS.set('tb.lastLoc', row.location);
    learnFood(row.name);
    if (row.barcode) {
      const p = { barcode: row.barcode, name: row.name, image: row.image, unit: row.unit, updated_at: new Date().toISOString() };
      S.products[row.barcode] = { ...p, location: row.location, freeze: !!row.frozen_on };
      S.store.insert('products', p).catch(() => {});
      const pref = LS.get('tb.prodPref', {}); pref[row.barcode] = { location: row.location, freeze: !!row.frozen_on, spot: row.spot }; LS.set('tb.prodPref', pref);
    }
    render();
    if (!silent) toast(`Added ${qtyText(row.qty, row.unit)} ${row.unit ? 'of ' : ''}${row.name} to ${LOCS[row.location].short}${row.frozen_on ? ' ❄️' : ''}`, undo);
    return true;
  } catch (e) { saveFailed(e); return false; }
}

async function consume(item, n = 1, { silent } = {}) {
  const before = Number(item.qty);
  const take = n === 'all' ? before : Math.min(Number(n), before);
  const after = +(before - take).toFixed(3);
  const usageRow = { id: uid(), name: item.name, location: item.location, qty: take, used_at: new Date().toISOString() };
  try {
    if (after <= 0) {
      await S.store.update('items', item.id, { qty: 0, gone_at: new Date().toISOString() });
      S.items = S.items.filter((i) => i.id !== item.id);
    } else {
      await S.store.update('items', item.id, { qty: after });
      item.qty = after;
    }
    const u = await S.store.insert('usage', usageRow);
    S.usage.push(u || usageRow);
    render();
    const undo = async () => {
      await S.store.update('items', item.id, { qty: before, gone_at: null });
      await S.store.remove('usage', (u || usageRow).id).catch(() => {});
      S.usage = S.usage.filter((x) => x.id !== (u || usageRow).id);
      item.qty = before; item.gone_at = null;
      if (!S.items.includes(item)) S.items.push(item);
      render();
    };
    if (!silent) toast(after <= 0 ? `Finished ${item.name}. Last one used.` : `Used ${qtyText(take, item.unit)} ${item.unit ? 'of ' : ''}${item.name}. ${num(after)} left.`, undo);
    return true;
  } catch (e) { saveFailed(e); return false; }
}

function saveFailed(e) {
  console.warn(e);
  toast(navigator.onLine === false ? "You're offline, so that wasn't saved. Try again when connected." : 'Could not save: ' + (e.message || e));
}

// typed or spoken commands inside the app (and in "This phone" mode for Siri test)
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/(.)\1+/g, '$1').replace(/(es|s)\b/g, '').replace(/\s+/g, ' ').trim();
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function findMatches(name, loc) {
  const n = normName(name);
  const pool = S.items.filter((i) => !loc || i.location === loc);
  const score = (i) => {
    const m = normName(i.name);
    if (m === n) return 4;
    if (m.includes(n) || n.includes(m)) return 3;
    if (editDistance(m, n) <= Math.max(1, Math.floor(Math.min(m.length, n.length) / 5))) return 2;
    const a = n.split(' '), b = m.split(' ');
    return 0;
  };
  const scored = pool.map((i) => [score(i), i]).filter(([s]) => s >= 2); // a shared word alone ("chicken") isn't enough
  if (!scored.length) return [];
  const best = Math.max(...scored.map(([s]) => s));
  const top = scored.filter(([s]) => s === best).map(([, i]) => i);
  const key = top.sort((a, b) => rotDate(a).localeCompare(rotDate(b)))[0].name.toLowerCase();
  return pool.filter((i) => i.name.toLowerCase() === key).sort((a, b) => rotDate(a).localeCompare(rotDate(b)) || String(a.added_at).localeCompare(String(b.added_at)));
}

async function runLocalCommand(p) {
  if (p.action === 'list') {
    const list = (p.loc === 'soon' ? S.items.filter(flagOf) : S.items.filter((i) => !p.loc || i.location === p.loc)).sort((a, b) => rotDate(a).localeCompare(rotDate(b)));
    if (!list.length) return p.loc === 'soon' ? 'Nothing needs eating soon.' : 'Nothing there.';
    return list.slice(0, 12).map((i) => `${qtyText(i.qty, i.unit)} ${i.unit ? 'of ' : ''}${i.name}`).join(', ');
  }
  if (!p.name) return "Sorry, I didn't catch the food.";
  if (p.action === 'add') {
    const loc = p.loc || guessLoc(p.name, p.unit) || 'beko';
    await addItem({ name: p.name, qty: p.qty, unit: p.unit, location: loc, frozen_on: p.freeze ? today() : null }, { silent: true });
    return `Added ${qtyText(p.qty, p.unit)} ${p.unit ? 'of ' : ''}${p.name} to the ${LOCS[loc].short}${p.freeze ? ', frozen today' : ''}.`;
  }
  return removeByName(p.name, p.qty, p.loc, true);
}

async function removeByName(name, qty, loc, silent) {
  const batches = findMatches(name, loc);
  if (!batches.length) return `Couldn't find ${name}${loc ? ' in the ' + LOCS[loc].short : ''}.`;
  let left = qty < 0 ? Infinity : qty, took = 0;
  const first = batches[0];
  for (const b of batches) {
    if (left <= 0) break;
    const n = Math.min(left, Number(b.qty));
    await consume(b, n, { silent: true });
    left -= n; took += n;
  }
  const remain = S.items.filter((i) => i.name.toLowerCase() === first.name.toLowerCase() && i.location === first.location).reduce((s, i) => s + Number(i.qty), 0);
  const msg = `Used ${qtyText(took, first.unit)} ${first.unit ? 'of ' : ''}${first.name} from the ${LOCS[first.location].short}. ${remain ? num(remain) + ' left.' : 'That was the last of it.'}`;
  if (!silent) toast(msg);
  return msg;
}

/* ---------------- supply / plan maths ---------------- */
function supplyStats() {
  const target = S.settings.targetWeeks;
  const frozen = S.items.filter((i) => isFrozenLoc(i.location));
  const stock = frozen.reduce((s, i) => s + countOf(i), 0);
  const now = Date.now();
  const fu = S.usage.filter((u) => isFrozenLoc(u.location));
  const first = fu.reduce((m, u) => Math.min(m, new Date(u.used_at).getTime()), now);
  const spanDays = Math.min(28, (now - first) / 864e5);
  const recent = fu.filter((u) => now - new Date(u.used_at).getTime() <= 28 * 864e5);
  const used = recent.reduce((s, u) => s + (WEIGHT_UNITS.includes(u.unit) ? 1 : Number(u.qty) || 0), 0);
  let rate, measured = false;
  if (spanDays >= 7 && used >= 3) { rate = used / (spanDays / 7); measured = true; } else rate = S.settings.weeklyEstimate;
  rate = Math.max(rate, 0.5);
  const weeks = stock / rate;
  return { target, stock, rate, measured, weeks, need: Math.max(0, Math.ceil(target * rate - stock)), spanDays };
}

function lowStock() {
  const target = S.settings.targetWeeks, now = Date.now(), win = 56;
  const tracked = (l) => l !== 'fridge';
  const fu = S.usage.filter((u) => tracked(u.location) && now - new Date(u.used_at).getTime() <= win * 864e5);
  if (!fu.length) return [];
  const first = fu.reduce((m, u) => Math.min(m, new Date(u.used_at).getTime()), now);
  if (now - first < 7 * 864e5) return []; // wait for a week of eating before suggesting what to buy
  const weeksObserved = Math.max(1, (now - first) / 864e5 / 7);
  const by = {};
  for (const u of fu) { const k = u.name.toLowerCase(); (by[k] ||= { name: u.name, loc: u.location, used: 0 }).used += Number(u.qty) || 0; }
  const out = [];
  for (const k in by) {
    const perWeek = by[k].used / weeksObserved;
    const stock = S.items.filter((i) => tracked(i.location) && i.name.toLowerCase() === k).reduce((s, i) => s + Number(i.qty), 0);
    const need = Math.ceil(perWeek * target - stock);
    if (need > 0) out.push({ name: by[k].name, loc: by[k].loc, perWeek, stock, buy: need });
  }
  return out.sort((a, b) => b.buy - a.buy).slice(0, 12);
}

/* ---------------- rendering ---------------- */
function render() {
  if (!S.code) return;
  renderStock(); renderPlan(); renderSpend(); renderMore();
  if (S.tab === 'add' && !$('#view-add').dataset.built) renderAdd();
}

const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function itemRow(it) {
  const f = flagOf(it);
  const age = daysSince(rotDate(it));
  const bits = [];
  if (S.loc === 'all' || S.q) bits.push(LOCS[it.location].short);
  if (it.spot) bits.push(it.spot);
  if (f) bits.push(`<span class="flag">${f.text}</span>`);
  if (it.location === 'fridge' && it.use_by) bits.push('use by ' + fmtDay(it.use_by));
  else if ((it.location === 'pantry' || it.location === 'prepper') && it.use_by) bits.push('best before ' + fmtDay(it.use_by));
  else if (!isFoodLoc(it.location) || it.location === 'pantry') bits.push('added ' + fmtDay(it.bought_on));
  else bits.push((it.frozen_on ? '❄️ frozen ' : isFrozenLoc(it.location) ? 'in ' : 'bought ') + fmtAge(age) + (age > 0 ? ' ago' : ''));
  const img = it.image ? `<img src="${esc(it.image)}" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${emojiFor(it.name)}'))">` : emojiFor(it.name);
  return `<div class="item ${f ? f.level : ''}" data-id="${it.id}">
    <button class="thumb ${it.location}" data-act="item" data-id="${it.id}" aria-label="Open ${esc(it.name)}">${img}</button>
    <button class="main" data-act="item" data-id="${it.id}"><div class="name">${esc(it.name)}</div><div class="meta">${bits.join(' · ')}</div></button>
    <div class="qty">${num(it.qty)}${it.unit ? `<small>${esc(unitText(it.qty, it.unit))}</small>` : ''}</div>
    <button class="minus" data-act="eat1" data-id="${it.id}" aria-label="Ate one ${esc(it.name)}">−</button>
  </div>`;
}

function renderStock() {
  const v = $('#view-stock');
  const counts = { all: S.items.length }; for (const l of LOC_ORDER) counts[l] = S.items.filter((i) => i.location === l).length;
  let items = S.items.slice();
  const q = S.q.trim().toLowerCase();
  if (q) items = items.filter((i) => i.name.toLowerCase().includes(q) || (i.spot || '').toLowerCase().includes(q));
  else if (S.loc !== 'all') items = items.filter((i) => i.location === S.loc);
  items.sort((a, b) => rotDate(a).localeCompare(rotDate(b)) || a.name.localeCompare(b.name));
  const soon = S.items.filter((i) => flagOf(i));
  const nowN = soon.filter((i) => flagOf(i).level === 'now').length;

  let html = '';
  if (!isStandalone() && isIOS()) html += `<div class="install"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg><div>Install it: tap <b>Share</b> then <b>Add to Home Screen</b>.</div></div>`;
  html += `<div class="seg seg-scroll" role="tablist">${['all', ...LOC_ORDER].map((l) => `<button data-act="loc" data-loc="${l}" class="${S.loc === l && !q ? 'on' : ''}">${l === 'all' ? 'All' : LOCS[l].short}<span class="n">${counts[l]}</span></button>`).join('')}</div>`;
  html += `<div class="searchbar"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" id="search" placeholder="Search food" value="${esc(S.q)}" autocomplete="off"></div>`;
  if (S.store?.kind === 'remote' && S.loaded && !S.items.length && !S.usage.length && !S.shops.length) html += `<div class="card join-card"><b>Is this the right list?</b><p class="small muted" style="margin:4px 0 10px">This phone's list is empty. If your other phone or Siri already has food in it, paste that code here (on the other phone: More › Our household › Copy code).</p><div style="display:flex;gap:8px"><input type="text" id="join-code" placeholder="TB-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" style="flex:1;min-width:0"><button class="btn" data-act="join-here">Join</button></div></div>`;
  if (soon.length && !q) html += `<button class="alert ${nowN ? 'now' : 'soon'}" data-act="goto-plan" style="width:100%;text-align:left"><span style="font-size:22px">⏳</span><span class="grow"><b>${soon.length} to eat soon</b> · oldest first in each list below</span><span class="muted">›</span></button>`;

  if (!S.items.length) {
    html += `<div class="card empty"><div class="big">🧊</div><p><b>Nothing logged yet.</b><br>Tap the scan button to add food, or load your current freezer list from More.</p><button class="btn" data-act="tab" data-tab="add">Scan or add food</button></div>`;
  } else if (!items.length) {
    html += `<div class="card empty"><p>No matches.</p></div>`;
  } else if (S.loc === 'all' && !q) {
    for (const l of LOC_ORDER) {
      const li = items.filter((i) => i.location === l);
      if (!li.length) continue;
      const units = li.reduce((s, i) => s + countOf(i), 0);
      html += `<div class="group-h"><h3><span class="swatch" style="background:var(--${l})"></span>${LOCS[l].long}</h3><span class="small muted">${units} item${units === 1 ? '' : 's'} · oldest first</span></div><div class="list">${li.map(itemRow).join('')}</div>`;
    }
  } else if (LOCS[S.loc].spots.length) {
    // group by shelf/drawer for the American fridge freezer
    const spots = [...LOCS[S.loc].spots, null];
    let any = false;
    for (const sp of spots) {
      const li = items.filter((i) => (i.spot || null) === sp || (sp === null && i.spot && !LOCS[S.loc].spots.includes(i.spot)));
      if (!li.length) continue; any = true;
      html += `<div class="group-h"><h3>${sp || (items.some((i) => i.spot) ? 'Anywhere' : LOCS[S.loc].long)}</h3><span class="small muted">oldest first</span></div><div class="list">${li.map(itemRow).join('')}</div>`;
    }
    if (!any) html += `<div class="list">${items.map(itemRow).join('')}</div>`;
  } else {
    html += `<div class="group-h"><h3>${q ? 'Results' : LOCS[S.loc].long}</h3><span class="small muted">oldest first</span></div><div class="list">${items.map(itemRow).join('')}</div>`;
  }
  const hadFocus = document.activeElement?.id === 'search';
  const pos = hadFocus ? document.activeElement.selectionStart : 0;
  const segX = v.querySelector('.seg-scroll')?.scrollLeft || 0;
  v.innerHTML = html;
  const seg = v.querySelector('.seg-scroll'), on = seg?.querySelector('.on');
  if (seg) { seg.scrollLeft = segX; if (on && (on.offsetLeft < seg.scrollLeft || on.offsetLeft + on.offsetWidth > seg.scrollLeft + seg.clientWidth)) seg.scrollLeft = on.offsetLeft - 8; }
  if (hadFocus) { const s = $('#search'); s.focus(); try { s.setSelectionRange(pos, pos); } catch {} }
}

function renderPlan() {
  const v = $('#view-plan');
  const st = supplyStats();
  const pct = Math.min(100, (st.weeks / st.target) * 100);
  const cls = st.weeks < st.target * 0.5 ? 'crit' : st.weeks < st.target ? 'low' : '';
  const rotate = S.items.filter((i) => isFrozenLoc(i.location)).sort((a, b) => rotDate(a).localeCompare(rotDate(b))).slice(0, 8);
  const fridgeSoon = S.items.filter((i) => i.location === 'fridge' && flagOf(i));
  const low = lowStock();
  let html = `<h2>Plan</h2>
  <div class="card">
    <div class="row"><div class="grow"><div class="muted small" style="font-weight:600">FREEZER SUPPLY · BOTH FREEZERS</div>
      <div class="gauge-num">${st.weeks >= 20 ? '20+' : st.weeks.toFixed(1)} <small>of ${st.target} weeks</small></div></div>
      <div style="font-size:38px">${st.weeks >= st.target ? '✅' : st.weeks >= st.target * .5 ? '🟠' : '🔴'}</div></div>
    <div class="bar ${cls}"><i style="width:${pct}%"></i></div>
    <div class="bar-scale"><span>0</span><span>${st.target / 2} wk</span><span>${st.target} wk target</span></div>
    <p class="small" style="margin:12px 0 0">${st.weeks >= st.target ? `You're at your ${st.target}-week target. Keep rotating: eat the oldest first.` : `To reach ${st.target} weeks you need about <b>${st.need} more item${st.need === 1 ? '' : 's'}</b> in the freezers.`}
    <span class="muted">Based on ${st.measured ? `what you actually ate over the last ${Math.round(st.spanDays)} days (<b>${st.rate.toFixed(1)}</b> a week)` : `an estimate of <b>${num(st.rate)}</b> items a week until a week of eating is logged`}. <button class="link" data-act="plan-settings">Change</button></span></p>
  </div>
  <div class="kv"><div class="card"><b>${st.stock}</b><span>items frozen</span></div><div class="card"><b>${S.items.filter((i) => isFrozenLoc(i.location) && flagOf(i)).length}</b><span>past ${st.target}-week rotation</span></div></div>`;

  html += `<h3>Eat next (first in, first out)</h3>`;
  html += rotate.length ? `<div class="list">${rotate.map(itemRow).join('')}</div>` : `<div class="card empty small">No frozen food logged yet.</div>`;
  if (fridgeSoon.length) html += `<h3>Fridge: use soon</h3><div class="list">${fridgeSoon.map(itemRow).join('')}</div>`;
  html += `<h3>Running low for ${st.target} weeks</h3>`;
  if (low.length) {
    html += `<div class="list">${low.map((l) => `<div class="plain-row"><span class="thumb" style="width:36px;height:36px;font-size:20px">${emojiFor(l.name)}</span><div class="grow"><b>${esc(l.name)}</b><div class="small muted">You ${isFoodLoc(l.loc) ? 'eat' : 'use'} about ${l.perWeek < 1 ? 'one every ' + Math.round(7 / l.perWeek) + ' days' : num(+l.perWeek.toFixed(1)) + ' a week'} · ${num(l.stock)} in stock</div></div><span class="buy">Buy ${l.buy}</span></div>`).join('')}</div>
    <button class="btn ghost block" data-act="share-list" style="margin-top:10px">Share shopping list</button>`;
  } else html += `<div class="card small muted">After a week of logging what you eat, this shows what to buy to keep ${st.target} weeks of each food you actually eat.</div>`;
  v.innerHTML = html;
}

function renderAdd() {
  const v = $('#view-add');
  v.dataset.built = '1';
  v.innerHTML = `<div class="seg"><button data-act="addmode" data-mode="scan" class="${S.addMode === 'scan' ? 'on' : ''}">📷 Scan barcode</button><button data-act="addmode" data-mode="type" class="${S.addMode === 'type' ? 'on' : ''}">🎙️ Say or type</button></div>
  <div id="pane-scan" ${S.addMode === 'scan' ? '' : 'hidden'}>
    <div class="mode"><button class="add ${S.scanMode === 'add' ? 'on' : ''}" data-act="scanmode" data-mode="add">＋ Adding</button><button class="eat ${S.scanMode === 'eat' ? 'on' : ''}" data-act="scanmode" data-mode="eat">− Eating / used</button></div>
    <div class="scanbox ${S.scanMode}" id="scanbox" style="margin-top:12px">
      <div id="reader"></div>
      <div class="start" id="scan-start"><svg viewBox="0 0 24 24"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M8 9v6M11 9v6M14 9v6M17 9v6"/></svg><button class="btn" data-act="scan-start">Start camera</button><span class="small">Point at the barcode. It scans by itself.</span></div>
      <div class="frame" hidden></div>
    </div>
    <div class="scan-status" id="scan-status" style="margin-top:10px"></div>
    <div class="row" style="margin-top:8px"><button class="btn ghost grow" data-act="scan-manual">⌨️ Type barcode</button><label class="btn ghost grow" style="margin:0">🖼️ From photo<input type="file" accept="image/*" capture="environment" id="scan-photo" hidden></label></div>
  </div>
  <div id="pane-type" ${S.addMode === 'type' ? '' : 'hidden'}>
    <div class="card">
      <textarea class="say" id="say" placeholder="e.g. 4 portions of chilli to the Beko" autocomplete="off" autocapitalize="sentences" enterkeyhint="done"></textarea>
      <div class="hint" style="margin-top:6px">Tap the 🎙️ on your keyboard and just say it. Examples: <span class="say-ex">freeze 6 chicken fillets in the Beko</span> <span class="say-ex">ate 2 chilli</span> <span class="say-ex">milk to the fridge</span></div>
    </div>
    <div id="say-preview"></div>
    <h3>Quick add again</h3>
    <div class="chips" id="recent"></div>
  </div>`;
  renderRecent();
  updateSayPreview();
}

function renderRecent() {
  const el = $('#recent'); if (!el) return;
  const seen = new Map();
  const all = [...S.items, ...S.usage.map((u) => ({ name: u.name, location: u.location, added_at: u.used_at }))].sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)));
  for (const i of all) { const k = i.name.toLowerCase(); if (!seen.has(k)) seen.set(k, i); if (seen.size >= 14) break; }
  el.innerHTML = seen.size ? [...seen.values()].map((i) => `<button class="chip" data-act="recent" data-name="${esc(i.name)}" data-loc="${i.location}">${emojiFor(i.name)} ${esc(i.name)}</button>`).join('') : '<span class="small muted">Things you add will appear here for one-tap adding.</span>';
}

let sayState = null;
function updateSayPreview() {
  const el = $('#say-preview'); if (!el) return;
  const txt = ($('#say')?.value || '').trim();
  if (!txt) { el.innerHTML = ''; sayState = null; return; }
  const p = parseCommand(txt);
  if (p.action === 'list') { el.innerHTML = `<div class="preview ok"><div class="small muted">Question</div><div class="line">Tap below to see the answer</div><button class="btn block" style="margin-top:12px" data-act="say-go">Ask</button></div>`; sayState = { p, text: txt }; return; }
  const prev = sayState?.text === txt ? sayState : null;
  const loc = prev?.loc ?? p.loc ?? (p.action === 'add' ? (guessLoc(p.name || '', p.unit) || S.lastLoc) : null);
  const freeze = prev?.freezeTouched ? prev.freeze : (p.freeze || false);
  sayState = { text: txt, p, loc, freeze, freezeTouched: prev?.freezeTouched };
  if (p.action === 'remove') {
    const m = p.name ? findMatches(p.name, p.loc) : [];
    el.innerHTML = `<div class="preview eat"><div class="small muted">Eating / used</div>
      <div class="line">${p.qty < 0 ? 'All' : num(p.qty)} ${esc(p.unit ? unitText(p.qty, p.unit) + ' of ' : '')}${esc(p.name || '…')}</div>
      <div class="small" style="margin-top:4px">${m.length ? `<b>${esc(m[0].name)}</b> from ${LOCS[m[0].location].long}, oldest first (${num(m.reduce((s, i) => s + Number(i.qty), 0))} in stock)` : p.name ? `<span style="color:var(--now)">Not found in stock</span>` : ''}</div>
      <button class="btn eat block" style="margin-top:12px" data-act="say-go" ${m.length ? '' : 'disabled'}>Remove</button></div>`;
  } else {
    el.innerHTML = `<div class="preview ok"><div class="small muted">Adding</div>
      <div class="line">${num(p.qty)} ${esc(p.unit ? unitText(p.qty, p.unit) + ' of ' : '')}${esc(titleCase(p.name) || '…')}</div>
      <label class="field">Where</label>${locChips(loc, 'say-loc')}
      ${isFrozenLoc(loc) ? `<div style="margin-top:10px">${freezeToggle(freeze, 'say-freeze')}</div>` : ''}
      <button class="btn block" style="margin-top:12px" data-act="say-go" ${p.name && loc ? '' : 'disabled'}>Add to ${loc ? LOCS[loc].short : '…'}</button></div>`;
  }
}

const locChips = (cur, act) => `<div class="chips big">${LOC_ORDER.map((l) => `<button class="chip loc-${l} ${cur === l ? 'on' : ''}" data-act="${act}" data-loc="${l}">${LOCS[l].short}</button>`).join('')}</div>`;
const freezeToggle = (on, act) => `<button class="toggle ${on ? 'on' : ''}" data-act="${act}"><span style="font-size:24px">❄️</span><span class="grow"><b>Freezing it today</b><span class="small muted">${on ? 'Rotation counts from today (home frozen)' : 'Bought frozen. Rotation counts from purchase date'}</span></span><span class="sw"></span></button>`;

/* ---------------- spend ---------------- */
const SPEND = { store: null, date: null };
function renderSpend() {
  const v = $('#view-spend');
  const now = new Date();
  const ym = (d) => String(d).slice(0, 7);
  const curYM = isoDate(now).slice(0, 7);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1); const prevYM = isoDate(prev).slice(0, 7);
  const sum = (arr) => arr.reduce((s, x) => s + Number(x.amount), 0);
  const thisMonth = S.shops.filter((s) => ym(s.shop_date) === curYM);
  const lastMonth = S.shops.filter((s) => ym(s.shop_date) === prevYM);
  const wkStart = addDays(today(), -((now.getDay() + 6) % 7));
  const thisWeek = S.shops.filter((s) => s.shop_date >= wkStart);
  const recent90 = S.shops.filter((s) => daysSince(s.shop_date) <= 90);
  const months = []; for (let k = 5; k >= 0; k--) { const d = new Date(now.getFullYear(), now.getMonth() - k, 1); months.push(isoDate(d).slice(0, 7)); }
  const mTotals = months.map((m) => sum(S.shops.filter((s) => ym(s.shop_date) === m)));
  const maxM = Math.max(...mTotals, 1);
  const byStore = {}; for (const s of thisMonth) byStore[s.store] = (byStore[s.store] || 0) + Number(s.amount);
  const storeRows = Object.entries(byStore).sort((a, b) => b[1] - a[1]);
  const maxS = Math.max(...storeRows.map((r) => r[1]), 1);
  const stores = [...new Set([...STORES, ...S.shops.map((s) => s.store)])];
  SPEND.store ||= S.lastStore; SPEND.date ||= today();

  let html = `<h2>Spend</h2>
  <div class="card">
    <div class="money"><span>€</span><input id="amt" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off" aria-label="Amount in euro"></div>
    <label class="field">Shop</label>
    <div class="chips" id="store-chips">${stores.map((s) => `<button class="chip ${SPEND.store === s ? 'on' : ''}" data-act="store" data-store="${esc(s)}">${esc(s)}</button>`).join('')}<button class="chip" data-act="store-other">＋ Other</button></div>
    <div class="row" style="margin-top:12px"><div class="grow"><label class="field" style="margin-top:0">Date</label><input type="date" id="shop-date" value="${SPEND.date}" max="${today()}"></div></div>
    <button class="btn block" data-act="shop-save" style="margin-top:14px">Save shop</button>
  </div>
  <div class="kv">
    <div class="card"><b>${euro(sum(thisMonth), 0)}</b><span>${MONTHS[now.getMonth()]} so far · ${thisMonth.length} shop${thisMonth.length === 1 ? '' : 's'}</span></div>
    <div class="card"><b>${euro(sum(lastMonth), 0)}</b><span>${MONTHS[prev.getMonth()]} total</span></div>
    <div class="card"><b>${euro(sum(thisWeek), 0)}</b><span>this week</span></div>
    <div class="card"><b>${recent90.length ? euro(sum(recent90) / recent90.length, 0) : '–'}</b><span>average shop (90 days)</span></div>
  </div>
  <div class="card"><div class="small muted" style="font-weight:600">LAST 6 MONTHS</div>
    <div class="bars">${months.map((m, k) => `<div class="b ${m === curYM ? 'cur' : ''}"><em>${mTotals[k] ? euro(mTotals[k], 0) : ''}</em><i style="height:${(mTotals[k] / maxM) * 80}%"></i><span>${MONTHS[Number(m.slice(5)) - 1]}</span></div>`).join('')}</div>
  </div>`;
  if (storeRows.length) html += `<div class="card"><div class="small muted" style="font-weight:600;margin-bottom:6px">${MONTHS[now.getMonth()].toUpperCase()} BY SHOP</div>${storeRows.map(([s, a]) => `<div class="hbar"><span>${esc(s)}</span><i style="width:${(a / maxS) * 100}%;background:${STORE_COLORS[s] || 'var(--brand-2)'}"></i><b>${euro(a, 0)}</b></div>`).join('')}</div>`;
  html += `<h3>History</h3>`;
  if (!S.shops.length) html += `<div class="card small muted">Each time you shop, enter the receipt total here. It takes about 5 seconds.</div>`;
  else {
    const groups = {};
    for (const s of S.shops.slice().sort((a, b) => b.shop_date.localeCompare(a.shop_date) || String(b.created_at).localeCompare(String(a.created_at)))) (groups[ym(s.shop_date)] ||= []).push(s);
    for (const [m, list] of Object.entries(groups).slice(0, 12)) {
      html += `<div class="group-h"><h3 style="margin:0">${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}</h3><b>${euro(sum(list))}</b></div><div class="list">${list.map((s) => `<button class="shop" data-act="shop" data-id="${s.id}"><span class="logo" style="background:${STORE_COLORS[s.store] || 'var(--brand-2)'}">${esc(s.store.slice(0, 2))}</span><span class="grow"><b>${esc(s.store)}</b><div class="small muted">${fmtDay(s.shop_date)}${s.note ? ' · ' + esc(s.note) : ''}</div></span><span class="amt">${euro(s.amount)}</span></button>`).join('')}</div>`;
    }
  }
  const amt = $('#amt')?.value || '';
  const focus = document.activeElement?.id === 'amt';
  v.innerHTML = html;
  $('#amt').value = amt; if (focus) $('#amt').focus();
}

// "85,40" and "85.40" are both €85.40; "1,234.50" and "1.234,50" are both €1234.50
function parseMoney(v) {
  let t = String(v || '').replace(/[^0-9.,]/g, '');
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  const dec = Math.max(lc, ld);
  if (dec >= 0 && t.length - dec - 1 <= 2) t = t.slice(0, dec).replace(/[.,]/g, '') + '.' + t.slice(dec + 1);
  else t = t.replace(/[.,]/g, '');
  return t;
}
async function saveShop() {
  const raw = parseMoney($('#amt').value);
  const amount = Math.round(parseFloat(raw) * 100) / 100;
  if (!(amount > 0)) { toast('Enter the receipt total first.'); $('#amt').focus(); return; }
  const row = { id: uid(), shop_date: $('#shop-date').value || today(), store: SPEND.store || 'Other', amount, note: null, created_at: new Date().toISOString() };
  try {
    const saved = await S.store.insert('shops', row);
    S.shops.unshift(saved || row);
    S.lastStore = row.store; LS.set('tb.lastStore', row.store);
    $('#amt').value = ''; $('#amt').blur();
    SPEND.date = today();
    renderSpend();
    toast(`Saved ${euro(amount)} at ${row.store}`, async () => { await S.store.remove('shops', row.id); S.shops = S.shops.filter((s) => s.id !== row.id); renderSpend(); });
  } catch (e) { saveFailed(e); }
}

/* ---------------- more / settings ---------------- */
function joinLink() { return location.origin + location.pathname.replace(/index\.html$/, '') + '?join=' + encodeURIComponent(S.code); }
function voiceLink() { return CFG.supabaseUrl.replace(/\/+$/, '') + '/functions/v1/voice?code=' + encodeURIComponent(S.code) + '&say='; }
function joinMessage() { return `Join our T&B Foods kitchen. Open this link in Safari, then tap Share and Add to Home Screen:\n${joinLink()}`; }
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {}
  try { const a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); a.setSelectionRange(0, t.length); const ok = document.execCommand('copy'); a.remove(); return ok; } catch { return false; }
}
function renderMore() {
  const v = $('#view-more');
  const keep = { open: $$('details', v).map((d) => d.open), out: $('#voice-out')?.textContent || '', test: $('#voice-test')?.value || '' };
  const remote = S.store?.kind === 'remote';
  const rpc = remote ? CFG.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/tb_voice' : '';
  v.innerHTML = `<h2>More</h2>
  <div class="card">
    <b>Our household</b>
    <p class="small muted" style="margin:4px 0 10px">${remote ? 'Both phones use this code to share one live list.' : 'Running on this phone only. Add the shared database to sync both phones (see setup guide).'}</p>
    <div class="code" id="hh-code">${esc(S.code)}</div>
    <label class="field">Link for the other phone</label>
    <div class="copyrow" style="margin-top:0"><code>${esc(joinLink())}</code><button data-act="copy" data-copy="${esc(joinLink())}">Copy link</button></div>
    <a class="btn block" style="margin-top:10px;background:#25d366;text-decoration:none" href="https://wa.me/?text=${encodeURIComponent(joinMessage())}" target="_blank" rel="noopener">Send by WhatsApp</a>
    <div class="row" style="margin-top:8px"><button class="btn ghost grow" data-act="share-join">Other ways to send</button><button class="btn ghost" data-act="copy" data-copy="${esc(S.code)}">Copy code</button></div>
  </div>

  <details class="card" id="siri"><summary>🎙️ Siri setup (add or remove by voice)</summary>
    ${remote ? `<p class="small muted">Do this once on each iPhone. 4 actions, about 2 minutes. First tap <b>Copy</b> below.</p>
    <div class="copyrow"><code>${esc(voiceLink())}</code><button data-act="copy" data-copy="${esc(voiceLink())}">Copy</button></div>
    <ol class="steps small" style="margin-top:12px">
      <li>Open the <b>Shortcuts</b> app → <b>＋</b> (top right).</li>
      <li>Tap <b>Add Action</b> (or the search bar at the bottom), type <b>Dictate</b> and tap <b>Dictate Text</b>.</li>
      <li>Search <b>encode</b> and tap <b>URL Encode</b>. It shows <i>Encode Dictated Text</i>. Leave it as it is.</li>
      <li>Search <b>Get Contents of URL</b> and tap it. Tap the blue <b>URL</b> word inside it, press and hold, and tap <b>Paste</b>. The link ends with <b>say=</b>.</li>
      <li>With the cursor still at the very end of the link, tap <b>URL Encoded Text</b> in the grey bar just above the keyboard. Tap <b>Done</b> on the keyboard.</li>
      <li>Search <b>Speak Text</b> and tap it. It speaks the answer back.</li>
      <li>Tap the name at the top (<i>Dictate Text</i>) → <b>Rename</b> → type <b>Freezer</b> → <b>Done</b>.</li>
    </ol>
    <p class="small muted">Leave everything else as it is. No method, headers or body to change.</p>
    <p class="small"><b>Use it:</b> say <i>"Hey Siri, Freezer"</i>, then when it's listening say:</p>
    <div class="small"><span class="say-ex">Add 4 portions of chilli to the Beko</span> <span class="say-ex">Freeze 6 chicken fillets in the Beko</span> <span class="say-ex">Add 2 bags of peas to the freezer</span> <span class="say-ex">Add milk to the fridge</span> <span class="say-ex">How many chilli do we have?</span> <span class="say-ex">We ate 2 chilli</span> <span class="say-ex">Took out a lasagne</span> <span class="say-ex">Used up all the peas</span> <span class="say-ex">What's in the Beko?</span> <span class="say-ex">What needs eating soon?</span></div>
    <p class="small muted">Say <b>add</b>, <b>put</b>, <b>bought</b> or <b>freeze</b> to add. Siri only adds foods on your list below. "Freeze" marks it as frozen today. "The freezer" on its own means both freezers when asking or taking out. Removing always takes the oldest batch first.</p>` : `<p class="small muted">Siri needs the shared database. Once it's set up, the exact steps appear here with copy buttons.</p>`}
    <label class="field">Try a phrase</label>
    <div class="row"><input type="text" id="voice-test" placeholder="add 2 lasagne to the beko"><button class="btn" data-act="voice-test">Run</button></div>
    <div class="small" id="voice-out" style="margin-top:8px"></div>
  </details>

  ${remote ? `<details class="card" id="foods-card"><summary>📝 Foods Siri knows (${S.foods ? S.foods.length : '…'})</summary>
    <p class="small muted">Siri only adds foods on this list, so a misheard word never ends up in your stock. Anything you add in the app joins the list by itself.</p>
    <div class="row"><input type="text" id="food-new" placeholder="e.g. chicken curry" autocomplete="off"><button class="btn" data-act="food-add">Add</button></div>
    <input type="search" id="food-find" placeholder="Search the list" style="margin-top:8px" value="${esc(S.foodFind || '')}">
    <div class="chips" id="food-list" style="margin-top:10px">${S.foods ? foodChips() : '<span class="small muted">Loading…</span>'}</div>
  </details>` : ''}

  <details class="card"><summary>🔄 Rotation & 8-week supply</summary>
    <label class="field">Target supply in the freezers (weeks)</label>
    <div class="stepper" style="width:max-content"><button data-act="set-step" data-k="targetWeeks" data-d="-1">−</button><input type="number" readonly value="${S.settings.targetWeeks}"><button data-act="set-step" data-k="targetWeeks" data-d="1">＋</button></div>
    <label class="field">Until you've logged a week of eating, assume we use this many frozen items a week</label>
    <div class="stepper" style="width:max-content"><button data-act="set-step" data-k="weeklyEstimate" data-d="-1">−</button><input type="number" readonly value="${S.settings.weeklyEstimate}"><button data-act="set-step" data-k="weeklyEstimate" data-d="1">＋</button></div>
    <label class="field">Flag fridge food after (days, when no use-by date)</label>
    <div class="stepper" style="width:max-content"><button data-act="set-step" data-k="fridgeDays" data-d="-1">−</button><input type="number" readonly value="${S.settings.fridgeDays}"><button data-act="set-step" data-k="fridgeDays" data-d="1">＋</button></div>
    <p class="small muted">Frozen food is flagged <b>Eat soon</b> once it's older than your target (first in, first out), and <b>Eat now</b> at 3 months if frozen at home or 6 months if bought frozen.</p>
  </details>

  <details class="card"><summary>📦 Load our current freezer list</summary>
    <p class="small muted">Adds the ${(window.TB_SEED || []).length} items from your existing freezer inventory in one go.</p>
    <label class="field">Which freezer are they in?</label>${locChips(S.seedLoc || 'beko', 'seed-loc')}
    <label class="field">Roughly when were they bought?</label><input type="date" id="seed-date" value="${S.seedDate || addDays(today(), -14)}" max="${today()}">
    <button class="btn block" style="margin-top:12px" data-act="seed">Add ${(window.TB_SEED || []).length} items</button>
  </details>

  <details class="card"><summary>⬇️ Export</summary>
    <p class="small muted">Download everything as a spreadsheet file (CSV).</p>
    <div class="row"><button class="btn ghost grow" data-act="export" data-what="items">Stock</button><button class="btn ghost grow" data-act="export" data-what="shops">Shops</button></div>
  </details>
  <p class="small muted" style="text-align:center">T&amp;B Foods ${VERSION} · ${S.items.length} items · <button class="link" data-act="refresh">Refresh</button> · <button class="link" data-act="leave">Change household</button></p>`;
  $$('details', v).forEach((d, i) => { if (keep.open[i]) d.open = true; });
  if (keep.out) $('#voice-out').textContent = keep.out;
  if (keep.test) $('#voice-test').value = keep.test;
  if (remote && !S.foods && !S.foodsLoading) loadFoods();
}
const foodChips = () => {
  const q = (S.foodFind || '').toLowerCase().trim();
  const list = (S.foods || []).filter((n) => !q || n.includes(q));
  return list.length ? list.map((n) => `<span class="chip food-chip">${esc(titleCase(n))}<button data-act="food-del" data-name="${esc(n)}" aria-label="Remove ${esc(n)}">×</button></span>`).join('') : '<span class="small muted">Nothing matches.</span>';
};
async function loadFoods() {
  S.foodsLoading = true;
  try {
    await S.store.req('POST', '/rpc/tb_seed_foods', { code: S.code });
    const rows = await S.store.req('GET', '/foods?select=name&order=name.asc&limit=2000');
    S.foods = rows.map((r) => r.name);
  } catch { S.foods = null; } finally { S.foodsLoading = false; }
  paintFoods();
}
function paintFoods() {
  const l = $('#food-list'), sm = $('#foods-card summary');
  if (l) l.innerHTML = S.foods ? foodChips() : '<span class="small muted">Couldn\'t load the list. Pull down to refresh.</span>';
  if (sm) sm.textContent = `📝 Foods Siri knows (${S.foods ? S.foods.length : '…'})`;
}
async function learnFood(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n || S.store?.kind !== 'remote' || /\b(siri|something|anything|stuff)\b/.test(n)) return;
  if (S.foods && S.foods.includes(n)) return;
  try { await S.store.req('POST', '/foods?on_conflict=household,name', { name: n, household: S.code }, 'resolution=ignore-duplicates,return=minimal'); if (S.foods) { S.foods.push(n); S.foods.sort(); } } catch {}
}

/* ---------------- sheets ---------------- */
function openSheet(html, onMount) {
  $('#sheet').innerHTML = html;
  $('#sheet-wrap').hidden = false;
  document.body.style.overflow = 'hidden';
  onMount && onMount($('#sheet'));
}
function closeSheet() {
  $('#sheet-wrap').hidden = true; $('#sheet').innerHTML = ''; document.body.style.overflow = '';
  const cb = S.onSheetClose; S.onSheetClose = null; cb && cb();
}

// Add / edit item form used by scanning and editing
function itemForm(d, { title, existing } = {}) {
  const loc = d.location;
  const spots = loc ? LOCS[loc].spots : [];
  return `<div class="sheet-h"><div class="thumb ${loc || ''}">${d.image ? `<img src="${esc(d.image)}" alt="">` : emojiFor(d.name)}</div>
      <div class="grow"><div class="small muted">${esc(title || '')}</div><input class="title" id="f-name" type="text" value="${esc(d.name || '')}" placeholder="What is it?" autocomplete="off"></div></div>
    <div class="row" style="margin-top:14px;align-items:flex-end">
      <div><label class="field">${existing ? 'Quantity left' : 'How many'}</label><div class="stepper"><button data-act="f-step" data-d="-1">−</button><input id="f-qty" type="number" inputmode="decimal" value="${num(d.qty || 1)}" min="0" step="any"><button data-act="f-step" data-d="1">＋</button></div></div>
      <div class="grow"><label class="field">Unit</label><select id="f-unit">${['', 'portion', 'bag', 'pack', 'tub', 'pot', 'box', 'tray', 'piece', 'loaf', 'bottle', 'tin', 'jar', 'carton', 'block', 'bar', 'sachet', 'lb', 'kg', 'g', 'litre'].map((u) => `<option value="${u}" ${(d.unit || '') === u ? 'selected' : ''}>${u ? unitText(2, u) : 'items'}</option>`).join('')}</select></div>
    </div>
    <label class="field">Where</label>${locChips(loc, 'f-loc')}
    ${spots.length ? `<label class="field">Shelf / drawer <span class="muted">(optional)</span></label><div class="chips">${spots.map((s) => `<button class="chip ${d.spot === s ? 'on' : ''}" data-act="f-spot" data-spot="${s}">${s}</button>`).join('')}</div>` : ''}
    ${isFrozenLoc(loc) ? `<div style="margin-top:14px">${freezeToggle(!!d.frozen_on, 'f-freeze')}</div>` : ''}
    <div class="row" style="margin-top:4px">
      <div class="grow"><label class="field">Bought</label><input type="date" id="f-bought" value="${d.bought_on || today()}" max="${today()}"></div>
      ${isFrozenLoc(loc) && d.frozen_on ? `<div class="grow"><label class="field">Frozen on</label><input type="date" id="f-frozen" value="${d.frozen_on}" max="${today()}"></div>` : ''}
      ${loc === 'fridge' || loc === 'pantry' || loc === 'prepper' ? `<div class="grow"><label class="field">${loc !== 'fridge' ? 'Best before' : 'Use by'} <span class="muted">(optional)</span></label><input type="date" id="f-useby" value="${d.use_by || ''}"></div>` : ''}
    </div>`;
}
function readForm(d) {
  d.name = $('#f-name').value.trim();
  d.qty = Number(String($('#f-qty').value).replace(',', '.')) || 0;
  d.unit = $('#f-unit').value || null;
  d.bought_on = $('#f-bought')?.value || d.bought_on || today();
  if ($('#f-frozen')) d.frozen_on = $('#f-frozen').value || d.frozen_on;
  if ($('#f-useby')) d.use_by = $('#f-useby').value || null;
  return d;
}
function bindForm(d, rerender) {
  S.form = { d, rerender };
}

function openAddSheet(d, title) {
  const draw = () => openSheet(`${itemForm(d, { title })}
    <div class="actions"><button class="btn ghost" data-act="close-sheet">Cancel</button><button class="btn" data-act="f-add">Add</button></div>`);
  bindForm(d, () => { readForm(d); draw(); });
  draw();
}

function openItemSheet(it) {
  const d = { ...it };
  const draw = () => openSheet(`${itemForm(d, { title: `${LOCS[d.location].long} · added ${fmtDay(it.bought_on)}`, existing: true })}
    <div class="actions">
      <button class="btn eat" data-act="i-eat" data-n="1">${isFoodLoc(d.location) ? 'Ate' : 'Used'} 1</button><button class="btn danger" data-act="i-eat" data-n="all">${isFoodLoc(d.location) ? 'Ate' : 'Used'} all</button>
      <button class="btn full" data-act="i-save">Save changes</button>
    </div>`);
  S.editing = it;
  bindForm(d, () => { readForm(d); draw(); });
  draw();
}

/* ---------------- scanning ---------------- */
let scanner = null, scanBusy = false, lastCode = '', lastAt = 0, audioCtx = null;
const FORMATS = () => { const F = window.Html5QrcodeSupportedFormats; return F ? [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF] : undefined; };
function beep(ok = true) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = ok ? 1250 : 330; g.gain.value = 0.08; o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + (ok ? 0.09 : 0.25));
  } catch {}
  try { navigator.vibrate?.(ok ? 40 : [60, 40, 60]); } catch {}
}
function scanStatus(t) { const el = $('#scan-status'); if (el) el.innerHTML = t; }
async function startScanner() {
  if (!window.Html5Qrcode) { scanStatus('Scanner still loading, try again in a moment.'); return; }
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
  } catch {}
  if (scanner) { try { await scanner.stop(); } catch {} }
  scanner = new Html5Qrcode('reader', { formatsToSupport: FORMATS(), useBarCodeDetectorIfSupported: true, verbose: false });
  $('#scan-start').hidden = true;
  scanStatus('Starting camera…');
  try {
    await scanner.start({ facingMode: 'environment' }, {
      fps: 12,
      qrbox: (w, h) => ({ width: Math.floor(w * 0.8), height: Math.floor(Math.min(h * 0.4, w * 0.45)) }),
      disableFlip: true,
      videoConstraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, advanced: [{ focusMode: 'continuous' }] },
    }, onScan, () => {});
    $('.scanbox .frame').hidden = false;
    scanStatus(S.scanMode === 'add' ? 'Hold the barcode inside the box.' : '<b style="color:var(--now)">Eating mode:</b> scan to take one out (oldest first).');
  } catch (e) {
    console.warn(e);
    $('#scan-start').hidden = false;
    scanStatus('Camera blocked. In Settings › Safari › Camera, choose Allow, or use "From photo".');
  }
}
async function stopScanner() {
  if (!scanner) return;
  try { if (scanner.isScanning) await scanner.stop(); } catch {}
  try { scanner.clear(); } catch {}
  scanner = null;
  const s = $('#scan-start'); if (s) s.hidden = false;
  const f = $('.scanbox .frame'); if (f) f.hidden = true;
  scanStatus('');
}
function pauseScanner() { try { if (scanner?.isScanning) scanner.pause(true); } catch {} }
function resumeScanner() { try { scanner?.resume(); } catch {} }
async function onScan(code) {
  const now = Date.now();
  if (scanBusy || (code === lastCode && now - lastAt < 3000)) return;
  lastCode = code; lastAt = now; scanBusy = true;
  pauseScanner(); beep(true);
  try { await handleCode(code); } finally { scanBusy = false; }
}

async function lookupProduct(code) {
  if (S.products[code]) return { ...S.products[code], source: 'saved' };
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,generic_name,brands,quantity,image_front_small_url,image_small_url`, { signal: ctl.signal });
    clearTimeout(tm);
    const j = await r.json();
    if (j.status === 1 && j.product) {
      const p = j.product;
      let name = (p.product_name_en || p.product_name || p.generic_name || '').trim();
      const brand = (p.brands || '').split(',')[0].trim();
      if (name && brand && !name.toLowerCase().includes(brand.toLowerCase())) name = `${brand} ${name}`;
      if (name && p.quantity && name.length < 40) name += ` (${p.quantity})`;
      return { name, image: p.image_front_small_url || p.image_small_url || null, source: 'off' };
    }
  } catch (e) { console.warn('OFF lookup failed', e); }
  return null;
}

async function handleCode(code) {
  code = String(code).trim();
  if (S.scanMode === 'eat') {
    let batches = S.items.filter((i) => i.barcode === code).sort((a, b) => rotDate(a).localeCompare(rotDate(b)) || String(a.added_at).localeCompare(String(b.added_at)));
    if (!batches.length && S.products[code]) batches = findMatches(S.products[code].name);
    if (!batches.length) { beep(false); scanStatus(`<b style="color:var(--now)">Not in stock.</b> ${S.products[code] ? esc(S.products[code].name) : 'Barcode ' + esc(code)}`); toast("That item isn't in stock."); setTimeout(resumeScanner, 1200); return; }
    const it = batches[0];
    await consume(it, 1);
    scanStatus(`<b>${esc(it.name)}</b>: took 1 from ${LOCS[it.location].short} (oldest first). Scan the next one.`);
    setTimeout(resumeScanner, 1200);
    return;
  }
  scanStatus('Looking up ' + esc(code) + '…');
  const p = await lookupProduct(code);
  const pref = LS.get('tb.prodPref', {})[code] || {};
  const loc = pref.location || S.products[code]?.location || (p?.name && guessLoc(p.name, p.unit)) || S.lastLoc || 'beko';
  const d = { name: p?.name || '', image: p?.image || null, barcode: code, qty: 1, unit: p?.unit || null, location: loc, spot: pref.spot || null, bought_on: today(), frozen_on: pref.freeze ? today() : null };
  scanStatus(p ? '' : 'Not found online. Type its name once and it will be remembered.');
  S.onSheetClose = () => { scanStatus('Ready for the next item.'); setTimeout(resumeScanner, 300); };
  openAddSheet(d, p ? (p.source === 'saved' ? 'Seen before' : 'Found') + ' · ' + code : 'New barcode · ' + code);
  if (!p) setTimeout(() => $('#f-name')?.focus(), 350);
}

/* ---------------- toast ---------------- */
let toastTimer = null;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span class="grow">${esc(msg)}</span>${undo ? '<button data-act="undo">Undo</button>' : ''}`;
  el.hidden = false;
  S.undo = undo || null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; S.undo = null; }, undo ? 6000 : 3500);
}

/* ---------------- export ---------------- */
function download(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------------- navigation ---------------- */
function setTab(tab) {
  if (S.tab === 'add' && tab !== 'add') stopScanner();
  S.tab = tab;
  for (const b of $$('.tabbar button')) b.classList.toggle('on', b.dataset.tab === tab);
  for (const s of $$('.view')) s.hidden = s.id !== 'view-' + tab;
  if (tab === 'add') { renderAdd(); if (S.addMode === 'scan' && LS.get('tb.camOk', false)) startScanner(); }
  window.scrollTo(0, 0);
}

/* ---------------- event handling ---------------- */
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act], .tabbar button');
  if (!b) return;
  if (b.matches('.tabbar button')) return setTab(b.dataset.tab);
  const act = b.dataset.act;
  const id = b.dataset.id;
  const item = id ? S.items.find((i) => i.id === id) : null;
  switch (act) {
    case 'close-sheet': return closeSheet();
    case 'tab': return setTab(b.dataset.tab);
    case 'goto-plan': return setTab('plan');
    case 'loc': S.loc = b.dataset.loc; S.q = ''; LS.set('tb.loc', S.loc); return renderStock();
    case 'item': return item && openItemSheet(item);
    case 'eat1': if (item) { b.disabled = true; await consume(item, 1); } return;
    case 'undo': { const u = S.undo; $('#toast').hidden = true; S.undo = null; if (u) { try { await u(); toast('Undone'); } catch (er) { saveFailed(er); } } return; }

    // add pane
    case 'addmode': S.addMode = b.dataset.mode; LS.set('tb.addMode', S.addMode); if (S.addMode !== 'scan') stopScanner(); renderAdd(); if (S.addMode === 'scan' && LS.get('tb.camOk', false)) startScanner(); if (S.addMode === 'type') $('#say').focus(); return;
    case 'scanmode': S.scanMode = b.dataset.mode; for (const x of $$('.mode button')) x.classList.toggle('on', x.dataset.mode === S.scanMode); $('#scanbox').className = 'scanbox ' + S.scanMode; if (scanner?.isScanning) scanStatus(S.scanMode === 'add' ? 'Hold the barcode inside the box.' : '<b style="color:var(--now)">Eating mode:</b> scan to take one out (oldest first).'); return;
    case 'scan-start': LS.set('tb.camOk', true); return startScanner();
    case 'scan-manual': {
      pauseScanner();
      S.onSheetClose = () => resumeScanner();
      openSheet(`<h3 style="margin-top:4px">Type the barcode</h3><input type="tel" id="manual-code" inputmode="numeric" placeholder="e.g. 5000159484695" autocomplete="off"><div class="actions"><button class="btn ghost" data-act="close-sheet">Cancel</button><button class="btn" data-act="manual-go">${S.scanMode === 'eat' ? 'Use one' : 'Look up'}</button></div>`, () => setTimeout(() => $('#manual-code').focus(), 300));
      return;
    }
    case 'manual-go': { const c = $('#manual-code').value.replace(/\D/g, ''); if (c.length < 6) return toast('Barcodes are usually 8 or 13 digits.'); S.onSheetClose = null; closeSheet(); return handleCode(c); }
    case 'recent': { $('#say').value = '1 ' + b.dataset.name + ' to the ' + LOCS[b.dataset.loc].short; sayState = null; updateSayPreview(); return; }
    case 'say-loc': sayState.loc = b.dataset.loc; return updateSayPreview();
    case 'say-freeze': sayState.freeze = !sayState.freeze; sayState.freezeTouched = true; return updateSayPreview();
    case 'say-go': {
      const st = sayState; if (!st) return;
      const p = st.p;
      if (p.action === 'list') { let ans; try { ans = S.store.kind === 'remote' ? await S.store.voice(st.text || $('#say').value) : await runLocalCommand(p); } catch (er) { ans = await runLocalCommand(p); } openSheet(`<h3 style="margin-top:4px">Answer</h3><div class="card">${esc(ans)}</div><div class="actions"><button class="btn full" data-act="close-sheet">OK</button></div>`); return; }
      let ok;
      if (p.action === 'remove') { await removeByName(p.name, p.qty, p.loc, false); ok = true; }
      else ok = await addItem({ name: p.name, qty: p.qty, unit: p.unit, location: st.loc, frozen_on: isFrozenLoc(st.loc) && st.freeze ? today() : null });
      if (ok) { $('#say').value = ''; sayState = null; updateSayPreview(); renderRecent(); }
      return;
    }

    // item form
    case 'f-step': { const q = $('#f-qty'); q.value = num(Math.max(0, (Number(q.value) || 0) + Number(b.dataset.d))); return; }
    case 'f-loc': { const d = S.form.d; readForm(d); d.location = b.dataset.loc; if (!LOCS[d.location].spots.includes(d.spot)) d.spot = null; if (!isFrozenLoc(d.location)) d.frozen_on = null; S.form.rerender(); return; }
    case 'f-spot': { const d = S.form.d; readForm(d); d.spot = d.spot === b.dataset.spot ? null : b.dataset.spot; S.form.rerender(); return; }
    case 'f-freeze': { const d = S.form.d; readForm(d); d.frozen_on = d.frozen_on ? null : today(); S.form.rerender(); return; }
    case 'f-add': {
      const d = readForm(S.form.d);
      if (!d.name) { toast('Give it a name first.'); $('#f-name').focus(); return; }
      if (!d.location) { toast('Pick where it goes.'); return; }
      if (!(d.qty > 0)) d.qty = 1;
      if (await addItem(d)) closeSheet();
      return;
    }
    case 'i-save': {
      const it = S.editing, d = readForm(S.form.d);
      if (!d.name) return toast('Name is empty.');
      if (d.qty <= 0) { closeSheet(); return consume(it, 'all'); }
      const patch = {}; for (const k of ['name', 'qty', 'unit', 'location', 'spot', 'bought_on', 'frozen_on', 'use_by']) if ((d[k] ?? null) !== (it[k] ?? null)) patch[k] = d[k] ?? null;
      if (patch.name) patch.name = titleCase(patch.name);
      if (!Object.keys(patch).length) return closeSheet();
      try { await S.store.update('items', it.id, patch); Object.assign(it, patch); closeSheet(); render(); toast('Saved'); } catch (er) { saveFailed(er); }
      return;
    }
    case 'i-eat': { const it = S.editing; closeSheet(); return consume(it, b.dataset.n === 'all' ? 'all' : 1); }

    // spend
    case 'store': SPEND.store = b.dataset.store; for (const x of $$('#store-chips .chip')) x.classList.toggle('on', x.dataset.store === SPEND.store); return;
    case 'store-other': openSheet(`<h3 style="margin-top:4px">Shop name</h3><input type="text" id="other-store" placeholder="e.g. Farmers market" autocomplete="off"><div class="actions"><button class="btn ghost" data-act="close-sheet">Cancel</button><button class="btn" data-act="store-other-ok">Use</button></div>`, () => setTimeout(() => $('#other-store').focus(), 300)); return;
    case 'store-other-ok': { const n = titleCase($('#other-store').value); if (n) { SPEND.store = n; S.lastStore = n; if (!STORES.includes(n)) STORES.push(n); } closeSheet(); return renderSpend(); }
    case 'shop-save': SPEND.date = $('#shop-date').value; return saveShop();
    case 'shop': {
      const s = S.shops.find((x) => x.id === id); if (!s) return;
      openSheet(`<h3 style="margin-top:4px">${esc(s.store)} · ${fmtDay(s.shop_date)}</h3><div class="gauge-num" style="margin:6px 0 4px">${euro(s.amount)}</div><div class="actions"><button class="btn ghost" data-act="close-sheet">Close</button><button class="btn danger" data-act="shop-del" data-id="${s.id}">Delete</button></div>`);
      return;
    }
    case 'shop-del': { const s = S.shops.find((x) => x.id === id); closeSheet(); try { await S.store.remove('shops', id); S.shops = S.shops.filter((x) => x.id !== id); renderSpend(); toast('Deleted', async () => { await S.store.insert('shops', s); S.shops.push(s); renderSpend(); }); } catch (er) { saveFailed(er); } return; }

    // plan
    case 'plan-settings': setTab('more'); setTimeout(() => { const d = $$('#view-more details')[1]; d.open = true; d.scrollIntoView({ behavior: 'smooth' }); }, 50); return;
    case 'share-list': {
      const text = 'T&B Foods shopping list\n' + lowStock().map((l) => `• ${l.name} × ${l.buy}`).join('\n');
      if (navigator.share) { try { await navigator.share({ text }); } catch {} } else { await navigator.clipboard?.writeText(text); toast('Copied'); }
      return;
    }

    // more
    case 'copy': toast((await copyText(b.dataset.copy)) ? 'Copied' : 'Press and hold the text to copy it'); return;
    case 'share-join': {
      const url = joinLink();
      if (navigator.share) {
        try { await navigator.share({ title: 'T&B Foods', text: 'Join our T&B Foods kitchen. Open in Safari, then Share › Add to Home Screen.', url }); return; }
        catch (er) { if (er && er.name === 'AbortError') return; }
      }
      toast((await copyText(url)) ? 'Link copied. Paste it into a message.' : 'Press and hold the link above to copy it');
      return;
    }
    case 'food-add': {
      const n = $('#food-new').value.toLowerCase().replace(/\s+/g, ' ').trim(); if (!n) return;
      if (S.foods?.includes(n)) { toast(titleCase(n) + ' is already on the list'); return; }
      try { await S.store.req('POST', '/foods?on_conflict=household,name', { name: n, household: S.code }, 'resolution=ignore-duplicates,return=minimal'); S.foods = [...(S.foods || []), n].sort(); toast('Siri now knows ' + titleCase(n)); $('#food-new').value = ''; paintFoods(); $('#food-new')?.focus(); } catch (er) { saveFailed(er); }
      return;
    }
    case 'food-del': {
      const n = b.dataset.name;
      try { await S.store.req('DELETE', '/foods?name=eq.' + encodeURIComponent(n)); S.foods = (S.foods || []).filter((x) => x !== n); toast('Removed ' + titleCase(n) + ' from the list', async () => { await S.store.req('POST', '/foods?on_conflict=household,name', { name: n, household: S.code }, 'resolution=ignore-duplicates,return=minimal'); S.foods = [...S.foods, n].sort(); paintFoods(); }); paintFoods(); } catch (er) { saveFailed(er); }
      return;
    }
    case 'voice-test': {
      const t = $('#voice-test').value.trim(); if (!t) return;
      $('#voice-out').textContent = '…';
      try { const r = await S.store.voice(t); $('#voice-out').textContent = '🗣️ ' + r; if (S.store.kind === 'remote') reload(true); } catch (er) { $('#voice-out').textContent = 'Error: ' + er.message; }
      return;
    }
    case 'set-step': {
      const k = b.dataset.k; const lim = { targetWeeks: [1, 26], weeklyEstimate: [1, 100], fridgeDays: [1, 14] }[k];
      S.settings[k] = Math.min(lim[1], Math.max(lim[0], S.settings[k] + Number(b.dataset.d)));
      b.parentElement.querySelector('input').value = S.settings[k];
      clearTimeout(S.setTimer); S.setTimer = setTimeout(() => S.store.saveSettings(S.settings).catch(saveFailed), 600);
      renderStock(); renderPlan();
      return;
    }
    case 'seed-loc': S.seedDate = $('#seed-date').value; S.seedLoc = b.dataset.loc; renderMore(); $$('#view-more details')[2].open = true; return;
    case 'seed': {
      const loc = S.seedLoc || 'beko', when = $('#seed-date').value || today();
      const rows = (window.TB_SEED || []).map((s) => ({ id: uid(), name: s.name, qty: s.qty, unit: s.unit, location: loc, spot: null, barcode: null, image: null, bought_on: when, frozen_on: null, use_by: null, added_at: new Date().toISOString(), gone_at: null }));
      try { b.disabled = true; await S.store.insertMany('items', rows); await reload(true); toast(`Added ${rows.length} items to ${LOCS[loc].short}`); setTab('stock'); } catch (er) { b.disabled = false; saveFailed(er); }
      return;
    }
    case 'export': {
      if (b.dataset.what === 'items') download('tb-foods-stock.csv', [['Name', 'Qty', 'Unit', 'Where', 'Shelf/drawer', 'Bought', 'Frozen on', 'Use by', 'Barcode'], ...S.items.map((i) => [i.name, i.qty, i.unit, LOCS[i.location].long, i.spot, i.bought_on, i.frozen_on, i.use_by, i.barcode])]);
      else download('tb-foods-shops.csv', [['Date', 'Shop', 'Amount (EUR)'], ...S.shops.map((s) => [s.shop_date, s.store, s.amount])]);
      return;
    }
    case 'refresh': return reload();
    case 'leave': if (confirm('Leave this household on this phone? Your data stays in the shared list.')) { LS.del('tb.code'); location.href = location.pathname; } return;

    // onboarding
    case 'ob-new': return joinHousehold(newCode());
    case 'join-here': { const c = normCode($('#join-code').value); if (c.length < 10) return toast('That code looks too short.'); if (c === S.code) return toast("That's this phone's own code."); toast('Joined. Loading your list…'); return joinHousehold(c); }
    case 'ob-join': { const c = normCode($('#ob-code').value); if (c.length < 10) return toast('That code looks too short.'); return joinHousehold(c); }
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'search') { S.q = e.target.value; renderStock(); }
  if (e.target.id === 'say') updateSayPreview();
  if (e.target.id === 'food-find') { S.foodFind = e.target.value; const l = $('#food-list'); if (l) l.innerHTML = foodChips(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'say') { e.preventDefault(); if (sayState && !$('[data-act=say-go]')?.disabled) $('[data-act=say-go]').click(); }
  if (e.target.id === 'amt') { e.preventDefault(); $('[data-act=shop-save]').click(); }
  if (e.target.id === 'manual-code') { e.preventDefault(); $('[data-act=manual-go]').click(); }
  if (e.target.id === 'voice-test') { e.preventDefault(); $('[data-act=voice-test]').click(); }
  if (e.target.id === 'food-new') { e.preventDefault(); $('[data-act=food-add]').click(); }
});
document.addEventListener('change', async (e) => {
  if (e.target.id === 'scan-photo' && e.target.files?.[0]) {
    const file = e.target.files[0]; e.target.value = '';
    if (!window.Html5Qrcode) return toast('Scanner still loading.');
    scanStatus('Reading barcode from photo…');
    try {
      const reader = new Html5Qrcode('reader-file', { formatsToSupport: FORMATS(), verbose: false });
      const code = await reader.scanFile(file, false);
      try { reader.clear(); } catch {}
      beep(true); await handleCode(code);
    } catch { beep(false); scanStatus("Couldn't find a barcode in that photo. Try closer, flat and in good light."); }
  }
});

/* ---------------- household onboarding ---------------- */
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode() { const a = new Uint8Array(12); crypto.getRandomValues(a); const s = [...a].map((x) => ALPH[x % ALPH.length]).join(''); return `TB-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`; }
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').trim();
function joinHousehold(code) {
  S.code = code; LS.set('tb.code', code);
  $('#onboard').hidden = true;
  start();
}
function showOnboarding() {
  const o = $('#onboard');
  o.hidden = false;
  o.innerHTML = `<div class="ob"><img src="icons/icon-512.png" alt=""><h1>T&amp;B Foods</h1><p>Your fridge, both freezers and the shopping, on both phones.</p>
    <div class="card"><b>First phone</b><p class="small muted" style="margin:4px 0 12px">Creates your household. You'll then send a link to the other phone.</p><button class="btn block" data-act="ob-new">Set up our kitchen</button></div>
    <div class="card"><b>Joining?</b><p class="small muted" style="margin:4px 0 12px">Paste the code from the other phone (More › Our household).</p><input type="text" id="ob-code" placeholder="TB-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off"><button class="btn ghost block" style="margin-top:10px" data-act="ob-join">Join</button></div></div>`;
}

async function start() {
  S.store = remoteConfigured() ? new RemoteStore(CFG.supabaseUrl, CFG.supabaseKey, S.code) : new LocalStore();
  // Keep the household code in the address so "Add to Home Screen" carries it to the installed app.
  if (!isStandalone()) { try { const u = new URL(location.href); if (u.searchParams.get('join') !== S.code) { u.searchParams.set('join', S.code); history.replaceState(null, '', u); } } catch {} }
  LS.del('tb.cache');
  const c = LS.get('tb.cache.' + S.code, null);
  if (c) { Object.assign(S, { items: c.items || [], usage: c.usage || [], shops: c.shops || [], products: c.products || {}, settings: { ...DEFAULT_SETTINGS, ...(c.settings || {}) } }); render(); }
  await reload();
  if (S.store.kind === 'remote') {
    S.store.live(() => reload(true));
    setInterval(() => { if (document.visibilityState === 'visible' && $('#sheet-wrap').hidden) reload(true); }, 15000);
  }
  if (S.loc !== 'all') renderStock();
}
// Coming back to the app (home-screen icon, app switcher, unlocking): fetch fresh, and retry while the phone's network wakes up.
let resumeAt = 0;
async function resume() {
  if (S.store?.kind !== 'remote' || document.visibilityState !== 'visible') return;
  const now = Date.now(); if (now - resumeAt < 1500) return; resumeAt = now;
  S.store.relive();
  for (const wait of [0, 1500, 4000, 10000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (await reload(true)) break;
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resume(); if (document.visibilityState === 'hidden' && S.tab === 'add') stopScanner(); });
window.addEventListener('pageshow', () => resume());
window.addEventListener('focus', () => resume());
window.addEventListener('online', () => resume());
document.addEventListener('click', (e) => { if (e.target.closest('#sync')) { setSync('busy'); reload(); } });

/* ---------------- boot ---------------- */
(function boot() {
  const qs = new URLSearchParams(location.search);
  const j = normCode(qs.get('join'));
  if (j && j.length >= 10 && j !== S.code) { S.code = j; LS.set('tb.code', j); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  setSync(remoteConfigured() ? 'busy' : 'local');
  if (!S.code) showOnboarding(); else start();
  if (location.hash === '#add') setTab('add');
})();

// exposed for tests
window.TB = { parseCommand, S, supplyStats, lowStock, handleCode, flagOf };
