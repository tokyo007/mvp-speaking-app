// ----- Recording state -----
let chunks1 = [];
let chunks2 = [];
let mediaRecorder1 = null;
let mediaRecorder2 = null;
let blob1 = null;
let blob2 = null;

// ----- Helpers: UI + formatting -----
function scoreBadge(label, val) {
  if (typeof val !== 'number') return '';
  const cls = val >= 80 ? 'good' : val >= 60 ? 'warn' : 'bad';
  return `<span class="badge ${cls}">${label}: ${Math.round(val)}</span>`;
}

// Azure JSON can nest word info here (case varies by SDK response)
function extractWords(detail) {
  try {
    const nbest = detail?.NBest?.[0] || detail?.nBest?.[0];
    const words = nbest?.Words || nbest?.words || [];
    return Array.isArray(words) ? words : [];
  } catch (e) {
    return [];
  }
}

function renderWordTable(words) {
  if (!words.length) return '<div class="muted">No word-level details.</div>';
  const rows = words.map(w => {
    const word = w.Word || w.word || '';
    const err  = w.ErrorType || w.errorType || 'None';
    const pa   = w.PronunciationAssessment || w.pronunciationAssessment || {};
    const acc  = pa.AccuracyScore ?? pa.accuracyScore ?? null;
    const cls  = (err && err !== 'None') || (acc !== null && acc < 60) ? 'word-bad' : '';
    return `<tr class="${cls}">
      <td>${word}</td>
      <td>${acc !== null ? Math.round(acc) : '-'}</td>
      <td>${err}</td>
    </tr>`;
  }).join('');
  return `
    <table class="table">
      <thead><tr><th>Word</th><th>Accuracy</th><th>Error</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderScores(containerId, scores) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!scores) { el.innerHTML = '<span class="muted">No scores.</span>'; return; }
  el.innerHTML = [
    scoreBadge('Overall', scores.pronunciation),
    scoreBadge('Accuracy', scores.accuracy),
    scoreBadge('Fluency', scores.fluency),
    scoreBadge('Completeness', scores.completeness),
  ].join(' ');
}

function setStatus(which, text) {
  const id = which === 1 ? 'status1' : 'status2';
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getStream() {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function setupRecorder(stream, which) {
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = which === 1 ? chunks1 : chunks2;

  mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  mr.onstop = () => {
    const blob = new Blob(chunks, { type: mime || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    if (which === 1) {
      blob1 = blob;
      const a1 = document.getElementById('audio1');
      if (a1) a1.src = url;
      const send1 = document.getElementById('send1');
      if (send1) send1.disabled = false;
    } else {
      blob2 = blob;
      const a2 = document.getElementById('audio2');
      if (a2) a2.src = url;
      const send2 = document.getElementById('send2');
      if (send2) send2.disabled = false;
    }
  };

  return mr;
}

// ----- Phrase Practice (Course A) -----
document.getElementById('rec1').onclick = async () => {
  chunks1 = [];
  try {
    const s = await getStream();
    mediaRecorder1 = setupRecorder(s, 1);
    mediaRecorder1.start();
    setStatus(1, 'recording...');
    document.getElementById('rec1').disabled = true;
    document.getElementById('stop1').disabled = false;
  } catch (e) {
    console.error(e);
    setStatus(1, 'mic blocked');
    alert('Microphone permission blocked. Please allow mic access for this site.');
  }
};

document.getElementById('stop1').onclick = () => {
  try {
    if (mediaRecorder1 && mediaRecorder1.state !== 'inactive') {
      mediaRecorder1.stop();
      setStatus(1, 'recorded');
    }
  } finally {
    document.getElementById('rec1').disabled = false;
    document.getElementById('stop1').disabled = true;
  }
};

document.getElementById('send1').onclick = async () => {
  if (!blob1) return;
  const fd = new FormData();
  const phrase = document.getElementById('phrase').value;
  const lang = document.getElementById('lang1').value;
  fd.append('phrase', phrase);
  fd.append('language', lang);
  fd.append('audio', blob1, 'audio.webm');
  setStatus(1, 'uploading...');

  try {
    const res = await fetch('/assess_phrase', { method: 'POST', body: fd });
    const json = await res.json();

    // Scores
    renderScores('scores1', json.scores);

    // Recognized vs Reference
    const rec1 = document.getElementById('recognized1');
    if (rec1) {
      rec1.innerHTML =
        `<div><strong>Recognized:</strong> ${json.recognizedText || '(empty)'}</div>
         <div><strong>Reference:</strong> ${json.referenceText || '(none)'}</div>`;
    }

    // Word table
    const words = extractWords(json.detail || {});
    const w1 = document.getElementById('words1');
    if (w1) w1.innerHTML = renderWordTable(words);

    setStatus(1, (json.status === 'ok') ? 'done' : 'error');
  } catch (e) {
    console.error(e);
    setStatus(1, 'error');
    alert('Upload or scoring failed. See console for details.');
  }
};

// ----- Prompt Response (Course B) -----
document.getElementById('rec2').onclick = async () => {
  chunks2 = [];
  try {
    const s = await getStream();
    mediaRecorder2 = setupRecorder(s, 2);
    mediaRecorder2.start();
    setStatus(2, 'recording (max ~60s)...');
    document.getElementById('rec2').disabled = true;
    document.getElementById('stop2').disabled = false;

    // Optional auto-stop at ~65s
    setTimeout(() => {
      try {
        if (mediaRecorder2 && mediaRecorder2.state !== 'inactive') {
          mediaRecorder2.stop();
          setStatus(2, 'auto-stopped');
          document.getElementById('rec2').disabled = false;
          document.getElementById('stop2').disabled = true;
        }
      } catch (e) {}
    }, 65000);
  } catch (e) {
    console.error(e);
    setStatus(2, 'mic blocked');
    alert('Microphone permission blocked. Please allow mic access for this site.');
  }
};

document.getElementById('stop2').onclick = () => {
  try {
    if (mediaRecorder2 && mediaRecorder2.state !== 'inactive') {
      mediaRecorder2.stop();
      setStatus(2, 'recorded');
    }
  } finally {
    document.getElementById('rec2').disabled = false;
    document.getElementById('stop2').disabled = true;
  }
};

document.getElementById('send2').onclick = async () => {
  if (!blob2) return;
  const fd = new FormData();
  const lang = document.getElementById('lang2').value;
  fd.append('language', lang);
  fd.append('audio', blob2, 'audio.webm');
  setStatus(2, 'uploading...');

  try {
    const res = await fetch('/assess_prompt', { method: 'POST', body: fd });
    const json = await res.json();

    // Scores
    renderScores('scores2', json.scores);

    // Recognized and transcript used as reference
    const rec2 = document.getElementById('recognized2');
    if (rec2) {
      rec2.innerHTML = `<div><strong>Recognized:</strong> ${json.recognizedText || '(empty)'}</div>`;
    }
    const tr2 = document.getElementById('transcript2');
    if (tr2) {
      tr2.innerHTML = `<div><strong>Transcript (used as reference):</strong> ${json.transcriptUsedAsReference || '(none)'}</div>`;
    }

    // Word table
    const words = extractWords(json.detail || {});
    const w2 = document.getElementById('words2');
    if (w2) w2.innerHTML = renderWordTable(words);

    setStatus(2, (json.status === 'ok') ? 'done' : 'error');
  } catch (e) {
    console.error(e);
    setStatus(2, 'error');
    alert('Upload or scoring failed. See console for details.');
  }
};

// ----- Simple bootstrap log to confirm script is loaded -----
console.log('recorder bootstrap OK');
if (!('MediaRecorder' in window)) console.error('MediaRecorder not supported in this browser');

