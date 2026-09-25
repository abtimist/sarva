let allNotes = [];

function getBackUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('from') === 'teacher') return '/dashboard.html';
  return '/student';
}

async function init() {
  document.getElementById('back-btn').href = getBackUrl();
  await loadAllNotes();
}

async function loadAllNotes() {
  const container = document.getElementById('notes-container');
  const empty = document.getElementById('empty-state');
  const loading = document.getElementById('loading');

  loading.style.display = 'block';
  empty.style.display = 'none';
  container.innerHTML = '';

  try {
    const r = await fetch('/api/notes-all');
    allNotes = await r.json();
    loading.style.display = 'none';

    if (allNotes.length === 0) {
      empty.style.display = 'block';
      return;
    }

    document.getElementById('download-all-btn').disabled = false;
    renderGrouped(allNotes);
  } catch (e) {
    loading.style.display = 'none';
    empty.textContent = 'Error loading notes.';
    empty.style.display = 'block';
  }
}

function getDateKey(dateStr) {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr + 'Z');
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function formatDateLabel(dateKey) {
  if (dateKey === 'Unknown') return 'Unknown Date';
  const d = new Date(dateKey + 'T00:00:00');
  const today = new Date();
  const todayKey = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.getFullYear() + '-' +
    String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
    String(yesterday.getDate()).padStart(2, '0');

  const full = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  if (dateKey === todayKey) return 'Today — ' + full;
  if (dateKey === yesterdayKey) return 'Yesterday — ' + full;
  return full;
}

function getDateIcon(dateKey) {
  if (dateKey === 'Unknown') return '📅';
  const d = new Date(dateKey + 'T00:00:00');
  const day = d.getDay();
  if (day === 0 || day === 6) return '📒';
  return '📝';
}

function renderGrouped(notes) {
  const container = document.getElementById('notes-container');
  container.innerHTML = '';

  const groups = {};
  notes.forEach(n => {
    const key = getDateKey(n.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  });

  const sortedKeys = Object.keys(groups).sort().reverse();

  sortedKeys.forEach(dateKey => {
    const groupNotes = groups[dateKey];
    const group = document.createElement('div');
    group.className = 'date-group';

    const header = document.createElement('div');
    header.className = 'date-header';
    const icon = getDateIcon(dateKey);
    const label = formatDateLabel(dateKey);
    const count = groupNotes.length;

    header.innerHTML = `
      <div class="date-header-left">
        <span class="date-icon">${icon}</span>
        <span class="date-label">${esc(label)}</span>
        <span class="date-count">${count} note${count !== 1 ? 's' : ''}</span>
      </div>
      <div class="date-header-right" style="display:flex; gap:8px; align-items:center;">
        <button class="date-download-btn" style="background:rgba(168, 85, 247, 0.15); color:#c084fc; border-color:rgba(168, 85, 247, 0.4);" onclick="event.stopPropagation(); downloadAISummarizedNotes('${dateKey}')">✨ Download AI Summarized Notes</button>
        <button class="date-download-btn" style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; border-color:rgba(59, 130, 246, 0.4);" onclick="event.stopPropagation(); downloadDateTranscriptPDF('${dateKey}')">📥 Raw Transcript</button>
        <span class="date-chevron">▼</span>
      </div>
    `;
    header.addEventListener('click', () => group.classList.toggle('collapsed'));
    group.appendChild(header);

    const notesDiv = document.createElement('div');
    notesDiv.className = 'date-notes';

    groupNotes.forEach(n => {
      const card = document.createElement('div');
      card.className = 'note-card';

      const time = n.created_at
        ? new Date(n.created_at + 'Z').toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : '';

      const sessionLabel = n.session_title && n.session_title !== 'Untitled Session'
        ? n.session_title
        : `Session ${n.session_id}`;

      card.innerHTML = `
        <div class="note-card-header">
          <div>
            <div class="note-card-title">${esc(n.title || 'Note')}</div>
            <div class="note-card-session">${esc(sessionLabel)}</div>
          </div>
          <div class="note-card-meta" style="display:flex; gap:10px; align-items:center;">
            <div class="note-card-time">${time}</div>
            <button onclick="downloadSingleTranscriptPDF(${n.id})" style="background:rgba(59, 130, 246, 0.15); border:1px solid rgba(59,130,246,0.3); color:#60a5fa; border-radius:4px; padding:3px 8px; font-size:0.7rem; cursor:pointer;">📥 Transcript</button>
          </div>
        </div>
        <div class="note-card-content markdown-body">${marked.parse(n.content || '')}</div>
      `;
      notesDiv.appendChild(card);
    });

    // Set max-height for animation
    requestAnimationFrame(() => {
      notesDiv.style.maxHeight = notesDiv.scrollHeight + 200 + 'px';
    });

    group.appendChild(notesDiv);
    container.appendChild(group);
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── PDF Generation ──
function generatePDF(notes, filename) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxTextWidth = pageWidth - 2 * margin;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(74, 222, 128);
    doc.text('Sarva — Session Notes', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    const now = new Date().toLocaleString();
    doc.text(`Generated: ${now}`, margin, y);
    y += 10;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Group by date in PDF
    const groups = {};
    notes.forEach(n => {
      const key = getDateKey(n.created_at);
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    });

    const sortedKeys = Object.keys(groups).sort();

    sortedKeys.forEach(dateKey => {
      if (y > pageHeight - 30) { doc.addPage(); y = margin; }

      // Date header in PDF
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(74, 222, 128);
      doc.text(formatDateLabel(dateKey), margin, y);
      y += 7;

      groups[dateKey].forEach((note, idx) => {
        if (y > pageHeight - 40) { doc.addPage(); y = margin; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        doc.text(note.title || `Note ${idx + 1}`, margin, y);
        y += 5;

        if (note.created_at) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(140, 140, 140);
          const time = new Date(note.created_at + 'Z').toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
          const sessionLabel = note.session_title && note.session_title !== 'Untitled Session' ? note.session_title : `Session ${note.session_id}`;
          doc.text(`${time} — ${sessionLabel}`, margin, y);
          y += 5;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        
        let content = note.content || '';
        content = content.replace(/[^\x00-\x7F]/g, "?");
        const lines = doc.splitTextToSize(content, maxTextWidth);
        lines.forEach(line => {
          if (y > pageHeight - margin) { doc.addPage(); y = margin; }
          doc.text(line, margin, y);
          y += 4.2;
        });

        y += 6;

        if (idx < groups[dateKey].length - 1) {
          doc.setDrawColor(230, 230, 230);
          doc.setLineWidth(0.15);
          doc.line(margin, y - 3, pageWidth - margin, y - 3);
          y += 2;
        }
      });

      y += 4;
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(160, 160, 160);
      doc.text(`Sarva Notes — Page ${i} of ${totalPages}`, margin, pageHeight - 10);
    }

    doc.save(filename);
  } catch (e) {
    alert("Error generating PDF: " + e.message);
  }
}

function downloadDatePDF(dateKey) {
  const dateNotes = allNotes.filter(n => getDateKey(n.created_at) === dateKey);
  if (dateNotes.length === 0) return;
  const filename = `sarva-notes-${dateKey}.pdf`;
  generatePDF(dateNotes, filename);
  showToast(`Downloaded ${dateNotes.length} note(s) for ${dateKey}`);
}

function downloadAllNotes() {
  if (allNotes.length === 0) return;
  const filename = `sarva-all-notes.pdf`;
  generatePDF(allNotes, filename);
  showToast(`Downloaded all ${allNotes.length} notes`);
}

function generateTranscriptPDF(notes, filename) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxTextWidth = pageWidth - 2 * margin;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(59, 130, 246);
    doc.text('Sarva — Raw Transcripts', margin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
    y += 10;

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    notes.forEach((note, idx) => {
      if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = margin; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(40, 40, 40);
      doc.text(note.title || `Recording ${idx + 1}`, margin, y);
      y += 6;

      if (note.created_at) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 140);
        const time = new Date(note.created_at + 'Z').toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        doc.text(`${time}`, margin, y);
        y += 6;
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      
      let fullTranscript = "";
      if (note.recordings && note.recordings.length > 0) {
         fullTranscript = note.recordings.map(r => r.transcript).join(" ");
      } else {
         fullTranscript = note.content || "";
      }
      
      if (!fullTranscript.trim()) fullTranscript = "(No transcript recorded)";
      
      // Remove any characters that could crash jsPDF's splitTextToSize (non-Latin1)
      fullTranscript = fullTranscript.replace(/[^\x00-\x7F]/g, "?");

      const lines = doc.splitTextToSize(fullTranscript, maxTextWidth);
      lines.forEach(line => {
        if (y > doc.internal.pageSize.getHeight() - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += 4.5;
      });

      y += 10;
    });

    doc.save(filename);
  } catch (e) {
    alert("Error generating PDF: " + e.message);
  }
}

function downloadDateTranscriptPDF(dateKey) {
  const dateNotes = allNotes.filter(n => getDateKey(n.created_at) === dateKey);
  if (dateNotes.length === 0) return;
  const filename = `sarva-transcripts-${dateKey}.pdf`;
  generateTranscriptPDF(dateNotes, filename);
  showToast(`Downloaded transcripts for ${dateKey}`);
}

function downloadSingleTranscriptPDF(noteId) {
  const note = allNotes.find(n => n.id === noteId);
  if (!note) return;
  const filename = `sarva-transcript-${noteId}.pdf`;
  generateTranscriptPDF([note], filename);
  showToast(`Downloaded transcript PDF`);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

init();

async function downloadAISummarizedNotes(dateKey) {
  const dateNotes = allNotes.filter(n => getDateKey(n.created_at) === dateKey);
  if (dateNotes.length === 0) return;

  // Gather all transcripts for this day
  let fullText = "";
  dateNotes.forEach(note => {
    if (note.recordings && note.recordings.length > 0) {
       fullText += note.recordings.map(r => r.transcript).join(" ") + " ";
    } else {
       fullText += (note.content || "") + " ";
    }
  });

  if (!fullText.trim()) {
    showToast("No transcripts available to summarize.");
    return;
  }

  const overlay = document.getElementById('ai-loading-overlay');
  overlay.style.display = 'flex';

  try {
    const res = await fetch('/api/notes/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: fullText })
    });
    
    if (!res.ok) throw new Error("Failed to summarize");
    const data = await res.json();
    const markdown = data.markdown;

    // Convert markdown to HTML for html2pdf
    const htmlContent = marked.parse(markdown);

    const htmlString = `
      <div style="font-family: 'Helvetica', sans-serif; padding: 40px; color: #333; background: #fff;">
        <h1 style="color: #4ade80; margin-bottom: 5px;">Sarva — AI Summarized Notes</h1>
        <p style="color: #888; font-size: 12px; margin-bottom: 30px; border-bottom: 1px solid #ddd; padding-bottom: 10px;">
          Generated on: ${new Date().toLocaleString()} | Date: ${formatDateLabel(dateKey)}
        </p>
        <div style="line-height: 1.6; font-size: 15px; color: #222;">
          ${htmlContent}
        </div>
      </div>
    `;

    const opt = {
      margin:       [10, 10, 10, 10],
      filename:     `sarva-ai-notes-${dateKey}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    await html2pdf().set(opt).from(htmlString).save();
    
    showToast(`Downloaded AI Notes for ${dateKey}`);
  } catch (err) {
    alert("Error generating AI Notes: " + err.message);
  } finally {
    overlay.style.display = 'none';
  }
}
