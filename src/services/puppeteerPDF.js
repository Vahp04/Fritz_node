import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('=== INICIANDO GENERACIÓN DE PDF ===');
      
      // Configuración mínima y segura para Windows Server
      const browserOptions = {
        headless: 'new', // Nuevo motor headless más estable
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox', 
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-translate',
          '--disable-extensions'
        ],
        ignoreHTTPSErrors: true,
        timeout: 30000
      };

      console.log('Lanzando Chromium incluido con Puppeteer...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Chromium lanzado exitosamente');

      const page = await browser.newPage();
      
      // Configurar timeouts realistas
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(15000);

      console.log('Configurando página...');
      await page.setViewport({ width: 1200, height: 800 });

      console.log('Cargando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 10000
      });

      console.log('Esperando renderizado...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('Generando PDF...');
      const pdfOptions = {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm', 
          left: '15mm'
        }
      };

      const pdfBuffer = await page.pdf(pdfOptions);
      
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('El PDF generado está vacío');
      }

      console.log(`PDF generado exitosamente - Tamaño: ${pdfBuffer.length} bytes`);
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR en generatePDF:', error);
      
      // Error más específico para debugging
      if (error.message.includes('Failed to launch')) {
        throw new Error('No se pudo iniciar el navegador. Verifica permisos en Windows Server.');
      } else if (error.message.includes('timeout')) {
        throw new Error('Timeout generando PDF. El servidor puede estar sobrecargado.');
      } else {
        throw error;
      }
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('Navegador cerrado');
        } catch (closeError) {
          console.error('Error cerrando navegador:', closeError);
        }
      }
    }
  }
}

export default PuppeteerPDF;