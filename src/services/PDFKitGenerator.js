import PDFDocument from 'pdfkit';

class PDFKitGenerator {
  static async generatePDF(htmlContent, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        console.log('Generando PDF con diseño similar a HTML...');
        
        const doc = new PDFDocument({
          margin: 13,
          size: 'Letter',
          bufferPages: true
        });
        
        const chunks = [];
        
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          console.log('PDF generado exitosamente con PDFKit');
          resolve(Buffer.concat(chunks));
        });
        doc.on('error', (error) => {
          console.error('Error generando PDF con PDFKit:', error);
          reject(error);
        });

        // Procesar los datos para crear un diseño similar
        this.generateStyledPDF(doc, options.data || {});
        
        doc.end();
        
      } catch (error) {
        console.error('Error en PDFKit:', error);
        reject(error);
      }
    });
  }

  static generateStyledPDF(doc, data) {
    const margin = 50;
    const pageWidth = 500;
    let yPosition = margin;

      if (data.logoBase64) {
    try {
      const logoBuffer = Buffer.from(data.logoBase64, 'base64');
      doc.image(logoBuffer, margin, yPosition, { 
        width: 70, 
        height: 50
      });
      console.log('Logo cargado desde Base64');
    } catch (error) {
      console.log('Error cargando logo Base64:', error.message);
      this.drawTextLogo(doc, margin, yPosition);
    }
  } else {
    this.drawTextLogo(doc, margin, yPosition);
  }

    // Título principal
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text('FRITZ C.A', margin, yPosition, { align: 'center' });
    
    yPosition += 25;

    // Subtítulo
    doc.fontSize(12)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Reporte de Usuarios', margin, yPosition, { align: 'center' });
    
    yPosition += 30;

    // Línea separadora (simulando border-bottom)
    doc.moveTo(margin, yPosition)
       .lineTo(margin + pageWidth, yPosition)
       .lineWidth(2)
       .strokeColor('#DC2626')
       .stroke();
    
    yPosition += 20;

    // ===== INFORMACIÓN GENERAL =====
    // Fondo gris para la sección de información
    doc.rect(margin, yPosition, pageWidth, 60)
       .fillColor('#f5f5f5')
       .fill();
    
    // Texto de información
    doc.fillColor('#333333');
    
    // Fecha de generación
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .text('Fecha de generación:', margin + 10, yPosition + 10);
    doc.font('Helvetica')
       .text(data.fechaGeneracion || new Date().toLocaleString('es-ES'), margin + 200, yPosition + 10);
    
    // Total de usuarios
    doc.font('Helvetica-Bold')
       .text('Total de usuarios:', margin + 10, yPosition + 25);
    doc.font('Helvetica')
       .text(data.totalUsuarios?.toString() || '0', margin + 200, yPosition + 25);
    
    // Usuarios con equipos activos
    doc.font('Helvetica-Bold')
       .text('Usuarios con equipos activos:', margin + 10, yPosition + 40);
    doc.font('Helvetica')
       .text(data.totalConEquipos?.toString() || '0', margin + 200, yPosition + 40);
    
    yPosition += 70;

    // ===== TABLA DE USUARIOS =====
    if (data.usuarios && data.usuarios.length > 0) {
      // Título de la tabla
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text('LISTA DE USUARIOS', margin, yPosition);
      
      yPosition += 20;

      // Encabezados de la tabla
      const headers = ['Usuario', 'Cargo', 'Correo', 'RDP', 'Sede', 'Depto', 'Total', 'Activos', 'Estado'];
      const colWidths = [73, 48, 120, 75, 50, 41, 25, 25, 50];
      
      // Fondo rojo para encabezados
      doc.rect(margin, yPosition, pageWidth, 15)
         .fillColor('#DC2626')
         .fill();
      
      // Texto de encabezados en blanco
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('#ffffff');
      
      let x = margin;
      headers.forEach((header, i) => {
        doc.text(header, x + 2, yPosition + 4, {
          width: colWidths[i],
          align: 'left'
        });
        x += colWidths[i];
      });
      
      yPosition += 20;

      // Datos de usuarios
      doc.fontSize(7)
         .font('Helvetica')
         .fillColor('#000000');

      data.usuarios.forEach((usuario, index) => {
        // Verificar si necesitamos nueva página
        if (yPosition > 700) {
          doc.addPage();
          yPosition = margin;
        }

        // Fondo alternado para filas
        if (index % 2 === 0) {
          doc.rect(margin, yPosition, pageWidth, 12)
             .fillColor('#f9f9f9')
             .fill();
        }

        const rowData = [
          `${usuario.nombre || ''} ${usuario.apellido || ''}`.substring(0, 22),
          (usuario.cargo || '').substring(0, 12),
          (usuario.correo || '').substring(0, 40),
          `${usuario.rdpfin || ''}`.substring(0, 25),
          (usuario.sede?.nombre || 'N/A').substring(0, 12),
          (usuario.departamento?.nombre || 'N/A').substring(0, 20),
          (usuario.equipos_totales_count || 0).toString(),
          (usuario.equipos_activos_count || 0).toString(),
          this.getEstadoText(usuario.equipos_activos_count || 0, usuario.equipos_totales_count || 0)
        ];

        let x = margin;
        rowData.forEach((text, i) => {
          // Para la columna de estado, aplicar colores
          if (i === 8) {
            const estadoColor = this.getEstadoColor(usuario.equipos_activos_count || 0, usuario.equipos_totales_count || 0);
            doc.fillColor(estadoColor);
          } else {
            doc.fillColor('#000000');
          }
          
          doc.text(text, x + 2, yPosition + 2, {
            width: colWidths[i] - 4,
            align: i >= 6 ? 'center' : 'left'
          });
          x += colWidths[i];
        });

        yPosition += 15;

        // Línea separadora entre filas
        doc.moveTo(margin, yPosition)
           .lineTo(margin + pageWidth, yPosition)
           .lineWidth(1.5)
           .strokeColor('#cccccc')
           .stroke();
        
        yPosition += 3;
      });
    } else {
      // Mensaje cuando no hay datos
      yPosition += 20;
      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor('#666666')
         .text('No hay usuarios registrados', margin, yPosition, { align: 'center' });
      
      yPosition += 20;
      doc.fontSize(10)
         .font('Helvetica')
         .text('No se encontraron usuarios en el sistema.', margin, yPosition, { align: 'center' });
    }

    // ===== PIE DE PÁGINA =====
    yPosition = 700;
    doc.moveTo(margin, yPosition)
       .lineTo(margin + pageWidth, yPosition)
       .lineWidth(1)
       .strokeColor('#cccccc')
       .stroke();
    
    yPosition += 10;
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Sistema de Gestión de Equipos - FRITZ C.A', margin, yPosition, { align: 'center' });
    
    yPosition += 10;
    doc.text(`Generado el: ${data.fechaGeneracion || new Date().toLocaleString('es-ES')}`, margin, yPosition, { align: 'center' });
  }

  static getEstadoText(activos, total) {
    if (activos > 0) {
      return 'Con equipos';
    } else if (total > 0) {
      return 'Solo devueltos';
    } else {
      return 'Sin equipos';
    }
  }

  static getEstadoColor(activos, total) {
    if (activos > 0) {
      return '#155724'; // Verde oscuro (success)
    } else if (total > 0) {
      return '#856404'; // Amarillo oscuro (warning)
    } else {
      return '#495057'; // Gris (secondary)
    }
  }

  static drawTextLogo(doc, x, y) {
  doc.fontSize(10)
     .font('Helvetica-Bold')
     .fillColor('#DC2626')
     .text('FRITZ C.A', x, y + 15);
}
}

export default PDFKitGenerator;