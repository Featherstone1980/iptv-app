const cleanChannelName = (name) => {
    let cleaned = name.toUpperCase();
    
    // 0. Strip leading IPTV country/region prefixes BEFORE the alphanumeric collapse.
    const prefixRegex1 = /^(USA?|UK|CA|CANADA|AU|AUSTRALIA|NZ|IE|ZA|MX|BR|IN|FR|DE|ES|IT|NL|PT|PL|RU|TR|AR|SA|AE|EG|PK|LATIN|SPANISH|BRITISH|AMERICAN)\s*[:|\-\/\|]\s*/i;
    const prefixRegex2 = /^(USA?|UK|CA|CANADA|AU|AUSTRALIA|NZ|IE|ZA|MX|BR|IN|FR|DE|ES|IT|NL|PT|PL|RU|TR|AR|SA|AE|EG|PK|LATIN|SPANISH|BRITISH|AMERICAN)\s+/i;
    
    cleaned = cleaned.replace(prefixRegex1, '').replace(prefixRegex2, '');
    cleaned = cleaned.replace(prefixRegex1, '').replace(prefixRegex2, '');

    // 0.2 Strip trailing/middle country tags (e.g. "BET USA West" -> "BET West", "Sky Sports UK" -> "Sky Sports")
    const startsWithUsa = /^USA\b/i.test(cleaned);
    const startsWithUk = /^UK\b/i.test(cleaned);
    
    cleaned = cleaned.replace(/\b(?:USA|UK|CA|AU)\b/gi, '');
    
    if (startsWithUsa) cleaned = 'USA ' + cleaned;
    if (startsWithUk) cleaned = 'UK ' + cleaned;
    
    cleaned = cleaned.replace(/&/g, ' AND ');

    const acronymMap = {
        'HGTV': 'HOME AND GARDEN TELEVISION',
        'EPIX': 'MGM',
        'SYFY': 'SCI FI',
        'SNY': 'SPORTSNET NEW YORK',
        'DP CLASICO': 'DE PELICULA CLASICO',
        'FXM': 'FX MOVIE CHANNEL',
        'NESN': 'NEW ENGLAND SPORTS NETWORK',
        'MASN': 'MID ATLANTIC SPORTS NETWORK',
        'NBCSN': 'NBC SPORTS NETWORK',
        'CBSSN': 'CBS SPORTS NETWORK',
        'FS1': 'FOX SPORTS 1',
        'FS2': 'FOX SPORTS 2',
        'SEC': 'SEC NETWORK',
        'ACC': 'ACC NETWORK',
        'BTN': 'BIG TEN NETWORK',
        'OAN': 'ONE AMERICA NEWS',
        'OANN': 'ONE AMERICA NEWS NETWORK'
    };
    for (const [acronym, full] of Object.entries(acronymMap)) {
        const regex = new RegExp(`\\b${acronym}\\b`, 'gi');
        cleaned = cleaned.replace(regex, full);
    }

    cleaned = cleaned.replace(/\[.*?\]|\(.*?\)|\{.*?\}/g, '');
    cleaned = cleaned.replace(/\b(1080P|720P|4K|8K|FHD|UHD|LHD|HD|SD|HEVC|H265|60FPS|50FPS|VOD|CATCHUP|VIP|PREMIUM)\b/gi, '');
    cleaned = cleaned.replace(/\b(CHANNEL|NETWORK|TV|BROADCASTING)\b/gi, '');
    cleaned = cleaned.replace(/\b(?:EAST|WEST)\b/gi, '');
    cleaned = cleaned.replace(/\+1\b/g, 'PLUS1').replace(/\+2\b/g, 'PLUS2');
    cleaned = cleaned.replace(/[^A-Z0-9]/gi, '');
    
    const prefixes = ['THE', 'LOCAL'];
    prefixes.forEach(prefix => {
        if (cleaned.startsWith(prefix) && cleaned.length > prefix.length + 2) {
            cleaned = cleaned.substring(prefix.length);
        }
        if (cleaned.endsWith(prefix) && cleaned.length > prefix.length + 2) {
            cleaned = cleaned.substring(0, cleaned.length - prefix.length);
        }
    });
    
    return cleaned;
};

console.log(cleanChannelName('CANADA HGTV'));
console.log(cleanChannelName('HGTV'));
