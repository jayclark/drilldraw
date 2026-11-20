// PNG/PDF export of the live drill SVG. Elements marked data-export="skip"
// (selection, cursors, drafts) are removed from the copy.

export interface DrillInfo {
  name: string;
  description: string;
  coachingPoints: string;
}

const PX_WIDTH = 2400;

function fileBase(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "drill";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A standalone copy of the drill SVG with a white background and no UI overlays. */
export function cleanSvg(svg: SVGSVGElement): {
  clone: SVGSVGElement;
  width: number;
  height: number;
} {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export="skip"]').forEach((n) => n.remove());
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const [x, y, w, h] = (clone.getAttribute("viewBox") ?? "0 0 100 100")
    .split(/\s+/)
    .map(Number) as [number, number, number, number];
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", String(x));
  bg.setAttribute("y", String(y));
  bg.setAttribute("width", String(w));
  bg.setAttribute("height", String(h));
  bg.setAttribute("fill", "#ffffff");
  clone.insertBefore(bg, clone.firstChild);
  const width = PX_WIDTH;
  const height = Math.round((PX_WIDTH * h) / w);
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return { clone, width, height };
}

export async function renderPng(svg: SVGSVGElement): Promise<Blob> {
  const { clone, width, height } = cleanSvg(svg);
  const data = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
      "image/png",
    ),
  );
}

export async function downloadPng(svg: SVGSVGElement, info: DrillInfo) {
  download(await renderPng(svg), `${fileBase(info.name)}.png`);
}

export async function downloadPdf(svg: SVGSVGElement, info: DrillInfo) {
  // Loaded on demand: these libraries are large and only needed for PDF export.
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([
    import("jspdf"),
    import("svg2pdf.js"),
  ]);
  const { clone, width, height } = cleanSvg(svg);
  const landscape = width >= height;
  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "pt",
    format: "letter",
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(info.name.trim() || "Untitled drill", margin, margin + 14);

  // svg2pdf measures text and styles, so the copy must be in the document while it renders.
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;";
  host.appendChild(clone);
  document.body.appendChild(host);
  let y = margin + 32;
  try {
    const maxImgH = landscape ? pageH * 0.55 : pageH * 0.6;
    const scale = Math.min(contentW / width, maxImgH / height);
    const w = width * scale;
    const h = height * scale;
    await svg2pdf(clone, pdf, {
      x: margin + (contentW - w) / 2,
      y,
      width: w,
      height: h,
    });
    y += h + 24;
  } finally {
    host.remove();
  }

  const section = (title: string, body: string[]) => {
    if (body.length === 0) return;
    if (y > pageH - margin - 40) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(title, margin, y);
    y += 16;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    for (const line of body) {
      for (const wrapped of pdf.splitTextToSize(line, contentW) as string[]) {
        if (y > pageH - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.text(wrapped, margin, y);
        y += 14;
      }
    }
    y += 10;
  };

  const description = info.description.trim();
  section("Description", description ? description.split("\n") : []);
  const points = info.coachingPoints
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `•  ${l}`);
  section("Coaching points", points);

  pdf.save(`${fileBase(info.name)}.pdf`);
}
