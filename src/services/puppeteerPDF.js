// PuppeteerPDF.js - Con ruta específica
import puppeteer from 'puppeteer';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('=== INICIANDO GENERACIÓN DE PDF ===');
      
      // Ruta EXACTA del Chrome instalado por Puppeteer
      const chromePath = 'C:\\Users\\Administrador\\.cache\\puppeteer\\chrome\\win64-142.0.7444.175\\chrome-win64\\chrome.exe';
      
      const browserOptions = {
        executablePath: chromePath, // ← Ruta específica
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-first-run',
          '--no-default-browser-check',
          '--single-process'
        ],
        timeout: 30000
      };

      console.log('Lanzando Chrome desde:', chromePath);
      browser = await puppeteer.launch(browserOptions);
      console.log('Chrome lanzado exitosamente');

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