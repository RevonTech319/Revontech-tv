/** Tanzanian numbers → 2557XXXXXXXX (digits only). Returns '' when invalid. */
export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = '255' + d.slice(1);
  else if (d.length === 9) d = '255' + d;
  return /^255\d{9}$/.test(d) ? d : '';
}

export type Row = Record<string, string | number>;

const stamp = () => new Date().toISOString().slice(0, 10);

function download(content: BlobPart, mime: string, name: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const esc = (v: unknown) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function exportCSV(rows: Row[], base = 'subscribers') {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const body = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
  download('\uFEFF' + body, 'text/csv;charset=utf-8', `${base}-${stamp()}.csv`);
}

/** Excel-compatible (.xls via HTML table). Phone columns are forced to text so Excel keeps all digits. */
export function exportExcel(rows: Row[], base = 'subscribers') {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const isText = (c: string) => /phone|namba/i.test(c);
  const html =
    `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table border="1">` +
    `<tr>${cols.map((c) => `<th style="background:#e11d2e;color:#fff">${esc(c)}</th>`).join('')}</tr>` +
    rows
      .map(
        (r) =>
          `<tr>${cols
            .map((c) => `<td${isText(c) ? ` style="mso-number-format:'\\@'"` : ''}>${esc(r[c])}</td>`)
            .join('')}</tr>`
      )
      .join('') +
    `</table></body></html>`;
  download(html, 'application/vnd.ms-excel;charset=utf-8', `${base}-${stamp()}.xls`);
}

export function exportJSON(rows: Row[], base = 'subscribers') {
  if (!rows.length) return;
  download(JSON.stringify(rows, null, 2), 'application/json', `${base}-${stamp()}.json`);
}

/** One number per line – paste straight into any bulk SMS tool. */
export function exportNumbersTxt(numbers: string[], base = 'numbers') {
  if (!numbers.length) return;
  download(numbers.join('\n'), 'text/plain;charset=utf-8', `${base}-${stamp()}.txt`);
}

/** vCard – import into phone contacts / WhatsApp broadcast lists. */
export function exportVCF(items: { name: string; phone: string }[], base = 'contacts') {
  if (!items.length) return;
  const body = items
    .map(
      (i) =>
        `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${(i.name || i.phone).replace(/[\r\n,;]/g, ' ')}\r\nTEL;TYPE=CELL:+${i.phone}\r\nEND:VCARD`
    )
    .join('\r\n');
  download(body, 'text/vcard;charset=utf-8', `${base}-${stamp()}.vcf`);
}
