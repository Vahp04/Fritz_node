import puppeteer from 'puppeteer';
import os from 'os';
import path from 'path';

class PuppeteerPDF {
  static browserInstance = null;
  static userDataDir = path.join(os.tmpdir(), 'puppeteer_shared_profile');

  static async getBrowser() {
    if (!PuppeteerPDF.browserInstance) {
      console.log('Iniciando nueva instancia de browser...');
      
      const browserOptions = {
        headless: true,
        userDataDir: PuppeteerPDF.userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--font-render-hinting=none',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--single-process'
        ],
        timeout: 60000
      };

      PuppeteerPDF.browserInstance = await puppeteer.launch(browserOptions);
      
      // Manejar cierre graceful
      process.on('beforeExit', async () => {
        if (PuppeteerPDF.browserInstance) {
          await PuppeteerPDF.browserInstance.close();
        }
      });
    }
    
    return PuppeteerPDF.browserInstance;
  }

  static async generatePDF(htmlContent, options = {}) {
    let page;
    try {
      console.log('Iniciando generación de PDF con Puppeteer...');
      
      const browser = await this.getBrowser();
      page = await browser.newPage();

      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(60000);

      try {
        await page.setContent(htmlContent, {
          waitUntil: ['load', 'networkidle0', 'domcontentloaded'],
          timeout: 60000
        });
      } catch (contentError) {
        console.warn('Error en setContent, continuando...', contentError.message);
      }

      try {
        await page.evaluateHandle('document.fonts.ready');
      } catch (fontError) {
        console.warn('Error cargando fuentes:', fontError.message);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

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

      console.log('Generando PDF buffer...');
      const pdfBuffer = await page.pdf(pdfOptions);
      
      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('El PDF generado está vacío');
      }

      console.log('PDF generado exitosamente, tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error);
      throw error;
    } finally {
      if (page) {
        await page.close().catch(console.error);
      }
    }
  }

  static async closeBrowser() {
    if (PuppeteerPDF.browserInstance) {
      await PuppeteerPDF.browserInstance.close();
      PuppeteerPDF.browserInstance = null;
    }
  }
}

export default PuppeteerPDF;