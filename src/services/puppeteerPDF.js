// PuppeteerPDF.js - VERSIÓN DEFINITIVA
import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('=== INICIANDO GENERACIÓN DE PDF ===');
      
      // Configuración específica para Windows Server
      const browserOptions = {
        headless: 'new', // Usar el nuevo motor headless
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--disable-background-timer-throttling'
        ],
        // Forzar cache en una ubicación accesible
        cacheDirectory: './node_modules/.cache/puppeteer',
        timeout: 60000
      };

      console.log('Lanzando Puppeteer con configuración Windows...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Puppeteer lanzado exitosamente');

      const page = await browser.newPage();
      
      // Configurar timeouts
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      console.log('Configurando vista...');
      await page.setViewport({ width: 1200, height: 800 });

      console.log('Cargando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
        timeout: 20000
      });

      console.log('Esperando recursos...');
      await page.waitForTimeout(2000);

      console.log('Generando PDF...');
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        },
        timeout: 30000
      });

      console.log(`PDF generado exitosamente - ${pdfBuffer.length} bytes`);
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR en generatePDF:', error);
      
      // Manejo específico de errores
      if (error.message.includes('Could not find')) {
        console.log('Ejecuta: npx puppeteer install');
        throw new Error('Chromium no encontrado. Ejecuta: npx puppeteer install');
      }
      throw error;
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