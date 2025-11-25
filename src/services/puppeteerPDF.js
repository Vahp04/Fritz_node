// PuppeteerPDF.js - Con puppeteer normal
import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('=== INICIANDO GENERACIÓN DE PDF ===');
      
      // Configuración automática - puppeteer se encarga de todo
      const browserOptions = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
        timeout: 30000
      };

      console.log('Lanzando navegador...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Navegador lanzado');

      const page = await browser.newPage();
      
      console.log('Cargando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0'
      });

      await page.waitForTimeout(500);

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
      console.error('ERROR:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

export default PuppeteerPDF;