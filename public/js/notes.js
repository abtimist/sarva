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
      <div class="date-header-right">
        <button class="date-download-btn" onclick="event.stopPropagation(); downloadDatePDF('${dateKey}')">📥 PDF</button>
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
          <div class="note-card-meta">
            <div class="note-card-time">${time}</div>
          </div>
        </div>
        <div class="note-card-content">${esc(n.content || '')}</div>
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
      const lines = doc.splitTextToSize(note.content || '', maxTextWidth);
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

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

init();
