\
let chunks1 = [];
let chunks2 = [];
let mediaRecorder1 = null;
let mediaRecorder2 = null;
let blob1 = null;
let blob2 = null;

async function getStream() {
  return await navigator.mediaDevices.getUserMedia({ audio: true });
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
      document.getElementById('audio1').src = url;
      document.getElementById('send1').disabled = false;
    } else {
      blob2 = blob;
      document.getElementById('audio2').src = url;
      document.getElementById('send2').disabled = false;
    }
  };
  return mr;
}

// UI wiring for Phrase Practice
document.getElementById('rec1').onclick = async () => {
  chunks1 = [];
  const s = await getStream();
  mediaRecorder1 = setupRecorder(s, 1);
  mediaRecorder1.start();
  document.getElementById('status1').textContent = 'recording...';
  document.getElementById('rec1').disabled = true;
  document.getElementById('stop1').disabled = false;
};

document.getElementById('stop1').onclick = () => {
  if (mediaRecorder1 && mediaRecorder1.state !== 'inactive') {
    mediaRecorder1.stop();
    document.getElementById('status1').textContent = 'recorded';
  }
  document.getElementById('rec1').disabled = false;
  document.getElementById('stop1').disabled = true;
};

document.getElementById('send1').onclick = async () => {
  if (!blob1) return;
  const fd = new FormData();
  const phrase = document.getElementById('phrase').value;
  const lang = document.getElementById('lang1').value;
  fd.append('phrase', phrase);
  fd.append('language', lang);
  fd.append('audio', blob1, 'audio.webm');
  document.getElementById('status1').textContent = 'uploading...';

  const res = await fetch('/assess_phrase', { method: 'POST', body: fd });
  const json = await res.json();
  document.getElementById('result1').textContent = JSON.stringify(json, null, 2);
  document.getElementById('status1').textContent = 'done';
};

// UI wiring for Prompt Response
document.getElementById('rec2').onclick = async () => {
  chunks2 = [];
  const s = await getStream();
  mediaRecorder2 = setupRecorder(s, 2);
  mediaRecorder2.start();
  document.getElementById('status2').textContent = 'recording (max ~60s)...';
  document.getElementById('rec2').disabled = true;
  document.getElementById('stop2').disabled = false;
  // Optional auto-stop at 65s
  setTimeout(() => {
    try {
      if (mediaRecorder2 && mediaRecorder2.state !== 'inactive') {
        mediaRecorder2.stop();
        document.getElementById('status2').textContent = 'auto-stopped';
        document.getElementById('rec2').disabled = false;
        document.getElementById('stop2').disabled = true;
      }
    } catch(e) {}
  }, 65000);
};

document.getElementById('stop2').onclick = () => {
  if (mediaRecorder2 && mediaRecorder2.state !== 'inactive') {
    mediaRecorder2.stop();
    document.getElementById('status2').textContent = 'recorded';
  }
  document.getElementById('rec2').disabled = false;
  document.getElementById('stop2').disabled = true;
};

document.getElementById('send2').onclick = async () => {
  if (!blob2) return;
  const fd = new FormData();
  const lang = document.getElementById('lang2').value;
  fd.append('language', lang);
  fd.append('audio', blob2, 'audio.webm');
  document.getElementById('status2').textContent = 'uploading...';

  const res = await fetch('/assess_prompt', { method: 'POST', body: fd });
  const json = await res.json();
  document.getElementById('result2').textContent = JSON.stringify(json, null, 2);
  document.getElementById('status2').textContent = 'done';
};
