import JSZip from 'jszip';

function columnName(index: number): string {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Alguns sistemas exportam OOXML com prefixo de namespace ("x:row") e sem os
 * atributos `r` de linha/célula. O Excel abre normalmente, mas o ExcelJS exige
 * a forma canônica. Aqui só normalizamos as partes afetadas.
 */
function addMissingRefs(xml: string): string {
  if (!/<row\b/i.test(xml)) return xml;

  let rowNumber = 0;
  const rowPattern = /<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g;

  return xml.replace(rowPattern, (rowTag) => {
    rowNumber += 1;
    const match = rowTag.match(/^<row\b([^>]*?)(\/?)>([\s\S]*?)(?:<\/row>)?$/);
    if (!match) return rowTag;

    let attrs = match[1];
    const selfClosing = match[2] === '/';
    const inner = match[3];
    if (!/\br\s*=/.test(attrs)) attrs += ` r="${rowNumber}"`;
    if (selfClosing) return `<row${attrs}/>`;

    let column = 0;
    const cells = inner.replace(/<c\b([^>]*?)(\/?)>/g, (cellTag, cellAttrs: string, slash: string) => {
      column += 1;
      let next = cellAttrs;
      if (!/\br\s*=/.test(next)) next += ` r="${columnName(column)}${rowNumber}"`;
      return `<c${next}${slash}>`;
    });

    return `<row${attrs}>${cells}</row>`;
  });
}

/** Devolve o mesmo arquivo quando já está no formato esperado. */
export async function normalizeWorkbook(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;

  for (const name of Object.keys(zip.files)) {
    if (!/\.xml$/i.test(name)) continue;
    const entry = zip.file(name);
    if (!entry) continue;

    const original = await entry.async('string');
    let xml = original;

    if (xml.includes('<x:') || xml.includes('</x:')) {
      xml = xml.replace(/xmlns:x="/g, 'xmlns="').replace(/<(\/?)x:/g, '<$1');
    }

    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name)) {
      xml = addMissingRefs(xml);
    }

    if (xml !== original) {
      zip.file(name, xml);
      changed = true;
    }
  }

  if (!changed) return buffer;
  return zip.generateAsync({ type: 'arraybuffer' });
}
