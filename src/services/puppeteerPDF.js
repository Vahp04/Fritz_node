import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('Iniciando generación de PDF en Windows Server...');
      
      // Configuración optimizada para Windows Server
      const browserOptions = {
        headless: 'new', // Usar el nuevo headless mode
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--font-render-hinting=none',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--single-process',
          '--max-old-space-size=2048', // Limitar memoria
          '--disable-extensions',
          '--disable-plugins',
          '--disable-translate',
          '--disable-default-apps',
          '--disable-component-extensions-with-background-pages'
        ],
        timeout: 180000, // Aumentar timeout a 3 minutos
        dumpio: true, // Ver logs detallados
        ignoreHTTPSErrors: true,
        executablePath: undefined // Inicialmente indefinido
      };

      // Búsqueda específica para Windows Server
      console.log('Buscando Microsoft Edge en Windows Server...');
      
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.PROGRAMFILES + '\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
      ];
      
      let edgeFound = false;
      for (const edgePath of edgePaths) {
        try {
          if (fs.existsSync(edgePath)) {
            browserOptions.executablePath = edgePath;
            console.log('✅ Edge encontrado en:', edgePath);
            edgeFound = true;
            
            // Verificar versión de Edge
            const version = await this.getEdgeVersion(edgePath);
            console.log(`✅ Versión de Edge: ${version}`);
            break;
          }
        } catch (error) {
          console.log('❌ Edge no encontrado en:', edgePath);
        }
      }
      
      // Si no encuentra Edge, usar Chromium de Puppeteer (más confiable)
      if (!edgeFound) {
        console.log('⚠️  Edge no encontrado, usando Chromium de Puppeteer...');
        delete browserOptions.executablePath;
        
        // Para Windows Server, agregar args específicos
        browserOptions.args.push(
          '--disable-windows10-custom-titlebar',
          '--disable-direct-write'
        );
      }

      console.log('Lanzando navegador con opciones:', {
        executablePath: browserOptions.executablePath || 'puppeteer-chromium',
        headless: browserOptions.headless,
        argsCount: browserOptions.args.length
      });

      browser = await puppeteer.launch(browserOptions);
      
      const page = await browser.newPage();
      
      // Configurar timeouts para Windows Server
      page.setDefaultTimeout(180000);
      page.setDefaultNavigationTimeout(180000);

      // Configurar viewport
      await page.setViewport({ 
        width: options.viewportWidth || 1200, 
        height: options.viewportHeight || 800 
      });

      // Manejar logs y errores de la página
      page.on('console', msg => {
        console.log('PAGE LOG:', msg.type(), msg.text());
      });

      page.on('pageerror', error => {
        console.error('❌ Page Error:', error);
      });

      page.on('response', response => {
        if (response.status() >= 400) {
          console.log('⚠️  Response:', response.status(), response.url());
        }
      });

      // Cargar contenido HTML
      console.log('Cargando contenido HTML...');
      
      try {
        await page.setContent(htmlContent, {
          waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
          timeout: 60000
        });
      } catch (contentError) {
        console.error('Error en setContent, intentando método alternativo...', contentError);
        
        // Método alternativo: usar archivo temporal
        const tempDir = process.env.TEMP || process.cwd();
        const tempFile = path.join(tempDir, `pdf_temp_${Date.now()}.html`);
        
        try {
          fs.writeFileSync(tempFile, htmlContent);
          console.log('Archivo temporal creado:', tempFile);
          
          const fileUrl = `file:///${tempFile.replace(/\\/g, '/')}`;
          await page.goto(fileUrl, {
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 60000
          });
          
          // Limpiar archivo temporal después de un tiempo
          setTimeout(() => {
            try {
              if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
                console.log('Archivo temporal eliminado');
              }
            } catch (e) {
              console.log('No se pudo eliminar archivo temporal:', e);
            }
          }, 10000);
          
        } catch (fileError) {
          console.error('Error con método de archivo temporal:', fileError);
          throw contentError; // Relanzar error original
        }
      }

      // Esperar a que todo esté listo
      console.log('Esperando a que recursos carguen...');
      
      try {
        await page.evaluateHandle('document.fonts.ready');
      } catch (fontError) {
        console.log('Fonts ready no disponible, continuando...');
      }

      // Esperar a que el documento esté completamente cargado
      await page.waitForFunction(
        () => document.readyState === 'complete',
        { timeout: 30000 }
      );

      // Esperar adicional para renderizado
      console.log('Esperando renderizado final...');
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Configuración de PDF para Windows
      const pdfOptions = {
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        omitBackground: false,
        timeout: 120000,
        margin: {
          top: options.marginTop || '20mm',
          right: options.marginRight || '15mm',
          bottom: options.marginBottom || '20mm',
          left: options.marginLeft || '15mm'
        }
      };

      console.log('Generando PDF...');
      const pdfBuffer = await page.pdf(pdfOptions);
      
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('El PDF generado está vacío');
      }

      console.log('✅ PDF generado exitosamente, tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('❌ Error detallado en generatePDF:', error);
      console.error('Stack trace:', error.stack);
      
      // Información específica para Windows Server
      if (error.message.includes('500') || error.message.includes('timeout')) {
        console.error('\n🔧 Soluciones para Windows Server:');
        console.error('1. Verificar que Edge esté instalado correctamente');
        console.error('2. Aumentar memoria del servidor si es necesario');
        console.error('3. Verificar permisos de ejecución');
        console.error('4. Probar con Chromium de Puppeteer (recomendado)');
      }
      
      throw new Error(`Error generando PDF: ${error.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('Navegador cerrado correctamente');
        } catch (closeError) {
          console.error('Error cerrando navegador:', closeError);
        }
      }
    }
  }

  // Método para obtener versión de Edge
  static async getEdgeVersion(edgePath) {
    try {
      const { execFile } = require('child_process');
      return new Promise((resolve) => {
        execFile(edgePath, ['--version'], (error, stdout) => {
          if (error) {
            resolve('No se pudo determinar');
          } else {
            resolve(stdout.trim());
          }
        });
      });
    } catch (error) {
      return 'No se pudo determinar';
    }
  }
}

export default PuppeteerPDF;