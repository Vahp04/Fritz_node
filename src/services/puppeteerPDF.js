// PuppeteerPDF-simple.js - La solución más confiable
import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('=== USANDO CHROMIUM DE PUPPETEER ===');
      
      // Configuración mínima - Puppeteer usará su propio Chromium
      const browserOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--single-process'
        ],
        timeout: 30000
      };

      console.log('Lanzando Chromium de Puppeteer...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Chromium lanzado exitosamente');

      const page = await browser.newPage();
      page.setDefaultTimeout(15000);

      console.log('Cargando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 10000
      });

      console.log('Esperando renderizado...');
      await page.waitForTimeout(1000);

      console.log('Generando PDF...');
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      console.log(`PDF generado exitosamente - ${pdfBuffer.length} bytes`);
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR en generatePDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
    }
  }
}

export default PuppeteerPDF;