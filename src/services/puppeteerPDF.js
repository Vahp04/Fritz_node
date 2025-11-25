import puppeteer from 'puppeteer';
import fs from 'fs';

class PuppeteerPDF {
   static async generatePDF(htmlContent) {
    let browser = null;
    
    try {
      console.log('Iniciando generación de PDF...');
      
      // Configuración mínima - puppeteer usará su propio Chrome
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

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

      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error generando PDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
}

export default PuppeteerPDF;