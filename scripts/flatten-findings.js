// Flatten audit findings registers to compact chat-ready text.
const fs = require('fs');
const out = [];
for (const f of ['audit-findings-1.js', 'audit-findings-2.js']) {
  const src = fs.readFileSync('/home/z/my-project/scripts/' + f, 'utf8');
  for (const m of src.matchAll(/const (P1|P2|P3) = \[([\s\S]*?)\n\];/g)) {
    const blocks = m[2].split(/\n\s*\{/).slice(1).map(b => '{' + b);
    for (const it of blocks) {
      const g = k => {
        const re = new RegExp(k + ': "((?:[^"\\\\]|\\\\.)*)"');
        const mm = it.match(re);
        return mm ? mm[1].replace(/\\"/g, '"') : '';
      };
      out.push('@@' + g('id') + '|' + g('sev') + '|' + g('area') + '|' + g('title'));
      out.push('  LOC: ' + g('files'));
      out.push('  PROBLEM: ' + g('problem'));
      out.push('  FIX: ' + g('fix'));
    }
  }
}
fs.writeFileSync('/tmp/findings-flat.txt', out.join('\n'));
console.log('findings:', out.filter(l => l.startsWith('@@')).length, 'lines:', out.length);
