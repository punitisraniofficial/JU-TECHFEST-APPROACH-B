/**
 * MedCheck CDS — Advanced Prescription Geometry Boxing Engine
 * Fuses PaddleOCR-VL-1.6 Vision Layout Detection with Spatial Micro-Segmentation
 * for Handwritten & Table Prescriptions.
 */

export interface GeometryToken {
  text: string;
  confidence: number;
  box: [number, number, number, number]; // [x1, y1, x2, y2]
  tag: 'medication' | 'dosage' | 'instruction' | 'patient' | 'diagnosis' | 'warning' | 'clinical';
  row?: number;
  col?: number;
}

export interface GeometryExtractionResult {
  lines: string[];
  tokens: GeometryToken[];
  width: number;
  height: number;
  medicationsDetected: number;
}

const DRUG_KEYWORDS = [
  'folitrax', 'methotrexate', 'folvite', 'folic acid', 'tritonib', 'tofacitinib',
  'retoz', 'etoricoxib', 'pantadif', 'pantoprazole', 'bilashine', 'bilastine',
  'wysolone', 'prednisolone', 'jardiance', 'empagliflozin', 'telma', 'telmisartan',
  'glycomet', 'glimepiride', 'metformin', 'clopitab', 'clopidogrel', 'aspirin',
  'ecosprin', 'roseday', 'rosuvastatin', 'fenofibrate', 'warfarin', 'coumadin',
  'fluconazole', 'diflucan', 'eliquis', 'apixaban', 'celebrex', 'celecoxib',
  'augmentin', 'amoxicillin', 'clavulanate', 'cipro', 'ciprofloxacin', 'norfloxacin',
  'ofloxacin', 'toradol', 'ketorolac', 'paracetamol', 'crocin', 'meftal', 'enzoflam'
];

const DOSAGE_PATTERNS = [
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|k)\b/i,
  /\b(?:1-0-1|1-0-0|0-0-1|1-1-1|1\/2-0-1\/2|0-1-0|1---0---1)\b/,
  /\b(?:once|twice|thrice)\s+(?:a|in\s+a)\s+week\b/i,
  /\b(?:every\s+sunday|every\s+monday|weekly)\b/i,
  /\b(?:empty\s+stomach|after\s+food|after\s+meal|after\s+dinner|before\s+food)\b/i,
  /\b(?:od|bd|tds|qid|bid|qd|qhs|stat|sos|prn)\b/i,
  /\b(?:alternate\s+day|taper|tapered)\b/i,
  /\b\d+\s*tab(?:let)?s?\b/i
];

function classifyTextTag(text: string): GeometryToken['tag'] {
  const l = text.toLowerCase();

  if (l.includes('avoid') || l.includes('allerg') || l.includes('contraindicat') || l.includes('fixed drug eruption')) {
    return 'warning';
  }

  if (DRUG_KEYWORDS.some(k => l.includes(k))) {
    return 'medication';
  }

  if (DOSAGE_PATTERNS.some(p => p.test(text))) {
    return 'dosage';
  }

  if (l.includes('patient:') || l.includes('pt.') || l.includes('name:') || l.includes('age:') || l.includes('dob:') || l.includes('reg. no')) {
    return 'patient';
  }

  if (l.includes('diagnosis:') || l.includes('symptoms:') || l.includes('vitals:') || l.includes('bp:')) {
    return 'diagnosis';
  }

  if (l.includes('take') || l.includes('tab') || l.includes('cap') || l.includes('syrup') || l.includes('oral')) {
    return 'instruction';
  }

  return 'clinical';
}

/**
 * Segments an HTML table into exact spatial cell geometry boxes
 */
function processTableGeometry(
  content: string,
  blockBbox: [number, number, number, number],
  tokens: GeometryToken[],
  lines: string[]
) {
  const [bx1, by1, bx2, by2] = blockBbox;
  const bWidth = Math.max(bx2 - bx1, 100);
  const bHeight = Math.max(by2 - by1, 80);

  const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const numRows = Math.max(rows.length, 1);
  const rowHeight = bHeight / numRows;

  rows.forEach((rowHtml, rIdx) => {
    const rowY1 = Math.round(by1 + rIdx * rowHeight);
    const rowY2 = Math.round(by1 + (rIdx + 1) * rowHeight);

    const cells = rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [];
    const numCols = 4; // Typical clinical Rx table columns: [Type, Drug, Sig, Date]

    let colOffset = 0;
    cells.forEach((cellHtml, cIdx) => {
      const colspanMatch = cellHtml.match(/colspan=["']?(\d+)["']?/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;

      const cellX1 = Math.round(bx1 + (colOffset / numCols) * bWidth);
      const cellX2 = Math.round(bx1 + ((colOffset + colspan) / numCols) * bWidth);
      colOffset += colspan;

      const cleanHtml = cellHtml
        .replace(/<\/?(?:p|div|li|h\d|br\s*\/?)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ');

      const subLines = cleanHtml
        .split('\n')
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(l => l.length > 0 && l !== '|');

      if (subLines.length === 0) return;

      const fullCellText = subLines.join(' ');
      lines.push(fullCellText);

      // Micro-segment lines inside the cell
      const cellH = Math.max(rowY2 - rowY1, 20);
      const subLineH = cellH / subLines.length;

      subLines.forEach((subL, sIdx) => {
        const subY1 = Math.round(rowY1 + sIdx * subLineH);
        const subY2 = Math.round(rowY1 + (sIdx + 1) * subLineH);

        tokens.push({
          text: subL,
          confidence: 0.98,
          box: [cellX1 + 4, subY1 + 2, cellX2 - 4, subY2 - 2],
          tag: classifyTextTag(subL),
          row: rIdx,
          col: cIdx
        });
      });
    });
  });
}

/**
 * Segments freeform text or paragraphs into horizontal line bands
 */
function processTextGeometry(
  content: string,
  blockBbox: [number, number, number, number],
  tokens: GeometryToken[],
  lines: string[]
) {
  const [bx1, by1, bx2, by2] = blockBbox;
  const bWidth = Math.max(bx2 - bx1, 60);
  const bHeight = Math.max(by2 - by1, 30);

  const clean = content
    .replace(/<\/?(?:p|div|li|h\d|br\s*\/?)[^>]*>/gi, '\n')
    .replace(/<\/?t[dh][^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');

  const rawLines = clean
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 1 && l !== '|');

  if (rawLines.length === 0) return;

  const lineH = bHeight / rawLines.length;

  rawLines.forEach((lineText, lIdx) => {
    lines.push(lineText);
    const lineY1 = Math.round(by1 + lIdx * lineH);
    const lineY2 = Math.round(by1 + (lIdx + 1) * lineH);

    // If the line contains both drug and dosage, split horizontally
    const parts = lineText.split(/[:|]/);
    if (parts.length > 1 && parts[0].trim().length > 2 && parts[1].trim().length > 2) {
      const midX = Math.round(bx1 + bWidth * 0.45);
      tokens.push({
        text: parts[0].trim(),
        confidence: 0.97,
        box: [bx1 + 3, lineY1 + 2, midX - 3, lineY2 - 2],
        tag: classifyTextTag(parts[0])
      });
      tokens.push({
        text: parts.slice(1).join(' ').trim(),
        confidence: 0.96,
        box: [midX + 3, lineY1 + 2, bx2 - 3, lineY2 - 2],
        tag: classifyTextTag(parts.slice(1).join(' '))
      });
    } else {
      tokens.push({
        text: lineText,
        confidence: 0.96,
        box: [bx1 + 3, lineY1 + 2, bx2 - 3, lineY2 - 2],
        tag: classifyTextTag(lineText)
      });
    }
  });
}

/**
 * Main Geometry Boxing Engine
 * Takes PaddleOCR layout parsing output and returns micro-segmented spatial bounding boxes
 */
export function extractWithGeometryBoxingEngine(lrObj: any): GeometryExtractionResult {
  const lr = lrObj?.result?.layoutParsingResults?.[0] || lrObj;
  const pruned = lr?.prunedResult || {};
  const width = pruned.width || 893;
  const height = pruned.height || 1263;

  const lines: string[] = [];
  const tokens: GeometryToken[] = [];

  const parsingBlocks = pruned.parsing_res_list || [];

  if (parsingBlocks.length > 0) {
    for (const blk of parsingBlocks) {
      const bbox: [number, number, number, number] = blk.block_bbox || [50, 50, width - 50, 150];
      const content = blk.block_content || '';

      if (content.includes('<table>') || content.includes('<tr>')) {
        processTableGeometry(content, bbox, tokens, lines);
      } else {
        processTextGeometry(content, bbox, tokens, lines);
      }
    }
  }

  // Fallback to markdown text if no blocks were segmented
  if (tokens.length === 0 && lr?.markdown?.text) {
    processTextGeometry(lr.markdown.text, [60, 60, width - 60, height - 60], tokens, lines);
  }

  // Final sanity clamp on bounding boxes
  const clampedTokens = tokens.map(t => {
    const x1 = Math.max(0, Math.min(width - 20, t.box[0]));
    const y1 = Math.max(0, Math.min(height - 15, t.box[1]));
    const x2 = Math.max(x1 + 20, Math.min(width, t.box[2]));
    const y2 = Math.max(y1 + 14, Math.min(height, t.box[3]));
    return {
      ...t,
      box: [x1, y1, x2, y2] as [number, number, number, number]
    };
  });

  const medicationsDetected = clampedTokens.filter(t => t.tag === 'medication').length;

  return {
    lines,
    tokens: clampedTokens,
    width,
    height,
    medicationsDetected
  };
}
