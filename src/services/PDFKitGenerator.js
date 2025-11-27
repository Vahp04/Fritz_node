import PDFDocument from 'pdfkit';

class PDFKitGenerator {
  static async generatePDF(htmlContent, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        console.log('Generando PDF...', { 
          hasHtmlContent: !!htmlContent, 
          hasData: !!options.data,
          templateType: options.templateType || 'default'
        });
        
        const doc = new PDFDocument({
          margin: options.margin || 13,
          size: options.format || 'Letter',
          bufferPages: true,
          layout: options.landscape ? 'landscape' : 'portrait'
        });
        
        const chunks = [];
        
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => {
          console.log('PDF generado exitosamente');
          resolve(Buffer.concat(chunks));
        });
        doc.on('error', (error) => {
          console.error('Error generando PDF:', error);
          reject(error);
        });

        // **DECISIÓN CLAVE**: ¿Qué tipo de reporte generar?
        if (options.templateType === 'individual') {
          console.log('Generando reporte INDIVIDUAL');
          this.generateIndividualReport(doc, options.data);
        } else {
          console.log('Generando reporte GENERAL');
          this.generateGeneralReport(doc, options.data);
        }
        
        doc.end();
        
      } catch (error) {
        console.error('Error en PDFKit:', error);
        reject(error);
      }
    });
  }

  // **MÉTODO PARA REPORTE GENERAL** (el que ya tienes)
  static generateGeneralReport(doc, data) {
    const margin = 50;
    const pageWidth = 500;
    let yPosition = margin;

    // Logo
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

    // Línea separadora
    doc.moveTo(margin, yPosition)
       .lineTo(margin + pageWidth, yPosition)
       .lineWidth(2)
       .strokeColor('#DC2626')
       .stroke();
    
    yPosition += 20;

    // Información general
    doc.rect(margin, yPosition, pageWidth, 60)
       .fillColor('#f5f5f5')
       .fill();
    
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

    // Tabla de usuarios (mantener tu lógica actual)
    if (data.usuarios && data.usuarios.length > 0) {
      // Título de la tabla
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#000000')
         .text('LISTA DE USUARIOS', margin, yPosition);
      
      yPosition += 20;

      const headers = ['Usuario', 'Cargo', 'Correo', 'RDP', 'Sede', 'Depto', 'Total', 'Activos', 'Estado'];
      const colWidths = [73, 48, 120, 75, 50, 44, 22, 22, 50];
      
      doc.rect(margin, yPosition, pageWidth, 15)
         .fillColor('#DC2626')
         .fill();
      
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

      doc.fontSize(7)
         .font('Helvetica')
         .fillColor('#000000');

      data.usuarios.forEach((usuario, index) => {
        if (yPosition > 700) {
          doc.addPage();
          yPosition = margin;
        }

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
          (usuario.departamento?.nombre || 'N/A').substring(0, 22),
          (usuario.equipos_totales_count || 0).toString(),
          (usuario.equipos_activos_count || 0).toString(),
          this.getEstadoText(usuario.equipos_activos_count || 0, usuario.equipos_totales_count || 0)
        ];

        let x = margin;
        rowData.forEach((text, i) => {
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

        doc.moveTo(margin, yPosition)
           .lineTo(margin + pageWidth, yPosition)
           .lineWidth(0.8)
           .strokeColor('#cccccc')
           .stroke();
        
        yPosition += 3;
      });
    } else {
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

    // Pie de página
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

  // **NUEVO MÉTODO PARA REPORTE INDIVIDUAL**
  static generateIndividualReport(doc, data) {
    const { usuario, titulo, fecha, estadisticas } = data;
    const margin = 30;
    let yPosition = margin;
    const pageWidth = doc.page.width - (margin * 2);

    // Encabezado
    this.drawTextLogo(doc, margin, yPosition);
    
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text('FRITZ C.A', margin, yPosition, { align: 'center' });
    
    yPosition += 25;

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text(titulo || 'Reporte Individual de Usuario', margin, yPosition, { align: 'center' });
    
    yPosition += 20;

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#666666')
       .text(`Generado el: ${fecha || new Date().toLocaleString('es-ES')}`, margin, yPosition, { align: 'center' });
    
    yPosition += 30;

    // Línea separadora
    doc.moveTo(margin, yPosition)
       .lineTo(margin + pageWidth, yPosition)
       .lineWidth(2)
       .strokeColor('#DC2626')
       .stroke();
    
    yPosition += 20;

    // Información del usuario
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('INFORMACIÓN PERSONAL', margin, yPosition);
    
    yPosition += 25;

    // Fondo para información
    const infoHeight = 100;
    doc.rect(margin, yPosition, pageWidth, infoHeight)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(margin, yPosition, pageWidth, infoHeight)
       .strokeColor('#DC2626')
       .lineWidth(1)
       .stroke();

    // Datos del usuario en dos columnas
    const col1X = margin + 15;
    const col2X = margin + (pageWidth / 2) + 10;
    let infoY = yPosition + 15;

    // Columna 1
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('ID de Usuario:', col1X, infoY);
    doc.font('Helvetica')
       .fillColor('#666666')
       .text(usuario.id.toString(), col1X + 80, infoY);

    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Nombre Completo:', col1X, infoY + 15);
    doc.font('Helvetica')
       .fillColor('#666666')
       .text(`${usuario.nombre} ${usuario.apellido}`, col1X + 80, infoY + 15);

    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Cargo:', col1X, infoY + 30);
    doc.font('Helvetica')
       .fillColor('#666666')
       .text(usuario.cargo || 'No especificado', col1X + 80, infoY + 30);

    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Correo:', col1X, infoY + 45);
    doc.font('Helvetica')
       .fillColor('#666666')
       .text(usuario.correo || 'No especificado', col1X + 80, infoY + 45);

    // Columna 2
    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text('RDP Fiscal:', col2X, infoY);
    doc.font('Helvetica')
       .fillColor('#666666')
       .text(usuario.rdpfis || 'No asignado', col2X + 60, infoY);

    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text('RDP Financiero:', col2X, infoY + 15);
    doc.font('Helvetica')
       .fillColor('#666666')
       .text(usuario.rdpfin || 'No asignado', col2X + 60, infoY + 15);

    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Sede:', col2X, infoY + 30);
    doc.font('Helvetica')
       .fillColor('#666666')
       .text(usuario.sede?.nombre || 'No asignada', col2X + 60, infoY + 30);

    doc.font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Departamento:', col2X, infoY + 45);
    doc.font('Helvetica')
       .fillColor('#666666')
       .text(usuario.departamento?.nombre || 'No asignado', col2X + 60, infoY + 45);

    yPosition += infoHeight + 20;

    // Descripción si existe
    if (usuario.descripcion) {
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor('#333333')
         .text('MÓDULOS Y DESCRIPCIÓN:', margin, yPosition);
      
      yPosition += 20;

      doc.rect(margin, yPosition, pageWidth, 40)
         .fillColor('#ffffff')
         .strokeColor('#dee2e6')
         .lineWidth(1)
         .fillAndStroke();
      
      doc.fontSize(9)
         .font('Helvetica')
         .fillColor('#666666')
         .text(usuario.descripcion, margin + 10, yPosition + 10, {
           width: pageWidth - 20,
           align: 'left'
         });
      
      yPosition += 50;
    }

    // Estadísticas de equipos
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('RESUMEN DE EQUIPOS ASIGNADOS', margin, yPosition);
    
    yPosition += 25;

    const statsWidth = pageWidth;
    const statItemWidth = statsWidth / 3;
    const statsY = yPosition;

    // Total Equipos
    doc.rect(margin, statsY, statItemWidth - 5, 50)
       .fillColor('#e9ecef')
       .fill();
    
    doc.rect(margin, statsY, statItemWidth - 5, 50)
       .strokeColor('#dee2e6')
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text(estadisticas.totales.toString(), margin, statsY + 10, { 
         width: statItemWidth - 5, 
         align: 'center' 
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Total Equipos', margin, statsY + 30, { 
         width: statItemWidth - 5, 
         align: 'center' 
       });

    // Equipos Activos
    doc.rect(margin + statItemWidth, statsY, statItemWidth - 5, 50)
       .fillColor('#d4edda')
       .fill();
    
    doc.rect(margin + statItemWidth, statsY, statItemWidth - 5, 50)
       .strokeColor('#c3e6cb')
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#155724')
       .text(estadisticas.activos.toString(), margin + statItemWidth, statsY + 10, { 
         width: statItemWidth - 5, 
         align: 'center' 
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#155724')
       .text('Equipos Activos', margin + statItemWidth, statsY + 30, { 
         width: statItemWidth - 5, 
         align: 'center' 
       });

    // Equipos Devueltos
    doc.rect(margin + (statItemWidth * 2), statsY, statItemWidth - 5, 50)
       .fillColor('#fff3cd')
       .fill();
    
    doc.rect(margin + (statItemWidth * 2), statsY, statItemWidth - 5, 50)
       .strokeColor('#ffeaa7')
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#856404')
       .text(estadisticas.devueltos.toString(), margin + (statItemWidth * 2), statsY + 10, { 
         width: statItemWidth - 5, 
         align: 'center' 
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#856404')
       .text('Equipos Devueltos', margin + (statItemWidth * 2), statsY + 30, { 
         width: statItemWidth - 5, 
         align: 'center' 
       });

    yPosition += 80;

    // Firmas
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('FIRMAS', margin, yPosition);
    
    yPosition += 20;

    const firmaWidth = pageWidth / 2;
    const firma1X = margin;
    const firma2X = margin + firmaWidth;

    // Firma Usuario
    doc.rect(firma1X, yPosition, firmaWidth - 10, 60)
       .strokeColor('#cccccc')
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text(usuario.nombre + ' ' + usuario.apellido, firma1X, yPosition + 40, {
         width: firmaWidth - 10,
         align: 'center'
       });
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Usuario', firma1X, yPosition + 52, {
         width: firmaWidth - 10,
         align: 'center'
       });

    // Firma Departamento de Tecnología
    doc.rect(firma2X, yPosition, firmaWidth - 10, 60)
       .strokeColor('#cccccc')
       .lineWidth(1)
       .stroke();
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Departamento de Tecnología', firma2X, yPosition + 30, {
         width: firmaWidth - 10,
         align: 'center'
       });
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('FRITZ C.A', firma2X, yPosition + 45, {
         width: firmaWidth - 10,
         align: 'center'
       });

    // Pie de página
    const footerY = doc.page.height - 40;
    doc.moveTo(margin, footerY)
       .lineTo(margin + pageWidth, footerY)
       .lineWidth(1)
       .strokeColor('#cccccc')
       .stroke();
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('FRITZ C.A - Sistema de Gestión de Usuarios', margin, footerY + 10, { align: 'center' });
  }

  // Métodos auxiliares (mantener los que ya tienes)
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
      return '#155724';
    } else if (total > 0) {
      return '#856404';
    } else {
      return '#495057';
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