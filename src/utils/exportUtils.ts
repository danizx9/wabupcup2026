import { RegistrationItem } from '../types';

export async function exportRegistrationsToExcel(
  registrations: RegistrationItem[],
  tournamentName: string = 'WABUP CUP 2026',
  categoryFilter: string = 'ALL'
) {
  const XLSX = await import('xlsx');
  const exportData = registrations.map((r, index) => {
    const docSummary: string[] = [];
    if (r.documents?.suratKeterangan && r.category !== 'UMUM') docSummary.push('Surat Ket');
    if (r.documents?.suratPernyataan) docSummary.push('Surat Pernyataan');
    if (r.documents?.formulirPemain) docSummary.push('Form Pemain');
    if (r.documents?.aktaKelahiran) docSummary.push('Akta SD');
    if (r.documents?.raportKartuPelajar) docSummary.push('Raport/Kartu Pelajar');
    if (r.documents?.ktpGabungan) docSummary.push('KTP Gabungan');
    if (r.documents?.bpjsKetenagakerjaan) docSummary.push('BPJS Ketenagakerjaan');
    if (r.documents?.buktiPembayaran) docSummary.push('Bukti Transfer');
    if (r.documents?.logoTim) docSummary.push('Logo Tim');

    const paymentLabel =
      r.paymentStatus === 'PAID'
        ? 'LUNAS'
        : r.paymentStatus === 'VERIFYING'
        ? 'MENUNGGU VERIFIKASI'
        : 'BELUM BAYAR';

    const statusLabel =
      r.status === 'APPROVED'
        ? 'DISETUJUI (APPROVED)'
        : r.status === 'REJECTED'
        ? 'DITOLAK (REJECTED)'
        : 'MENUNGGU VERIFIKASI';

    return {
      'No': index + 1,
      'Kode Pendaftaran': r.regCode,
      'Nama Tim': r.teamName,
      'Kategori': r.category,
      'Asal Instansi / Sekolah / Desa': r.institutionName,
      'Nama Pelatih / Official': r.coachName,
      'No. WhatsApp / HP': r.coachPhone,
      'Email': r.coachEmail || '-',
      'Jumlah Pemain': r.playerCount,
      'Jumlah Official': r.officialCount,
      'Biaya Pendaftaran (Rp)': r.paymentAmount,
      'Status Pembayaran': paymentLabel,
      'Status Verifikasi': statusLabel,
      'Tanggal Pendaftaran': r.registrationDate ? new Date(r.registrationDate).toLocaleDateString('id-ID') : '-',
      'Kelengkapan Dokumen': docSummary.join(', ') || 'Belum Ada',
      'Catatan Panitia': r.adminNotes || r.rejectionReason || '-',
    };
  });

  // Create worksheet & workbook
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Set column widths
  worksheet['!cols'] = [
    { wch: 5 },  // No
    { wch: 18 }, // Kode
    { wch: 26 }, // Tim
    { wch: 12 }, // Kategori
    { wch: 30 }, // Asal
    { wch: 24 }, // Pelatih
    { wch: 18 }, // WA
    { wch: 22 }, // Email
    { wch: 14 }, // Pemain
    { wch: 14 }, // Official
    { wch: 20 }, // Biaya
    { wch: 22 }, // Bayar
    { wch: 24 }, // Status
    { wch: 18 }, // Tgl
    { wch: 32 }, // Dokumen
    { wch: 25 }, // Catatan
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Pendaftar');

  const catSuffix = categoryFilter !== 'ALL' ? `_${categoryFilter}` : '_SEMUA';
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `DATA_PENDAFTAR_${tournamentName.replace(/\s+/g, '_')}${catSuffix}_${timestamp}.xlsx`;

  XLSX.writeFile(workbook, filename);
}

export async function exportRegistrationsToPdf(
  registrations: RegistrationItem[],
  tournamentName: string = 'WABUP CUP 2026',
  categoryFilter: string = 'ALL'
) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Title & Background
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Title Text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`REKAPITULASI DATA PENDAFTAR - ${tournamentName.toUpperCase()}`, 14, 12);

  // Subtitle
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // slate-300
  const exportDate = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const filterLabel = categoryFilter === 'ALL' ? 'Semua Kategori' : `Kategori ${categoryFilter}`;
  doc.text(`Filter: ${filterLabel} | Total Data: ${registrations.length} Tim | Dicetak pada: ${exportDate}`, 14, 20);

  // Prepare table headers & rows
  const tableHeaders = [
    ['No', 'Kode', 'Nama Tim', 'Kategori', 'Asal Instansi/Sekolah', 'Pelatih / WA', 'Pemain', 'Biaya (Rp)', 'Bayar', 'Status'],
  ];

  const tableRows = registrations.map((r, i) => [
    i + 1,
    r.regCode,
    r.teamName,
    r.category,
    r.institutionName,
    `${r.coachName}\n${r.coachPhone}`,
    `${r.playerCount} Pemain\n${r.officialCount} Official`,
    r.paymentAmount.toLocaleString('id-ID'),
    r.paymentStatus === 'PAID' ? 'LUNAS' : r.paymentStatus === 'VERIFYING' ? 'MENUNGGU' : 'BELUM',
    r.status === 'APPROVED' ? 'DISETUJUI' : r.status === 'REJECTED' ? 'DITOLAK' : 'MENUNGGU',
  ]);

  // Generate Table using jspdf-autotable
  autoTable(doc, {
    head: tableHeaders,
    body: tableRows,
    startY: 32,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59], // slate-800
      lineColor: [226, 232, 240], // slate-200
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [220, 38, 38], // red-600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },  // No
      1: { fontStyle: 'bold', halign: 'center', cellWidth: 26 }, // Kode
      2: { fontStyle: 'bold', cellWidth: 42 }, // Nama Tim
      3: { halign: 'center', cellWidth: 20 }, // Kategori
      4: { cellWidth: 50 }, // Instansi
      5: { cellWidth: 38 }, // Pelatih & WA
      6: { halign: 'center', cellWidth: 24 }, // Pemain
      7: { halign: 'right', cellWidth: 24 },  // Biaya
      8: { halign: 'center', cellWidth: 20 }, // Bayar
      9: { halign: 'center', cellWidth: 22 }, // Status
    },
    didDrawPage: (data) => {
      // Footer page numbering
      const str = `Halaman ${data.pageNumber} | Sistem Manajemen Turnamen Wabup Cup 2026`;
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(str, 14, doc.internal.pageSize.getHeight() - 8);
    },
  });

  const catSuffix = categoryFilter !== 'ALL' ? `_${categoryFilter}` : '_SEMUA';
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `DATA_PENDAFTAR_${tournamentName.replace(/\s+/g, '_')}${catSuffix}_${timestamp}.pdf`;

  doc.save(filename);
}
