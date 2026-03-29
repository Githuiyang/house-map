const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'data', 'communities.json');
const backupPath = path.join(root, 'data', 'communities.json.bak');
const reportPath = path.join(root, 'data', 'communities.rematch-report.json');
const COMPANY = [121.512568, 31.304715];

const apiKey = process.env.AMAP_WEB_KEY || '';
if (!apiKey) {
  console.error('缺少 AMAP_WEB_KEY');
  process.exit(1);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const parseLocation = (value) => {
  if (!value || typeof value !== 'string') return null;
  const [lngStr, latStr] = value.split(',');
  const lng = Number(lngStr);
  const lat = Number(latStr);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lng < 72 || lng > 136 || lat < 3 || lat > 54) return null;
  return [lng, lat];
};

const fetchJson = async (url) => {
  const res = await fetch(url);
  const data = await res.json();
  return data;
};

const normalizeName = (name) => {
  return String(name || '')
    .replace(/\s+/g, '')
    .replace(/[·•\-\(\)（）]/g, '')
    .replace(/小区/g, '');
};

const getNumberTokens = (name) => {
  const s = String(name || '');
  const tokens = s.match(/\d+(?:弄|号|村|支弄|室|幢|号楼)/g) || [];
  return tokens;
};

const distanceMeters = (a, b) => {
  const toRad = (d) => d * Math.PI / 180;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const isLikelyNameMatch = (originName, candidateName) => {
  const a = normalizeName(originName);
  const b = normalizeName(candidateName);
  if (!a || !b) return false;
  const basic = a === b || a.includes(b) || b.includes(a);
  if (!basic) return false;
  const originTokens = getNumberTokens(originName);
  if (originTokens.length === 0) return true;
  return originTokens.every(t => b.includes(t.replace(/小区/g, '')));
};

const queryPlace = async (originName, keyword) => {
  const url = `https://restapi.amap.com/v3/place/text?key=${apiKey}&keywords=${encodeURIComponent(keyword)}&city=上海&citylimit=true&offset=5`;
  const data = await fetchJson(url);
  if (data.status !== '1' || !Array.isArray(data.pois)) return null;
  for (const poi of data.pois) {
    const loc = parseLocation(poi.location);
    if (!loc) continue;
    if (!isLikelyNameMatch(originName, poi.name || '')) continue;
    if (distanceMeters(loc, COMPANY) > 12000) continue;
    return { location: loc, source: 'place', title: poi.name || keyword };
  }
  return null;
};

const queryGeo = async (address) => {
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${apiKey}&address=${encodeURIComponent(address)}`;
  const data = await fetchJson(url);
  if (data.status !== '1' || !Array.isArray(data.geocodes) || data.geocodes.length === 0) return null;
  const geocode = data.geocodes[0];
  const loc = parseLocation(geocode.location);
  if (!loc) return null;
  if (distanceMeters(loc, COMPANY) > 12000) return null;
  return { location: loc, source: 'geo', title: geocode.formatted_address || address };
};

const rematchOne = async (name) => {
  const placeQueries = [name, `${name}小区`, `杨浦区${name}`, `上海杨浦${name}`];
  for (const q of placeQueries) {
    const ret = await queryPlace(name, q);
    if (ret) return { ...ret, query: q };
    await sleep(90);
  }
  const geoQueries = [`上海市杨浦区${name}`, `上海杨浦${name}`, name];
  for (const q of geoQueries) {
    const ret = await queryGeo(q);
    if (ret) return { ...ret, query: q };
    await sleep(90);
  }
  return null;
};

const run = async () => {
  const communities = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  fs.copyFileSync(dataPath, backupPath);

  let matched = 0;
  const unresolved = [];
  const rows = [];

  for (const community of communities) {
    const before = Array.isArray(community.coordinates) ? community.coordinates : null;
    let result = null;
    try {
      result = await rematchOne(community.name);
    } catch (e) {
      result = null;
    }

    if (result) {
      community.coordinates = result.location;
      matched += 1;
      rows.push({
        id: community.id,
        name: community.name,
        status: 'matched',
        source: result.source,
        query: result.query,
        title: result.title,
        before,
        after: result.location,
      });
    } else {
      unresolved.push(community.name);
      rows.push({
        id: community.id,
        name: community.name,
        status: 'unresolved',
        before,
      });
    }
    await sleep(120);
  }

  fs.writeFileSync(dataPath, JSON.stringify(communities, null, 2) + '\n', 'utf8');
  fs.writeFileSync(reportPath, JSON.stringify({
    total: communities.length,
    matched,
    unresolvedCount: unresolved.length,
    unresolved,
    rows,
  }, null, 2) + '\n', 'utf8');

  console.log(`matched=${matched}/${communities.length}`);
  if (unresolved.length > 0) {
    console.log(`unresolved=${unresolved.length}`);
  }
  console.log(`report=${reportPath}`);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
