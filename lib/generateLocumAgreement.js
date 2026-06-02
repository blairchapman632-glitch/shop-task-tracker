// Locum Agreement PDF generator using pdf-lib

export async function generateLocumAgreement({ locum, bookings }) {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const MARGIN = 50;
  const CONTENT_W = width - MARGIN * 2;
  const BRAND = rgb(0.12, 0.47, 0.71);
  const BLACK = rgb(0.12, 0.12, 0.12);
  const GRAY = rgb(0.4, 0.4, 0.4);

  const today = new Date().toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric"
  });

  const fmtTime = (t) => {
    if (!t) return "";
    const [h, m] = String(t).split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const hour = h % 12 || 12;
    return m === 0 ? `${hour}:00 ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  const fmtBookingDate = (b) => {
    const d = new Date(b.shift_date + "T00:00:00");
    const dayName = d.toLocaleDateString("en-AU", { weekday: "long" });
    const day = d.getDate();
    const month = d.toLocaleDateString("en-AU", { month: "long" });
    const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th";
    return `${dayName} ${month} ${day}${suffix}: ${fmtTime(b.start_time)} - ${fmtTime(b.end_time)}`;
  };

  // Try to embed logo
  try {
    const logoRes = await fetch("/byford-logo.png");
    if (logoRes.ok) {
      const logoBytes = await logoRes.arrayBuffer();
      const logoImg = await doc.embedPng(logoBytes);
      const logoDims = logoImg.scale(0.12);
      page.drawImage(logoImg, {
        x: width - MARGIN - logoDims.width,
        y: height - MARGIN - logoDims.height + 5,
        width: logoDims.width,
        height: logoDims.height,
      });
    }
  } catch (e) {}

  let y = height - MARGIN;

  // Helper: draw text and return new y
  const text = (str, { x = MARGIN, font = fontRegular, size = 10, color = BLACK, indent = 0 } = {}) => {
    page.drawText(str, { x: x + indent, y, font, size, color });
    y -= size + 4;
  };

  const gap = (n = 6) => { y -= n; };

  const wrapText = (str, maxWidth, font, size) => {
    const words = str.split(" ");
    const lines = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const textWrapped = (str, { font = fontRegular, size = 10, color = BLACK, indent = 0 } = {}) => {
    const lines = wrapText(str, CONTENT_W - indent, font, size);
    lines.forEach((line) => text(line, { font, size, color, indent }));
  };

  const sectionHeading = (title) => {
    gap(4);
    page.drawText(title, { x: MARGIN, y, font: fontBold, size: 11, color: BRAND });
    y -= 16;
  };

  // ── Title ──
  page.drawText("Locum Pharmacist Agreement", {
    x: MARGIN, y, font: fontBold, size: 16, color: BRAND,
  });
  y -= 28;

  // ── Intro ──
  text(`This agreement ("Agreement") is made and entered into on`);
  text(`${today} by and between:`);
  gap(6);
  text("Byford Pharmacy", { font: fontBold });
  text("Shop 8 837 South Western Highway Byford WA 6122");
  text('("The Pharmacy")', { color: GRAY });
  gap(6);
  text("and");
  gap(6);
  text(locum.name || "Locum Pharmacist", { font: fontBold });
  text('("The Locum Pharmacist")', { color: GRAY });
  gap(6);
  textWrapped(
    "The Pharmacy hereby agrees to engage the services of the Locum Pharmacist to provide professional pharmacist services, subject to the terms and conditions of this Agreement."
  );

  // ── Dates / Hours ──
  sectionHeading("Dates / Hours of Work");
  if (!bookings.length) {
    text("No bookings specified.");
  } else {
    bookings.forEach((b) => text(fmtBookingDate(b)));
  }

  // ── Remuneration ──
  sectionHeading("Remuneration");
  text("The Pharmacy agrees to pay the Locum Pharmacist");
  gap(2);
  const wd = locum.rate_weekday || 70;
  const sat = locum.rate_saturday || 75;
  const sun = locum.rate_sunday || 80;
  text(`Monday - Friday`, { indent: 30 });
  page.drawText(`$${wd}/hour + superannuation`, { x: MARGIN + 140, y: y + 14, font: fontRegular, size: 10, color: BLACK });
  text(`Saturday`, { indent: 30 });
  page.drawText(`$${sat}/hour + superannuation`, { x: MARGIN + 140, y: y + 14, font: fontRegular, size: 10, color: BLACK });
  text(`Sunday`, { indent: 30 });
  page.drawText(`$${sun}/hour + superannuation`, { x: MARGIN + 140, y: y + 14, font: fontRegular, size: 10, color: BLACK });

  // ── Warranty ──
  sectionHeading("Warranty of Registration, Skills and Professional Indemnity");
  textWrapped(
    "The Locum Pharmacist warrants that they are currently registered with the Australian Health Practitioner Regulation Agency (AHPRA) and possess the necessary skills and qualifications to perform the services under this Agreement. The Locum Pharmacist shall promptly notify the Pharmacy of any changes to their registration or skills that may affect their ability to perform the services. The Locum Pharmacist warrants that they hold valid and adequate professional indemnity insurance. A copy of this insurance must be provided to the Pharmacy upon signing this Agreement."
  );

  // ── Confidentiality ──
  sectionHeading("Confidentiality");
  textWrapped(
    "The Locum Pharmacist agrees to maintain the confidentiality of all patient records, pharmacy procedures, and other sensitive information obtained during the term of this Agreement."
  );

  // ── Signatures ──
  gap(12);
  page.drawText("Signatures", { x: MARGIN, y, font: fontRegular, size: 10, color: BLACK });
  y -= 24;

  const sigY = y;
  // Left sig line
  page.drawLine({ start: { x: MARGIN, y: sigY }, end: { x: MARGIN + 180, y: sigY }, thickness: 0.5, color: BLACK });
  page.drawText("Blair Chapman", { x: MARGIN, y: sigY - 14, font: fontRegular, size: 10, color: BLACK });
  page.drawText("Director", { x: MARGIN, y: sigY - 26, font: fontRegular, size: 10, color: BLACK });
  page.drawText("Byford Pharmacy Pty Ltd", { x: MARGIN, y: sigY - 38, font: fontRegular, size: 10, color: BLACK });
  page.drawText("Date: ______________________", { x: MARGIN, y: sigY - 54, font: fontRegular, size: 10, color: BLACK });

  // Right sig line
  const rx = width / 2 + 10;
  page.drawLine({ start: { x: rx, y: sigY }, end: { x: rx + 180, y: sigY }, thickness: 0.5, color: BLACK });
  page.drawText(locum.name || "Locum Pharmacist", { x: rx, y: sigY - 14, font: fontRegular, size: 10, color: BLACK });
  page.drawText("Locum Pharmacist", { x: rx, y: sigY - 26, font: fontRegular, size: 10, color: BLACK });
  page.drawText("Date: ______________________", { x: rx, y: sigY - 54, font: fontRegular, size: 10, color: BLACK });

  // ── Save ──
  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `locum_agreement_${(locum.name || "locum").replace(/\s+/g, "_").toLowerCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}