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

// **MÉTODO PARA REPORTE INDIVIDUAL** - Diseño de dos columnas idénticas
static generateIndividualReport(doc, data) {
    const { usuario, titulo, fecha, estadisticas } = data;
    const margin = 20;
    let yPosition = margin;
    const pageWidth = doc.page.width - (margin * 2);
    const columnWidth = (pageWidth - 15) / 2; // 15px de separación entre columnas

    // **PRIMERA COLUMNA** (izquierda)
    let colX = margin;
    let colY = yPosition;

    // Encabezado columna 1
    doc.rect(colX, colY, columnWidth, 30)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, 25)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text('FRITZ C.A', colX, colY + 5, { 
         width: columnWidth, 
         align: 'center' 
       });
    
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#666666')
       .text(titulo || 'Reporte Individual de Usuario', colX, colY + 20, { 
         width: columnWidth, 
         align: 'center' 
       });

    colY += 30;

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#000000')
       .text(`Generado el: ${fecha || new Date().toLocaleString('es-ES')}`, colX, colY, { 
         width: columnWidth, 
         align: 'center' 
       });

    colY += 20;

    // Línea separadora
    doc.moveTo(colX, colY)
       .lineTo(colX + columnWidth, colY)
       .lineWidth(1)
       .strokeColor('#000000')
       .stroke();
    
    colY += 15;

    // Información del usuario - Columna 1
    doc.rect(colX, colY, columnWidth, 25)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, 25)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Información Personal del Usuario', colX + 10, colY + 8);

    colY += 30;

    // Contenedor principal de información
    const infoHeight = 120;
    doc.rect(colX, colY, columnWidth, infoHeight)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, infoHeight)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    let infoY = colY + 10;
    const infoItemHeight = 14;

    // Datos del usuario - Columna 1
    const userInfo = [
        { label: 'ID de Usuario:', value: usuario.id.toString() },
        { label: 'Nombre Completo:', value: `${usuario.nombre} ${usuario.apellido}` },
        { label: 'Cargo:', value: usuario.cargo || 'No especificado' },
        { label: 'Correo Electrónico:', value: usuario.correo || 'No especificado' },
        { label: 'RDP Fiscal:', value: usuario.rdpfis || 'No asignado' },
        { label: 'RDP Financiero:', value: usuario.rdpfin || 'No asignado' },
        { label: 'Sede:', value: usuario.sede?.nombre || 'No asignada' },
        { label: 'Departamento:', value: usuario.departamento?.nombre || 'No asignado' }
    ];

    userInfo.forEach((info, index) => {
        const currentY = infoY + (index * infoItemHeight);
        
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text(info.label, colX + 20, currentY);
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text(info.value, colX + 70, currentY, {
             width: columnWidth - 80,
             align: 'left'
           });

        // Línea punteada entre items
        if (index < userInfo.length - 1) {
            doc.moveTo(colX + 10, currentY + 10)
               .lineTo(colX + columnWidth - 10, currentY + 10)
               .lineWidth(0.5)
               .strokeColor('#cccccc')
               .dash(2, { space: 2 })
               .stroke()
               .undash();
        }
    });

    colY += infoHeight + 15;

    // Descripción si existe - Columna 1
    if (usuario.descripcion) {
        const descHeight = 40;
        doc.rect(colX, colY, columnWidth, descHeight)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.rect(colX, colY, colX + columnWidth, colY + descHeight)
           .strokeColor('#dee2e6')
           .lineWidth(1)
           .stroke();

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Módulos y Descripción:', colX + 10, colY + 5);
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text(usuario.descripcion, colX + 10, colY + 15, {
             width: columnWidth - 20,
             align: 'left'
           });

        colY += descHeight + 15;
    }

    // Resumen de equipos - Columna 1
    doc.rect(colX, colY, columnWidth, 25)
       .fillColor('#e9ecef')
       .fill();
    
    doc.rect(colX, colY, columnWidth, 25)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Resumen de Equipos Asignados', colX + 10, colY + 8);

    colY += 30;

    // Estadísticas de equipos - Columna 1
    const statsHeight = 50;
    const statWidth = (columnWidth - 20) / 3;
    
    // Total Equipos
    doc.rect(colX + 5, colY, statWidth, statsHeight)
       .fillColor('#ffffff')
       .strokeColor('#dddddd')
       .lineWidth(1)
       .fillAndStroke();
    
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text(estadisticas.totales.toString(), colX + 5, colY + 10, {
         width: statWidth,
         align: 'center'
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Total Equipos', colX + 5, colY + 30, {
         width: statWidth,
         align: 'center'
       });

    // Equipos Activos
    doc.rect(colX + 10 + statWidth, colY, statWidth, statsHeight)
       .fillColor('#ffffff')
       .strokeColor('#dddddd')
       .lineWidth(1)
       .fillAndStroke();
    
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text(estadisticas.activos.toString(), colX + 10 + statWidth, colY + 10, {
         width: statWidth,
         align: 'center'
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Equipos Activos', colX + 10 + statWidth, colY + 30, {
         width: statWidth,
         align: 'center'
       });

    // Equipos Devueltos
    doc.rect(colX + 15 + (statWidth * 2), colY, statWidth, statsHeight)
       .fillColor('#ffffff')
       .strokeColor('#dddddd')
       .lineWidth(1)
       .fillAndStroke();
    
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text(estadisticas.devueltos.toString(), colX + 15 + (statWidth * 2), colY + 10, {
         width: statWidth,
         align: 'center'
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Equipos Devueltos', colX + 15 + (statWidth * 2), colY + 30, {
         width: statWidth,
         align: 'center'
       });

    colY += statsHeight + 20;

    // Firmas - Columna 1
    const firmaHeight = 60;
    const firmaWidth = (columnWidth - 20) / 2;

    // Firma Usuario
    doc.rect(colX + 5, colY, firmaWidth, firmaHeight)
       .strokeColor('#cccccc')
       .lineWidth(1)
       .stroke();
    
    // Línea de firma
    doc.moveTo(colX + 15, colY + 40)
       .lineTo(colX + firmaWidth - 5, colY + 40)
       .lineWidth(1)
       .strokeColor('#333333')
       .stroke();
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text(`${usuario.nombre} ${usuario.apellido}`, colX + 5, colY + 45, {
         width: firmaWidth,
         align: 'center'
       });
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Usuario', colX + 5, colY + 55, {
         width: firmaWidth,
         align: 'center'
       });

    // Firma Tecnología
    doc.rect(colX + 10 + firmaWidth, colY, firmaWidth, firmaHeight)
       .strokeColor('#cccccc')
       .lineWidth(1)
       .stroke();
    
    // Línea de firma
    doc.moveTo(colX + 20 + firmaWidth, colY + 40)
       .lineTo(colX + (firmaWidth * 2) + 5, colY + 40)
       .lineWidth(1)
       .strokeColor('#333333')
       .stroke();
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Departamento de Tecnología', colX + 10 + firmaWidth, colY + 45, {
         width: firmaWidth,
         align: 'center'
       });
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('FRITZ C.A', colX + 10 + firmaWidth, colY + 55, {
         width: firmaWidth,
         align: 'center'
       });

    colY += firmaHeight + 15;

    // Footer - Columna 1
    doc.moveTo(colX, colY)
       .lineTo(colX + columnWidth, colY)
       .lineWidth(1)
       .strokeColor('#dddddd')
       .stroke();
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('FRITZ C.A - Sistema de Gestión de Usuarios', colX, colY + 10, {
         width: columnWidth,
         align: 'center'
       });

    // **SEGUNDA COLUMNA** (derecha) - CONTENIDO IDÉNTICO
    colX = margin + columnWidth + 15;
    colY = yPosition;

    // Encabezado columna 2 (idéntico a columna 1)
    doc.rect(colX, colY, columnWidth, 25)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, 25)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text('FRITZ C.A', colX, colY + 5, { 
         width: columnWidth, 
         align: 'center' 
       });
    
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .fillColor('#666666')
       .text(titulo || 'Reporte Individual de Usuario', colX, colY + 20, { 
         width: columnWidth, 
         align: 'center' 
       });

    colY += 30;

    doc.fontSize(10)
       .font('Helvetica')
       .fillColor('#000000')
       .text(`Generado el: ${fecha || new Date().toLocaleString('es-ES')}`, colX, colY, { 
         width: columnWidth, 
         align: 'center' 
       });

    colY += 20;

    // Línea separadora
    doc.moveTo(colX, colY)
       .lineTo(colX + columnWidth, colY)
       .lineWidth(1)
       .strokeColor('#000000')
       .stroke();
    
    colY += 15;

    // Información del usuario - Columna 2 (idéntica a columna 1)
    doc.rect(colX, colY, columnWidth, 25)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, 25)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Información Personal del Usuario', colX + 10, colY + 8);

    colY += 30;

    // Contenedor principal de información - Columna 2
    doc.rect(colX, colY, columnWidth, infoHeight)
       .fillColor('#f8f9fa')
       .fill();
    
    doc.rect(colX, colY, columnWidth, infoHeight)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    infoY = colY + 10;

    // Datos del usuario - Columna 2 (mismos datos)
    userInfo.forEach((info, index) => {
        const currentY = infoY + (index * infoItemHeight);
        
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text(info.label, colX + 10, currentY);
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text(info.value, colX + 70, currentY, {
             width: columnWidth - 80,
             align: 'left'
           });

        // Línea punteada entre items
        if (index < userInfo.length - 1) {
            doc.moveTo(colX + 10, currentY + 10)
               .lineTo(colX + columnWidth - 10, currentY + 10)
               .lineWidth(0.5)
               .strokeColor('#cccccc')
               .dash(2, { space: 2 })
               .stroke()
               .undash();
        }
    });

    colY += infoHeight + 15;

    // Descripción si existe - Columna 2
    if (usuario.descripcion) {
        const descHeight = 40;
        doc.rect(colX, colY, columnWidth, descHeight)
           .fillColor('#f8f9fa')
           .fill();
        
        doc.rect(colX, colY, colX + columnWidth, colY + descHeight)
           .strokeColor('#dee2e6')
           .lineWidth(1)
           .stroke();

        doc.fontSize(9)
           .font('Helvetica-Bold')
           .fillColor('#333333')
           .text('Módulos y Descripción:', colX + 10, colY + 5);
        
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('#666666')
           .text(usuario.descripcion, colX + 10, colY + 15, {
             width: columnWidth - 20,
             align: 'left'
           });

        colY += descHeight + 15;
    }

    // Resumen de equipos - Columna 2
    doc.rect(colX, colY, columnWidth, 25)
       .fillColor('#e9ecef')
       .fill();
    
    doc.rect(colX, colY, columnWidth, 25)
       .strokeColor('#000000')
       .lineWidth(1)
       .stroke();

    doc.fontSize(11)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Resumen de Equipos Asignados', colX + 10, colY + 8);

    colY += 30;

    // Estadísticas de equipos - Columna 2 (idénticas)
    // Total Equipos
    doc.rect(colX + 5, colY, statWidth, statsHeight)
       .fillColor('#ffffff')
       .strokeColor('#dddddd')
       .lineWidth(1)
       .fillAndStroke();
    
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text(estadisticas.totales.toString(), colX + 5, colY + 10, {
         width: statWidth,
         align: 'center'
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Total Equipos', colX + 5, colY + 30, {
         width: statWidth,
         align: 'center'
       });

    // Equipos Activos
    doc.rect(colX + 10 + statWidth, colY, statWidth, statsHeight)
       .fillColor('#ffffff')
       .strokeColor('#dddddd')
       .lineWidth(1)
       .fillAndStroke();
    
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text(estadisticas.activos.toString(), colX + 10 + statWidth, colY + 10, {
         width: statWidth,
         align: 'center'
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Equipos Activos', colX + 10 + statWidth, colY + 30, {
         width: statWidth,
         align: 'center'
       });

    // Equipos Devueltos
    doc.rect(colX + 15 + (statWidth * 2), colY, statWidth, statsHeight)
       .fillColor('#ffffff')
       .strokeColor('#dddddd')
       .lineWidth(1)
       .fillAndStroke();
    
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .fillColor('#DC2626')
       .text(estadisticas.devueltos.toString(), colX + 15 + (statWidth * 2), colY + 10, {
         width: statWidth,
         align: 'center'
       });
    
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Equipos Devueltos', colX + 15 + (statWidth * 2), colY + 30, {
         width: statWidth,
         align: 'center'
       });

    colY += statsHeight + 20;

    // Firmas - Columna 2 (idénticas)
    // Firma Usuario
    doc.rect(colX + 5, colY, firmaWidth, firmaHeight)
       .strokeColor('#cccccc')
       .lineWidth(1)
       .stroke();
    
    // Línea de firma
    doc.moveTo(colX + 15, colY + 40)
       .lineTo(colX + firmaWidth - 5, colY + 40)
       .lineWidth(1)
       .strokeColor('#333333')
       .stroke();
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text(`${usuario.nombre} ${usuario.apellido}`, colX + 5, colY + 45, {
         width: firmaWidth,
         align: 'center'
       });
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('Usuario', colX + 5, colY + 55, {
         width: firmaWidth,
         align: 'center'
       });

    // Firma Tecnología
    doc.rect(colX + 10 + firmaWidth, colY, firmaWidth, firmaHeight)
       .strokeColor('#cccccc')
       .lineWidth(1)
       .stroke();
    
    // Línea de firma
    doc.moveTo(colX + 20 + firmaWidth, colY + 40)
       .lineTo(colX + (firmaWidth * 2) + 5, colY + 40)
       .lineWidth(1)
       .strokeColor('#333333')
       .stroke();
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .fillColor('#333333')
       .text('Departamento de Tecnología', colX + 10 + firmaWidth, colY + 45, {
         width: firmaWidth,
         align: 'center'
       });
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('FRITZ C.A', colX + 10 + firmaWidth, colY + 55, {
         width: firmaWidth,
         align: 'center'
       });

    colY += firmaHeight + 15;

    // Footer - Columna 2
    doc.moveTo(colX, colY)
       .lineTo(colX + columnWidth, colY)
       .lineWidth(1)
       .strokeColor('#dddddd')
       .stroke();
    
    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#666666')
       .text('FRITZ C.A - Sistema de Gestión de Usuarios', colX, colY + 10, {
         width: columnWidth,
         align: 'center'
       });
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