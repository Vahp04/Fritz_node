import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('Iniciando generación de PDF con Microsoft Edge...');
      
      const browserOptions = {
        headless: true,
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
          '--disable-renderer-backgrounding'
        ],
        timeout: 120000,
        dumpio: true
      };

      // Usar Microsoft Edge en lugar de Chrome
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ];
      
      for (const path of edgePaths) {
        try {
          const fs = require('fs');
          if (fs.existsSync(path)) {
            browserOptions.executablePath = path;
            console.log('Edge encontrado en:', path);
            break;
          }
        } catch (e) {
          console.log('Edge no encontrado en:', path);
        }
      }
      
      // Si no encuentra Edge, usar Chromium de Puppeteer
      if (!browserOptions.executablePath) {
        console.log('Usando Chromium incluido con Puppeteer');
      }

      console.log('Lanzando navegador con opciones:', browserOptions);
      browser = await puppeteer.launch(browserOptions);
      
      const page = await browser.newPage();
      page.setDefaultTimeout(120000);
      page.setDefaultNavigationTimeout(120000);

      await page.setViewport({ width: 1200, height: 800 });

      // Cargar contenido
      console.log('Cargando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: 30000
      });

      // Esperar a que todo cargue
      await page.evaluateHandle('document.fonts.ready');
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pdfOptions = {
        format: options.format || 'A4',
        landscape: options.landscape || false,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        omitBackground: false,
        timeout: 60000,
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

      console.log('PDF generado exitosamente con Edge, tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
    }
  }
}

export default PuppeteerPDF;