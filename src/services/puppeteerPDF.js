// playwrightPDF.js
import { chromium } from 'playwright';

class PlaywrightPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    
    try {
      console.log('=== GENERANDO PDF CON PLAYWRIGHT ===');

      const browserOptions = {
        headless: true
      };

      console.log('Lanzando browser con Playwright...');
      browser = await chromium.launch(browserOptions);
      console.log('Browser iniciado correctamente');

      const page = await browser.newPage();
      await page.setViewportSize({ width: 1200, height: 800 });

      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const pdfBuffer = await page.pdf({
        format: 'A4',
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      console.log('PDF generado exitosamente con Playwright');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
        console.log('Browser cerrado');
      }
    }
  }
}

export default PlaywrightPDF;