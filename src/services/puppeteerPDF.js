import puppeteer from 'puppeteer-core';
import fs from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    
    try {
      console.log('=== GENERANDO PDF (SIN USERDATADIR) ===');

      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];

      let executablePath = null;
      for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
          executablePath = chromePath;
          console.log('Chrome encontrado:', executablePath);
          break;
        }
      }

      if (!executablePath) {
        throw new Error('No se encontró Chrome instalado');
      }

      // SIN userDataDir para evitar conflictos
      const browserOptions = {
        headless: 'new',
        executablePath: executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-gpu',
          '--single-process'
        ],
        timeout: 30000
      };

      console.log('Lanzando browser sin userDataDir...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado correctamente');

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      await page.evaluateHandle('document.fonts.ready');
      await new Promise(resolve => setTimeout(resolve, 500));

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
      console.error('Error en generatePDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
        console.log('Browser cerrado');
      }
    }
  }
}

export default PuppeteerPDF;