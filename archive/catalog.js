/* Editable archive text is separate from tracking coordinates and simulated figures. */
(function () {
  'use strict';
  const models = {
    person: ['delivery', 'ebike'], vehicle: ['sedan', 'suv', 'truck', 'coach', 'bus'],
    infrastructure: ['streetlight'], appliance: ['outdoorunit']
  };
  let records = new Map();
  function validate(input, objects) {
    if (!input || input.version !== 1 || !Array.isArray(input.records)) throw new Error('Unsupported archive catalog');
    const targets = new Map(objects.map(o => [o.objectId, o])), seen = new Set();
    for (const r of input.records) {
      const target = targets.get(r.objectId);
      if (!target || seen.has(r.objectId)) throw new Error('Unknown or duplicate objectId: ' + r.objectId);
      seen.add(r.objectId);
      if (r.category !== target.category || !models[r.category]?.includes(r.model)) throw new Error('Model/category mismatch: ' + r.objectId);
      if (r.name !== target.label || r.nameEn !== target.labelEn) throw new Error('Name/target mismatch: ' + r.objectId);
      if (typeof r.description !== 'string' || (r.description && !r.descriptionSource)) throw new Error('Description needs a source: ' + r.objectId);
      if (!Array.isArray(r.details) || r.details.some(d => !d.label || !d.value || !d.source)) throw new Error('Every detail needs a label, value and source: ' + r.objectId);
    }
    return input.records;
  }
  async function load(objects) {
    records = new Map();
    try {
      const response = await fetch('archive/records.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const items = validate(await response.json(), objects);
      records = new Map(items.map(r => [r.objectId, r]));
      return { count: records.size, error: null };
    } catch (error) {
      console.warn('[ARCHIVE] Editable records unavailable; using original target annotations.', error);
      return { count: 0, error: error.message };
    }
  }
  function get(obj) { return records.get(obj.objectId) || null; }
  function subtype(obj) { return get(obj)?.model || window.ModelEngine.detectSubtype(obj.category, obj.labelEn); }
  const originalIdentity = window.ArchiveData.identity, originalNotes = window.ArchiveData.sourceNotes;
  window.ArchiveData.identity = obj => originalIdentity(obj) + (get(obj)?.details || []).map(d =>
    '<div class="id-row"><dt>' + window.ArchiveData.escape(d.label) + '</dt><dd>' + window.ArchiveData.escape(d.value) + '</dd></div>'
  ).join('');
  window.ArchiveData.sourceNotes = obj => {
    const record = get(obj);
    let notes = originalNotes(obj);
    if (obj.category !== 'person' && obj.category !== 'vehicle') {
      notes = 'RECORD: ' + obj.objectId + ' / tracks.json\n\nACCOUNTING BOUNDARY\nObject operation only; production is recorded separately. No sourced activity records or emission factors are supplied. Environmental estimates from tracks.json are withheld.\n\nREQUIRED EVIDENCE\nEquipment identity, reporting period, energy records and a sourced factor with matching region, year, units and accounting boundary.\n\nVISUAL STATUS\nIllustrative reconstruction, not a measured scan. Animation is not live telemetry. PENDING indicates missing assessment data.';
    }
    if (!record) return notes;
    return notes + '\n\nARCHIVE TEXT SOURCES\n' + (record.description ? record.description + '\nSource: ' + record.descriptionSource : 'No additional description supplied.') +
      record.details.map(d => '\n\n' + d.label + ': ' + d.value + '\nSource: ' + d.source).join('') +
      '\n\nMODEL MAPPING\n' + record.category + ' / ' + record.model + ' — shared illustrative model family; not a verified make or exact reconstruction.';
  };
  window.ArchiveCatalog = { load, validate, get, subtype };
})();
