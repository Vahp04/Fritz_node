import PDFDocument from 'pdfkit';

class PDFKitGenerator {
  static async generatePDF(htmlContent, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        console.log('🚀 Generando PDF con PDFKit...');
        
        const doc = new PDFDocument({
          margin: 20,
          size: 'A4'
        });
        
        const chunks = [];
        
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          console.log('✅ PDF generado exitosamente con PDFKit');
          resolve(Buffer.concat(chunks));
        });
        doc.on('error', (error) => {
          console.error('❌ Error generando PDF con PDFKit:', error);
          reject(error);
        });

        // Procesar el HTML básico (puedes mejorar esto según tus necesidades)
        this.addContentToPDF(doc, htmlContent, options);
        
        doc.end();
        
      } catch (error) {
        console.error('❌ Error en PDFKit:', error);
        reject(error);
      }
    });
  }

  static addContentToPDF(doc, htmlContent, options) {
    // Configuración básica
    const title = options.title || 'Reporte';
    const margin = 50;
    let yPosition = margin;

    // Título
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .text(title, margin, yPosition, { align: 'center' });
    
    yPosition += 40;

    // Fecha
    doc.fontSize(10)
       .font('Helvetica')
       .text(`Generado el: ${new Date().toLocaleDateString()}`, margin, yPosition, { align: 'center' });
    
    yPosition += 30;

    // Procesar contenido HTML básico
    this.parseSimpleHTML(doc, htmlContent, margin, yPosition);
  }

  static parseSimpleHTML(doc, htmlContent, margin, startY) {
    let y = startY;
    const lineHeight = 15;
    const pageHeight = 700;

    // Remover etiquetas HTML básicas y extraer texto
    const textContent = htmlContent
      .replace(/<[^>]*>/g, ' ') // Remover etiquetas HTML
      .replace(/\s+/g, ' ')     // Normalizar espacios
      .trim();

    // Dividir en párrafos
    const paragraphs = textContent.split(/\n/).filter(p => p.trim());

    doc.fontSize(12).font('Helvetica');

    for (const paragraph of paragraphs) {
      // Verificar si necesitamos nueva página
      if (y > pageHeight) {
        doc.addPage();
        y = margin;
      }

      const lines = doc.text(paragraph, margin, y, {
        width: 500,
        align: 'left',
        lineGap: 5
      });

      y += lines.length * lineHeight + 10;
    }
  }

  // Método para generar tablas básicas
  static addTable(doc, data, headers, startY) {
    const margin = 50;
    const rowHeight = 20;
    const colWidth = 100;
    let y = startY;

    // Encabezados
    doc.font('Helvetica-Bold');
    headers.forEach((header, i) => {
      doc.text(header, margin + (i * colWidth), y);
    });

    y += rowHeight;
    doc.font('Helvetica');

    // Datos
    data.forEach(row => {
      headers.forEach((header, i) => {
        doc.text(row[header] || '', margin + (i * colWidth), y);
      });
      y += rowHeight;
    });

    return y;
  }
}

export default PDFKitGenerator;